-- Preparación de entrega externa AeroSuite. NO envía correos ni WhatsApp.
-- Interruptor institucional desactivado y consentimiento personal desactivado por defecto.
-- En esta etapa SOLO se prepara una cola de correo, sin procesador activo.
CREATE TABLE IF NOT EXISTS public.aerosuite_external_delivery_settings(
 institution_id uuid PRIMARY KEY REFERENCES public.aerosuite_institutions(id) ON DELETE CASCADE,
 email_enabled boolean NOT NULL DEFAULT false,
 enabled_by uuid REFERENCES auth.users(id),
 enabled_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT external_delivery_enabled_ref CHECK(NOT email_enabled OR (enabled_by IS NOT NULL AND enabled_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.aerosuite_external_delivery_preferences(
 institution_id uuid NOT NULL REFERENCES public.aerosuite_institutions(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 email_opt_in boolean NOT NULL DEFAULT false,
 consent_at timestamptz,
 withdrawn_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(institution_id,user_id),
 CONSTRAINT external_preference_consistency CHECK(NOT email_opt_in OR consent_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.aerosuite_external_email_outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.aerosuite_institutions(id) ON DELETE CASCADE,
 notification_id uuid NOT NULL REFERENCES public.aerosuite_notification_inbox(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','claimed','sent','manual_review','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 claim_until timestamptz,
 provider_id text,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 changed_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT external_email_once UNIQUE(notification_id)
);
CREATE INDEX IF NOT EXISTS aerosuite_external_email_outbox_pending
 ON public.aerosuite_external_email_outbox(created_at)
 WHERE state='pending';
CREATE INDEX IF NOT EXISTS aerosuite_external_email_outbox_tenant
 ON public.aerosuite_external_email_outbox(institution_id,recipient_id,created_at DESC);
ALTER TABLE public.aerosuite_external_delivery_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aerosuite_external_delivery_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aerosuite_external_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aerosuite_external_delivery_settings,public.aerosuite_external_delivery_preferences,public.aerosuite_external_email_outbox FROM PUBLIC,anon,authenticated;
-- Sólo el backend con service_role puede procesar la cola, nunca las sesiones web.
GRANT SELECT,UPDATE ON public.aerosuite_external_email_outbox TO service_role;
GRANT SELECT ON public.aerosuite_external_delivery_settings,public.aerosuite_external_delivery_preferences TO service_role;

CREATE OR REPLACE FUNCTION public.aerosuite_my_email_preference(p_institution_id uuid,p_opt_in boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_actor uuid:=auth.uid();v_mode text;v_email boolean;v_delivery boolean;
BEGIN
 SELECT private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 INTO v_mode FROM public.aerosuite_institution_members m
 JOIN public.aerosuite_institutions i ON i.id=m.institution_id
 WHERE m.institution_id=p_institution_id AND m.user_id=v_actor
 AND m.role IN('administrador','secretaria','instructor','alumno','piloto') LIMIT 1;
 IF v_actor IS NULL OR v_mode IS NULL OR v_mode='blocked' THEN
  RAISE EXCEPTION 'Acceso no autorizado.' USING errcode='42501';END IF;
 IF p_opt_in IS NOT NULL THEN
  -- Revocar consentimiento siempre es posible, incluso en modo solo lectura.
  IF p_opt_in AND v_mode NOT IN ('trial','active') THEN
   RAISE EXCEPTION 'No pueden activarse nuevos envíos con licencia solo lectura.' USING errcode='42501';END IF;
  IF p_opt_in AND NOT EXISTS(
   SELECT 1 FROM auth.users u WHERE u.id=v_actor AND u.email_confirmed_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Necesitás confirmar tu correo antes de autorizar mensajes.' USING errcode='22023';END IF;
  INSERT INTO public.aerosuite_external_delivery_preferences
   (institution_id,user_id,email_opt_in,consent_at,withdrawn_at)
  VALUES(p_institution_id,v_actor,p_opt_in,
   CASE WHEN p_opt_in THEN now() ELSE NULL END,
   CASE WHEN p_opt_in THEN NULL ELSE now() END)
  ON CONFLICT(institution_id,user_id) DO UPDATE
   SET email_opt_in=EXCLUDED.email_opt_in,
       consent_at=CASE WHEN EXCLUDED.email_opt_in THEN now() ELSE NULL END,
       withdrawn_at=CASE WHEN EXCLUDED.email_opt_in THEN NULL ELSE now() END,
       updated_at=now();
  IF NOT p_opt_in THEN
   UPDATE public.aerosuite_external_email_outbox o
   SET state='cancelled',changed_at=now(),last_error='Consentimiento retirado antes del envío'
   WHERE o.institution_id=p_institution_id AND o.recipient_id=v_actor AND o.state='pending';
  END IF;
 END IF;
 SELECT p.email_opt_in INTO v_email FROM public.aerosuite_external_delivery_preferences p
 WHERE p.institution_id=p_institution_id AND p.user_id=v_actor;
 SELECT s.email_enabled INTO v_delivery FROM public.aerosuite_external_delivery_settings s
 JOIN public.aerosuite_institutions i ON i.id=s.institution_id
 WHERE s.institution_id=p_institution_id AND NOT i.is_test;
 RETURN jsonb_build_object('email_opt_in',coalesce(v_email,false),'external_delivery_active',coalesce(v_delivery,false),
  'delivery_currently_available',false,
  'note','La preferencia de correo no activa envíos: el servicio AeroSuite de correo sigue sin habilitar.');
END;$fn$;
REVOKE ALL ON FUNCTION public.aerosuite_my_email_preference(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aerosuite_my_email_preference(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_external_email_queue_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 INSERT INTO public.aerosuite_external_email_outbox(institution_id,notification_id,recipient_id)
 SELECT NEW.institution_id,NEW.id,NEW.recipient_id
 FROM public.aerosuite_external_delivery_settings s
 JOIN public.aerosuite_institutions i ON i.id=s.institution_id
 JOIN public.aerosuite_external_delivery_preferences p
   ON p.institution_id=s.institution_id AND p.user_id=NEW.recipient_id
 JOIN auth.users u ON u.id=p.user_id
 WHERE s.institution_id=NEW.institution_id AND s.email_enabled IS TRUE
   AND i.is_test IS NOT TRUE AND p.email_opt_in IS TRUE
   AND u.email_confirmed_at IS NOT NULL
   AND EXISTS(SELECT 1 FROM public.aerosuite_institution_members m
    WHERE m.institution_id=NEW.institution_id AND m.user_id=NEW.recipient_id)
 ON CONFLICT(notification_id) DO NOTHING;
 RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION aerosuite_internal.aerosuite_external_email_queue_trigger() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS aerosuite_external_email_queue_created ON public.aerosuite_notification_inbox;
CREATE TRIGGER aerosuite_external_email_queue_created
 AFTER INSERT ON public.aerosuite_notification_inbox
 FOR EACH ROW EXECUTE FUNCTION aerosuite_internal.aerosuite_external_email_queue_trigger();

-- Una baja definitiva de la institución cancela lo pendiente y elimina las preferencias.
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_external_clear_departed_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.aerosuite_institution_members m
    WHERE m.institution_id=OLD.institution_id AND m.user_id=OLD.user_id) THEN
  UPDATE public.aerosuite_external_email_outbox o
  SET state='cancelled',last_error='Destinatario desvinculado',changed_at=now()
  WHERE o.institution_id=OLD.institution_id AND o.recipient_id=OLD.user_id
   AND o.state='pending';
  DELETE FROM public.aerosuite_external_delivery_preferences p
  WHERE p.institution_id=OLD.institution_id AND p.user_id=OLD.user_id;
 END IF;
 RETURN OLD;
END;$fn$;
REVOKE ALL ON FUNCTION aerosuite_internal.aerosuite_external_clear_departed_member() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS aerosuite_external_clear_departed_member ON public.aerosuite_institution_members;
CREATE TRIGGER aerosuite_external_clear_departed_member
 AFTER DELETE ON public.aerosuite_institution_members
 FOR EACH ROW EXECUTE FUNCTION aerosuite_internal.aerosuite_external_clear_departed_member();
