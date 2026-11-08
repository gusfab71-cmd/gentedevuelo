-- AeroSuite: avisos internos institucionales, sin envío a canales externos.
-- Los eventos se registran al guardar reservas e informes, sin enviar emails ni WhatsApp.
-- Los destinatarios y los datos se limitan a miembros de la misma institución.
CREATE TABLE IF NOT EXISTS public.aerosuite_notification_inbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.aerosuite_institutions(id) ON DELETE CASCADE,
 event_id uuid NOT NULL,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 event_type text NOT NULL CHECK(event_type IN (
  'booking_pending','booking_confirmed','booking_cancelled','booking_completed',
  'booking_rescheduled','booking_instructor_updated','booking_aircraft_updated',
  'report_submitted','report_returned','report_approved','report_voided')),
 source_type text NOT NULL CHECK(source_type IN ('booking','report')),
 source_id uuid NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 140),
 detail text NOT NULL DEFAULT '' CHECK(length(detail)<=320),
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz,
 CONSTRAINT aerosuite_notification_per_recipient_unique UNIQUE(institution_id,event_id,recipient_id)
);
CREATE INDEX IF NOT EXISTS aerosuite_notification_recipient_idx
 ON public.aerosuite_notification_inbox(institution_id,recipient_id,created_at DESC);
CREATE INDEX IF NOT EXISTS aerosuite_notification_unread_idx
 ON public.aerosuite_notification_inbox(institution_id,recipient_id,created_at DESC)
 WHERE read_at IS NULL;
