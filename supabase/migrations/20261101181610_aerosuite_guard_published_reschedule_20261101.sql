CREATE OR REPLACE FUNCTION public.aerosuite_reschedule_booking(p_institution_id uuid, p_booking_id uuid, p_new_starts_at timestamp with time zone, p_student_authorized boolean, p_authorization_channel text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid := auth.uid();
 v_role text;
 v_mode text;
 v_booking public.aerosuite_flight_bookings%rowtype;
 v_before jsonb;
 v_new_local timestamp;
 v_channel text := lower(btrim(coalesce(p_authorization_channel,'')));
 v_reason text := btrim(coalesce(p_reason,''));
BEGIN
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'Debés ingresar con tu cuenta institucional.' USING errcode='42501';
 END IF;
 SELECT m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 INTO v_role,v_mode
 FROM public.aerosuite_institution_members m
 JOIN public.aerosuite_institutions i ON i.id=m.institution_id
 WHERE m.institution_id=p_institution_id AND m.user_id=v_actor
 AND m.role IN ('administrador','secretaria')
 LIMIT 1;
 IF v_role IS NULL THEN
  RAISE EXCEPTION 'Solo Dirección o Secretaría pueden reprogramar turnos.' USING errcode='42501';
 END IF;
 IF v_mode NOT IN ('trial','grace','active') THEN
  RAISE EXCEPTION 'La institución está en modo consulta.' USING errcode='42501';
 END IF;
 IF p_student_authorized IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Registrá la autorización previa del alumno.' USING errcode='22023';
 END IF;
 IF v_channel NOT IN ('presencial','telefono','whatsapp','correo','otro') THEN
  RAISE EXCEPTION 'Indicá cómo autorizó el alumno el cambio.' USING errcode='22023';
 END IF;
 IF length(v_reason)<5 OR length(v_reason)>250 THEN
  RAISE EXCEPTION 'Indicá el motivo del cambio (5 a 250 caracteres).' USING errcode='22023';
 END IF;
 IF p_new_starts_at IS NULL OR p_new_starts_at<=now()
 OR p_new_starts_at>now()+interval '90 days' THEN
  RAISE EXCEPTION 'Elegí un turno futuro dentro de los próximos 90 días.' USING errcode='22023';
 END IF;
 v_new_local := p_new_starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires';
 IF v_new_local::time NOT IN (
  time '08:00',time '09:30',time '11:00',time '12:30',
  time '14:00',time '15:30',time '17:00',time '18:30'
 ) THEN
  RAISE EXCEPTION 'El horario debe corresponder a la grilla de 90 minutos.' USING errcode='22023';
 END IF;
 -- Mismo cerrojo de institución utilizado por el resto de la turnera.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 SELECT * INTO v_booking FROM public.aerosuite_flight_bookings
 WHERE id=p_booking_id AND institution_id=p_institution_id FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'No existe el turno en esta institución.' USING errcode='P0002';
 END IF;
 IF EXISTS (SELECT 1 FROM public.aerosuite_activity_reservations r WHERE r.booking_id=p_booking_id) THEN
  RAISE EXCEPTION 'Este vuelo pertenece a la agenda publicada. Reprogramalo desde el panel de Secretaría, conservando su cupo.' USING errcode='22023';
 END IF;
 IF v_booking.status NOT IN ('pending','confirmed') OR v_booking.starts_at<=now() THEN
  RAISE EXCEPTION 'Solo pueden reprogramarse turnos futuros pendientes o confirmados.' USING errcode='22023';
 END IF;
 IF v_booking.starts_at=p_new_starts_at THEN
  RAISE EXCEPTION 'Seleccioná un día u horario distinto.' USING errcode='22023';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.aerosuite_flight_reports r WHERE r.booking_id=v_booking.id
 ) THEN
  RAISE EXCEPTION 'La reserva ya tiene un informe; no puede reprogramarse.' USING errcode='22023';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.aerosuite_flight_bookings b
  WHERE b.institution_id=p_institution_id AND b.id<>v_booking.id
   AND b.status<>'cancelled'
   AND tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)')
    && tstzrange(p_new_starts_at,p_new_starts_at+interval '90 minutes','[)')
 ) THEN
  RAISE EXCEPTION 'El nuevo horario ya está ocupado. Elegí otro.' USING errcode='23505';
 END IF;
 v_before := to_jsonb(v_booking);
 -- Se conserva el identificador y alumno de la reserva. Se requiere una nueva
 -- confirmación de instructor para no asumir disponibilidad en el nuevo horario.
 UPDATE public.aerosuite_flight_bookings
 SET starts_at=p_new_starts_at, status='pending',instructor_id=NULL,aircraft='',
  updated_by=v_actor,updated_at=now()
 WHERE id=v_booking.id;
 INSERT INTO public.aerosuite_flight_booking_audit(
   institution_id,booking_id,actor_id,event,before_data,after_data
 )
 SELECT p_institution_id,v_booking.id,v_actor,'rescheduled',v_before,
   to_jsonb(b)||jsonb_build_object(
    'authorized_by_student',true,'authorization_channel',v_channel,
    'rescheduling_reason',v_reason,'previous_starts_at',v_booking.starts_at,
    'previous_status',v_booking.status
   )
 FROM public.aerosuite_flight_bookings b WHERE b.id=v_booking.id;
 RETURN jsonb_build_object('ok',true,'booking_id',v_booking.id,
  'student_id',v_booking.student_id,'new_status','pending',
  'new_starts_at',p_new_starts_at,'previous_starts_at',v_booking.starts_at);
