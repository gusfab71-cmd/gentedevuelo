-- Aviso privado a la administración por cada nuevo integrante registrado correctamente.
-- Se evita notificar registros Google incompletos, usuarios sin correo confirmado
-- y altas duplicadas. La cola existente conserva trazabilidad y el envío se
-- realiza exclusivamente desde la Edge Function autenticada.

ALTER TABLE public.gdv_email_outbox
  DROP CONSTRAINT IF EXISTS gdv_email_outbox_kind_check;
ALTER TABLE public.gdv_email_outbox
  ADD CONSTRAINT gdv_email_outbox_kind_check
  CHECK (kind IN ('welcome', 'announcement', 'moderation', 'registration'));

CREATE UNIQUE INDEX IF NOT EXISTS gdv_email_registration_once
  ON public.gdv_email_outbox(user_id) WHERE kind = 'registration';

CREATE OR REPLACE FUNCTION gdv_private.queue_completed_registration(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $body$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users AS u
    JOIN public.profiles AS p ON p.id = u.id
    WHERE u.id = p_user_id
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
      AND p.onboarding_completed IS TRUE
      AND length(btrim(coalesce(p.username, ''))) >= 3
      AND p.username !~* '^piloto_[0-9a-f]{12}$'
      AND (
        NOT EXISTS (
          SELECT 1 FROM auth.identities i
          WHERE i.user_id = u.id AND i.provider = 'google'
        )
        OR (
          length(btrim(coalesce(p.full_name, ''))) >= 2
          AND length(btrim(coalesce(p.aviation_role, ''))) >= 3
          AND coalesce(p.avatar_url, '') ~ (
            '^https://media[.]gentedevuelo[.]com/imagenes/' ||
            p.id::text ||
            '/[0-9a-f-]{36}[.](jpg|png|webp)$'
          )
        )
      )
  ) THEN
    INSERT INTO public.gdv_email_outbox(kind, user_id, subject, body, source_table, source_id)
    VALUES (
      'registration', p_user_id, 'Nuevo integrante registrado en Gente de Vuelo',
      'Una persona completó correctamente su inscripción a Gente de Vuelo.',
      'profiles', p_user_id::text
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$body$;

REVOKE ALL ON FUNCTION gdv_private.queue_completed_registration(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION gdv_private.queue_registration_after_auth()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $body$
BEGIN
  IF new.email_confirmed_at IS NOT NULL AND new.deleted_at IS NULL
     AND (TG_OP = 'INSERT' OR old.email_confirmed_at IS NULL) THEN
    PERFORM gdv_private.queue_completed_registration(new.id);
  END IF;
  RETURN new;
END;
$body$;

REVOKE ALL ON FUNCTION gdv_private.queue_registration_after_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gdv_auth_new_member_email ON auth.users;
CREATE TRIGGER gdv_auth_new_member_email
AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION gdv_private.queue_registration_after_auth();

CREATE OR REPLACE FUNCTION gdv_private.queue_registration_after_profile()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $body$
BEGIN
  IF new.onboarding_completed IS TRUE
     AND (TG_OP = 'INSERT' OR old.onboarding_completed IS DISTINCT FROM TRUE) THEN
    PERFORM gdv_private.queue_completed_registration(new.id);
  END IF;
  RETURN new;
END;
$body$;

REVOKE ALL ON FUNCTION gdv_private.queue_registration_after_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gdv_profile_new_member_email ON public.profiles;
CREATE TRIGGER gdv_profile_new_member_email
AFTER INSERT OR UPDATE OF onboarding_completed ON public.profiles
FOR EACH ROW EXECUTE FUNCTION gdv_private.queue_registration_after_profile();

-- Solo el worker con service_role puede tomar correos privados de alta.
CREATE OR REPLACE FUNCTION public.gdv_email_claim_registration(p_limit integer DEFAULT 5)
RETURNS TABLE(id uuid, user_id uuid, subject text, body text)
LANGUAGE plpgsql
SET search_path = ''
AS $body$
DECLARE r public.gdv_email_outbox%rowtype;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Restricted delivery';
  END IF;

  FOR r IN
    SELECT q.* FROM public.gdv_email_outbox AS q
    JOIN auth.users u ON u.id = q.user_id
    JOIN public.profiles p ON p.id = q.user_id
    WHERE q.kind = 'registration'
      AND (q.status = 'pending' OR (q.status = 'failed' AND q.attempts < 3))
      AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
      AND p.onboarding_completed IS TRUE
    ORDER BY q.created_at
    FOR UPDATE OF q SKIP LOCKED
    LIMIT LEAST(GREATEST(coalesce(p_limit, 1), 1), 10)
  LOOP
    UPDATE public.gdv_email_outbox AS q
    SET status = 'sending', attempts = attempts + 1
    WHERE q.id = r.id;
    RETURN QUERY SELECT r.id, r.user_id, r.subject, r.body;
  END LOOP;
END;
$body$;

REVOKE ALL ON FUNCTION public.gdv_email_claim_registration(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gdv_email_claim_registration(integer) TO service_role;