ALTER TABLE public.aerosuite_notification_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aerosuite_notification_inbox FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_queue_notification_inbox(
 p_institution_id uuid,p_event_type text,p_source_type text,p_source_id uuid,
 p_student_id uuid,p_instructor_id uuid,p_title text,p_detail text DEFAULT ''
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_event_id uuid:=gen_random_uuid();v_queued integer:=0;
BEGIN
 IF p_event_type IS NULL OR p_source_id IS NULL OR p_institution_id IS NULL THEN RETURN 0;END IF;
 -- Event data must originate from the database trigger, not a client-supplied RPC.
 INSERT INTO public.aerosuite_notification_inbox(institution_id,event_id,recipient_id,event_type,
   source_type,source_id,title,detail)
 SELECT p_institution_id,v_event_id,m.user_id,p_event_type,p_source_type,p_source_id,
   left(p_title,140),left(coalesce(p_detail,''),320)
 FROM public.aerosuite_institution_members m
 WHERE m.institution_id=p_institution_id AND
  (m.role IN ('administrador','secretaria') OR
   (m.user_id=p_student_id AND m.role IN ('alumno','piloto')) OR
   (m.user_id=p_instructor_id AND m.role='instructor'))
 ON CONFLICT(institution_id,event_id,recipient_id) DO NOTHING;
 GET DIAGNOSTICS v_queued=ROW_COUNT;
 RETURN v_queued;
END;
$fn$;
REVOKE ALL ON FUNCTION aerosuite_internal.aerosuite_queue_notification_inbox(
 uuid,text,text,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_notification_booking_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_event text;v_title text;
BEGIN
 IF TG_OP='INSERT' THEN
   v_event:=CASE NEW.status WHEN 'pending' THEN 'booking_pending'
      WHEN 'confirmed' THEN 'booking_confirmed' ELSE NULL END;
 ELSE
   IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event:=CASE NEW.status
      WHEN 'pending' THEN 'booking_pending'
      WHEN 'confirmed' THEN 'booking_confirmed'
      WHEN 'cancelled' THEN 'booking_cancelled'
      WHEN 'completed' THEN 'booking_completed' ELSE NULL END;
   ELSIF NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
    v_event:='booking_rescheduled';
   ELSIF NEW.instructor_id IS DISTINCT FROM OLD.instructor_id THEN
    v_event:='booking_instructor_updated';
   ELSIF NEW.aircraft IS DISTINCT FROM OLD.aircraft THEN
    v_event:='booking_aircraft_updated';
   END IF;
 END IF;
 IF v_event IS NULL THEN RETURN NEW;END IF;
 v_title:=CASE v_event
  WHEN 'booking_pending' THEN 'Reserva pendiente'
  WHEN 'booking_confirmed' THEN 'Vuelo confirmado'
  WHEN 'booking_cancelled' THEN 'Reserva cancelada'
  WHEN 'booking_completed' THEN 'Vuelo completado'
  WHEN 'booking_rescheduled' THEN 'Cambio de horario de vuelo'
  WHEN 'booking_instructor_updated' THEN 'Cambio de instructor'
  WHEN 'booking_aircraft_updated' THEN 'Cambio de aeronave' END;
 PERFORM aerosuite_internal.aerosuite_queue_notification_inbox(
  NEW.institution_id,v_event,'booking',NEW.id,NEW.student_id,NEW.instructor_id,
  v_title,'Revisá los detalles actualizados en la turnera de tu escuela.');
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 -- Una falla en la campana interna NO puede impedir reservar, cancelar o confirmar.
 RAISE WARNING 'AeroSuite notifications: booking event could not be queued (%).', SQLSTATE;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION aerosuite_internal.aerosuite_notification_booking_trigger() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS aerosuite_notification_booking_changed ON public.aerosuite_flight_bookings;
CREATE TRIGGER aerosuite_notification_booking_changed
 AFTER INSERT OR UPDATE OF status,starts_at,instructor_id,aircraft
 ON public.aerosuite_flight_bookings
 FOR EACH ROW EXECUTE FUNCTION aerosuite_internal.aerosuite_notification_booking_trigger();

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_notification_report_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_event text;v_title text;v_student uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  v_event:=CASE NEW.status WHEN 'submitted' THEN 'report_submitted' ELSE NULL END;
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  v_event:=CASE NEW.status
   WHEN 'submitted' THEN 'report_submitted'
   WHEN 'returned' THEN 'report_returned'
   WHEN 'approved' THEN 'report_approved'
   WHEN 'voided' THEN 'report_voided'
   ELSE NULL END;
 END IF;
 IF v_event IS NULL THEN RETURN NEW;END IF;
 SELECT b.student_id INTO v_student FROM public.aerosuite_flight_bookings b
 WHERE b.id=NEW.booking_id AND b.institution_id=NEW.institution_id;
 IF v_student IS NULL THEN RETURN NEW;END IF;
 v_title:=CASE v_event WHEN 'report_submitted' THEN 'Informe presentado'
  WHEN 'report_returned' THEN 'Informe devuelto para corrección'
  WHEN 'report_approved' THEN 'Informe de vuelo aprobado'
  WHEN 'report_voided' THEN 'Informe anulado' END;
 PERFORM aerosuite_internal.aerosuite_queue_notification_inbox(
  NEW.institution_id,v_event,'report',NEW.id,v_student,NEW.instructor_id,
  v_title,'Consultá el informe desde tu portal institucional.');
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'AeroSuite notifications: report event could not be queued (%).', SQLSTATE;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION aerosuite_internal.aerosuite_notification_report_trigger() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS aerosuite_notification_report_changed ON public.aerosuite_flight_reports;
CREATE TRIGGER aerosuite_notification_report_changed
 AFTER INSERT OR UPDATE OF status ON public.aerosuite_flight_reports
 FOR EACH ROW EXECUTE FUNCTION aerosuite_internal.aerosuite_notification_report_trigger();

CREATE OR REPLACE FUNCTION public.aerosuite_notification_inbox_list(
 p_institution_id uuid,p_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_actor uuid:=auth.uid();v_items jsonb;v_unread bigint;
BEGIN
 IF v_actor IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.aerosuite_institution_members m
  JOIN public.aerosuite_institutions i ON i.id=m.institution_id
  WHERE m.institution_id=p_institution_id AND m.user_id=v_actor
   AND m.role IN ('administrador','secretaria','instructor','alumno','piloto')
   AND private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())<>'blocked'
 ) THEN RAISE EXCEPTION 'No tenés acceso a los avisos de esta institución.' USING errcode='42501';END IF;
 SELECT count(*) INTO v_unread FROM public.aerosuite_notification_inbox n
 WHERE n.institution_id=p_institution_id AND n.recipient_id=v_actor AND n.read_at IS NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC),'[]'::jsonb) INTO v_items
 FROM (
   SELECT n.id,n.event_type,n.source_type,n.source_id,n.title,n.detail,n.created_at,n.read_at
   FROM public.aerosuite_notification_inbox n
   WHERE n.institution_id=p_institution_id AND n.recipient_id=v_actor
   ORDER BY n.created_at DESC,n.id DESC
   LIMIT least(greatest(coalesce(p_limit,30),1),100)
 ) t;
 RETURN jsonb_build_object('items',v_items,'unread',v_unread,'delivery','in_app_only');
END;
$fn$;
REVOKE ALL ON FUNCTION public.aerosuite_notification_inbox_list(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aerosuite_notification_inbox_list(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.aerosuite_notification_mark_read(
 p_institution_id uuid,p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_actor uuid:=auth.uid();v_count integer;v_ids uuid[];
BEGIN
 IF v_actor IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.aerosuite_institution_members m
  JOIN public.aerosuite_institutions i ON i.id=m.institution_id
  WHERE m.institution_id=p_institution_id AND m.user_id=v_actor
   AND m.role IN ('administrador','secretaria','instructor','alumno','piloto')
   AND private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())<>'blocked'
 ) THEN RAISE EXCEPTION 'No tenés permiso para modificar estos avisos.' USING errcode='42501';END IF;
 v_ids:=coalesce(p_ids,array[]::uuid[]);
 IF cardinality(v_ids)>100 OR array_position(v_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Selección de avisos inválida.' USING errcode='22023';END IF;
 UPDATE public.aerosuite_notification_inbox n SET read_at=now()
 WHERE n.institution_id=p_institution_id AND n.recipient_id=v_actor
   AND n.id=ANY(v_ids) AND n.read_at IS NULL;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'marked',v_count);
END;
$fn$;
REVOKE ALL ON FUNCTION public.aerosuite_notification_mark_read(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aerosuite_notification_mark_read(uuid,uuid[]) TO authenticated;