END
$function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_reschedule_booking_with_instructor(p_institution_id uuid, p_booking_id uuid, p_new_starts_at timestamp with time zone, p_student_authorized boolean, p_authorization_channel text, p_reason text, p_instructor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid := auth.uid();
 v_role text;
 v_mode text;
 v_booking public.aerosuite_flight_bookings%rowtype;
 v_before jsonb;
 v_instructor uuid := p_instructor_id;
 v_new_local timestamp;
 v_channel text := lower(btrim(coalesce(p_authorization_channel,'')));
 v_reason text := btrim(coalesce(p_reason,''));
BEGIN
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'Debés ingresar con tu cuenta institucional.' USING errcode='42501';
 END IF;
 SELECT m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 INTO v_role,v_mode
 FROM public.aerosuite_institution_members m
 JOIN public.aerosuite_institutions i ON i.id=m.institution_id
 WHERE m.institution_id=p_institution_id AND m.user_id=v_actor
 AND m.role IN ('administrador','secretaria')
 LIMIT 1;
 IF v_role IS NULL THEN
  RAISE EXCEPTION 'Solo Dirección o Secretaría pueden reprogramar turnos.' USING errcode='42501';
 END IF;
 IF v_mode NOT IN ('trial','grace','active') THEN
  RAISE EXCEPTION 'La institución está en modo consulta.' USING errcode='42501';
 END IF;
 IF p_student_authorized IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Registrá la autorización previa del alumno.' USING errcode='22023';
 END IF;
 IF v_channel NOT IN ('presencial','telefono','whatsapp','correo','otro') THEN
  RAISE EXCEPTION 'Indicá cómo autorizó el alumno el cambio.' USING errcode='22023';
 END IF;
 IF length(v_reason)<5 OR length(v_reason)>250 THEN
  RAISE EXCEPTION 'Indicá el motivo del cambio (5 a 250 caracteres).' USING errcode='22023';
 END IF;
 IF p_new_starts_at IS NULL OR p_new_starts_at<=now()
 OR p_new_starts_at>now()+interval '90 days' THEN
  RAISE EXCEPTION 'Elegí un turno futuro dentro de los próximos 90 días.' USING errcode='22023';
 END IF;
 v_new_local := p_new_starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires';
 IF v_new_local::time NOT IN (
  time '08:00',time '09:30',time '11:00',time '12:30',
  time '14:00',time '15:30',time '17:00',time '18:30'
 ) THEN
  RAISE EXCEPTION 'El horario debe corresponder a la grilla de 90 minutos.' USING errcode='22023';
 END IF;
 -- Mismo cerrojo de institución utilizado por el resto de la turnera.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 SELECT * INTO v_booking FROM public.aerosuite_flight_bookings
 WHERE id=p_booking_id AND institution_id=p_institution_id FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'No existe el turno en esta institución.' USING errcode='P0002';
 END IF;
 IF EXISTS (SELECT 1 FROM public.aerosuite_activity_reservations r WHERE r.booking_id=p_booking_id) THEN
  RAISE EXCEPTION 'Este vuelo pertenece a la agenda publicada. Reprogramalo desde el panel de Secretaría, conservando su cupo.' USING errcode='22023';
 END IF;
 IF v_booking.status NOT IN ('pending','confirmed') OR v_booking.starts_at<=now() THEN
  RAISE EXCEPTION 'Solo pueden reprogramarse turnos futuros pendientes o confirmados.' USING errcode='22023';
 END IF;
 IF v_booking.starts_at=p_new_starts_at THEN
  RAISE EXCEPTION 'Seleccioná un día u horario distinto.' USING errcode='22023';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.aerosuite_flight_reports r WHERE r.booking_id=v_booking.id
 ) THEN
  RAISE EXCEPTION 'La reserva ya tiene un informe; no puede reprogramarse.' USING errcode='22023';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.aerosuite_flight_bookings b
  WHERE b.institution_id=p_institution_id AND b.id<>v_booking.id
   AND b.status<>'cancelled'
   AND tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)')
    && tstzrange(p_new_starts_at,p_new_starts_at+interval '90 minutes','[)')
 ) THEN
  RAISE EXCEPTION 'El nuevo horario ya está ocupado. Elegí otro.' USING errcode='23505';
 END IF;
 IF v_instructor IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM public.aerosuite_institution_members m
    WHERE m.institution_id=p_institution_id AND m.user_id=v_instructor AND m.role='instructor') THEN
   RAISE EXCEPTION 'El Instructor elegido no pertenece a esta institución.' USING errcode='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('aerosuite_instructor_' || v_instructor::text,0));
  IF EXISTS (
    SELECT 1 FROM public.aerosuite_flight_bookings b
    WHERE b.id<>v_booking.id AND b.instructor_id=v_instructor
    AND b.status IN ('confirmed','completed')
    AND tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)')
        && tstzrange(p_new_starts_at,p_new_starts_at+interval '90 minutes','[)')
  ) THEN
   RAISE EXCEPTION 'El Instructor ya tiene un turno confirmado en ese horario.' USING errcode='23505';
  END IF;
 END IF;
 v_before := to_jsonb(v_booking);
 -- Se conserva el identificador y alumno de la reserva. Se requiere una nueva
 -- confirmación de instructor para no asumir disponibilidad en el nuevo horario.
 UPDATE public.aerosuite_flight_bookings
 SET starts_at=p_new_starts_at, status='pending',instructor_id=v_instructor,aircraft='',
  updated_by=v_actor,updated_at=now()
 WHERE id=v_booking.id;
 INSERT INTO public.aerosuite_flight_booking_audit(
   institution_id,booking_id,actor_id,event,before_data,after_data
 )
 SELECT p_institution_id,v_booking.id,v_actor,'rescheduled',v_before,
   to_jsonb(b)||jsonb_build_object(
    'authorized_by_student',true,'authorization_channel',v_channel,
    'rescheduling_reason',v_reason,'previous_starts_at',v_booking.starts_at,
    'previous_status',v_booking.status,'instructor_preassigned',v_instructor IS NOT NULL
   )
 FROM public.aerosuite_flight_bookings b WHERE b.id=v_booking.id;
 RETURN jsonb_build_object('ok',true,'booking_id',v_booking.id,
  'student_id',v_booking.student_id,'new_status','pending',
  'new_starts_at',p_new_starts_at,'previous_starts_at',v_booking.starts_at,'instructor_preassigned',v_instructor IS NOT NULL);
END
$function$
;

