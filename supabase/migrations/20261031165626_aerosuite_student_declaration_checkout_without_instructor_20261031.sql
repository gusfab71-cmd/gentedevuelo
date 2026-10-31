-- AeroSuite · Cobro de horas informado por el alumno, sin informe previo del instructor.
-- Esquema: funciones internas privilegiadas con autorización explícita por institución.
-- Se conserva el wrapper expuesto, los locks para prevenir doble cobro, y el cotejo posterior.
-- Aplicado originalmente en Supabase con la versión 20261031165626.
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_checkout_flight_at_desk(p_institution_id uuid, p_booking_id uuid, p_book_minutes integer, p_mode text, p_pack_id uuid DEFAULT NULL::uuid, p_amount numeric DEFAULT NULL::numeric, p_currency text DEFAULT 'ARS'::text, p_bank_ref text DEFAULT ''::text, p_fiscal_ref text DEFAULT ''::text, p_note text DEFAULT ''::text, p_request_id uuid DEFAULT NULL::uuid, p_book_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();v_role text;v_license text;
 v_booking public.aerosuite_flight_bookings%ROWTYPE;
 v_report public.aerosuite_flight_reports%ROWTYPE;
 v_pack public.aerosuite_hour_packs%ROWTYPE;
 v_old public.aerosuite_flight_checkouts%ROWTYPE;
 v_existing_money uuid;
 v_amount_id uuid;v_usage_id uuid;v_checkout_id uuid;
 v_used integer;
BEGIN
 SELECT m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 INTO v_role,v_license
 FROM public.aerosuite_institution_members m JOIN public.aerosuite_institutions i ON i.id=m.institution_id
 WHERE m.institution_id=p_institution_id AND m.user_id=v_actor AND m.role IN('administrador','secretaria');
 IF v_role IS NULL OR v_actor IS NULL OR v_license NOT IN('trial','grace','active') THEN
  RAISE EXCEPTION 'Solo Dirección o Secretaría pueden cobrar vuelos.' USING errcode='42501';
 END IF;
 -- p_book_confirmed=true: Secretaría cotejó el Libro de Vuelo firmado.
 -- p_book_confirmed=false: tiempo informado por el alumno al pagar o descontar su pack.
 -- Esta vía NO implica informe del instructor ni validación de horas de vuelo.
 IF p_booking_id IS NULL OR p_book_minutes NOT BETWEEN 1 AND 600 OR p_mode NOT IN('pack','cash','bank_transfer')
 OR length(coalesce(p_bank_ref,''))>120 OR length(coalesce(p_fiscal_ref,''))>120 OR length(coalesce(p_note,''))>500 THEN
  RAISE EXCEPTION 'Verificá el vuelo, los minutos, la forma de pago y los datos ingresados.' USING errcode='22023';
 END IF;
 -- Serializar todas las liquidaciones del mismo vuelo para evitar doble cobro.
 SELECT * INTO v_booking FROM public.aerosuite_flight_bookings b
 WHERE b.id=p_booking_id AND b.institution_id=p_institution_id FOR UPDATE;
 IF NOT FOUND OR v_booking.status NOT IN('pending','confirmed','completed') OR v_booking.starts_at>now() THEN
  RAISE EXCEPTION 'La reserva debe existir, haber comenzado y no estar cancelada. No se pueden liquidar reservas futuras.' USING errcode='22023';
 END IF;
 SELECT * INTO v_report FROM public.aerosuite_flight_reports r
 WHERE r.booking_id=p_booking_id AND r.institution_id=p_institution_id;
 IF FOUND AND v_report.status='voided' THEN
  RAISE EXCEPTION 'El informe fue anulado. Este vuelo requiere revisión administrativa.' USING errcode='22023';
 END IF;
 SELECT * INTO v_old FROM public.aerosuite_flight_checkouts
 WHERE booking_id=p_booking_id AND institution_id=p_institution_id;
 IF FOUND THEN
  IF v_old.book_minutes<>p_book_minutes OR v_old.method<>p_mode OR
     (p_mode='pack' AND (p_pack_id IS NULL OR
        NOT EXISTS(SELECT 1 FROM public.aerosuite_pack_usages u
         WHERE u.id=v_old.pack_usage_id AND u.pack_id=p_pack_id))) THEN
   RAISE EXCEPTION 'Este vuelo ya tiene liquidación. No se puede cobrar o descontar otra vez.' USING errcode='22023';
  END IF;
  RETURN jsonb_build_object('ok',true,'already_registered',true,'checkout_id',v_old.id,
    'minutes',v_old.book_minutes,'report_pending',v_report.id IS NULL OR v_report.status<>'approved');
 END IF;
 IF EXISTS(SELECT 1 FROM public.aerosuite_money_movements m WHERE m.booking_id=p_booking_id AND m.movement_type='hour_payment')
 OR EXISTS(SELECT 1 FROM public.aerosuite_pack_usages u WHERE u.booking_id=p_booking_id) THEN
  RAISE EXCEPTION 'Este vuelo ya fue cobrado o descontado antes de implementar este circuito. No se puede registrar nuevamente.' USING errcode='22023';
 END IF;
 IF p_mode='pack' THEN
  IF p_pack_id IS NULL OR (p_amount IS NOT NULL AND p_amount<>0) THEN
   RAISE EXCEPTION 'Para descontar un pack elegí el pack y no ingreses un cobro adicional.' USING errcode='22023';
  END IF;
  SELECT * INTO v_pack FROM public.aerosuite_hour_packs p
  WHERE p.id=p_pack_id AND p.institution_id=p_institution_id FOR UPDATE;
  IF NOT FOUND OR v_pack.student_id<>v_booking.student_id THEN
   RAISE EXCEPTION 'El pack seleccionado no corresponde al alumno.' USING errcode='42501';
  END IF;
  SELECT coalesce(sum(u.minutes),0) INTO v_used FROM public.aerosuite_pack_usages u
  WHERE u.pack_id=v_pack.id;
  IF v_used+p_book_minutes>v_pack.total_minutes THEN
   RAISE EXCEPTION 'El pack no tiene horas suficientes.' USING errcode='22023';
  END IF;
  INSERT INTO public.aerosuite_pack_usages(institution_id,pack_id,booking_id,minutes,created_by)
  VALUES(p_institution_id,v_pack.id,p_booking_id,p_book_minutes,v_actor)
  RETURNING id INTO v_usage_id;
 ELSE
  IF p_pack_id IS NOT NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount>1000000000000
   OR p_currency NOT IN('ARS','USD') OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Para cobrar por hora indicá importe, moneda y referencia de la operación.' USING errcode='22023';
  END IF;
  IF p_mode='bank_transfer' AND length(btrim(coalesce(p_bank_ref,'')))<4 THEN
   RAISE EXCEPTION 'Indicá el número de la transferencia acreditada.' USING errcode='22023';
  END IF;
  SELECT m.id INTO v_existing_money FROM public.aerosuite_money_movements m WHERE m.request_id=p_request_id;
  IF FOUND THEN RAISE EXCEPTION 'La referencia de operación ya se utilizó en otro cobro.' USING errcode='22023'; END IF;
  INSERT INTO public.aerosuite_money_movements(
    institution_id,student_id,booking_id,movement_type,amount,currency,description,
    created_by,payment_method,payment_reference,fiscal_document_reference,request_id)
  VALUES(p_institution_id,v_booking.student_id,p_booking_id,'hour_payment',p_amount,
    p_currency,left(coalesce(p_note,''),500),v_actor,p_mode,
    left(btrim(coalesce(p_bank_ref,'')),120),left(btrim(coalesce(p_fiscal_ref,'')),120),p_request_id)
  RETURNING id INTO v_amount_id;
 END IF;
 INSERT INTO public.aerosuite_flight_checkouts(institution_id,booking_id,student_id,instructor_id,
  book_minutes,method,money_movement_id,pack_usage_id,recorded_by,logbook_confirmed,note)
 VALUES(p_institution_id,p_booking_id,v_booking.student_id,v_booking.instructor_id,
  p_book_minutes,p_mode,v_amount_id,v_usage_id,v_actor,coalesce(p_book_confirmed,false),
  left(case when coalesce(p_book_confirmed,false)
   then coalesce(p_note,'')
   else '[Tiempo declarado por alumno; Libro de Vuelo pendiente de control] '||coalesce(p_note,'') end,500))
 RETURNING id INTO v_checkout_id;
 RETURN jsonb_build_object('ok',true,'already_registered',false,'checkout_id',v_checkout_id,
  'minutes',p_book_minutes,'method',p_mode,'logbook_confirmed',coalesce(p_book_confirmed,false),
  'report_pending',v_report.id IS NULL OR v_report.status<>'approved',
  'difference',CASE WHEN v_report.id IS NOT NULL THEN v_report.flight_minutes-p_book_minutes ELSE NULL END);
END $function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_frontdesk_flight_list(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=auth.uid();v_role text;v_mode text;v_eligible jsonb;v_reviews jsonb;
BEGIN
 SELECT m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 INTO v_role,v_mode
 FROM public.aerosuite_institution_members m JOIN public.aerosuite_institutions i ON i.id=m.institution_id
 WHERE m.user_id=v_actor AND m.institution_id=p_institution_id AND m.role IN('administrador','secretaria');
 IF v_actor IS NULL OR v_role IS NULL OR v_mode='blocked' THEN
  RAISE EXCEPTION 'Sin permisos para controlar los cobros de vuelos.' USING errcode='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'booking_id',b.id,'student_id',b.student_id,'student_email',u.email,
  'instructor_email',iu.email,'aircraft',b.aircraft,'starts_at',b.starts_at,'booking_status',b.status,
  'report_status',r.status,'report_minutes',r.flight_minutes)
 ORDER BY b.starts_at DESC),'[]'::jsonb) INTO v_eligible
 FROM public.aerosuite_flight_bookings b
 LEFT JOIN auth.users u ON u.id=b.student_id
 LEFT JOIN auth.users iu ON iu.id=b.instructor_id
 LEFT JOIN public.aerosuite_flight_reports r ON r.booking_id=b.id AND r.institution_id=p_institution_id
 WHERE b.institution_id=p_institution_id
 AND b.status IN('pending','confirmed','completed')
 AND b.starts_at<=now() AND b.starts_at>=now()-interval '90 days'
 AND (r.status IS NULL OR r.status<>'voided')
 AND NOT EXISTS(SELECT 1 FROM public.aerosuite_flight_checkouts c WHERE c.booking_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM public.aerosuite_money_movements m WHERE m.booking_id=b.id AND m.movement_type='hour_payment')
 AND NOT EXISTS(SELECT 1 FROM public.aerosuite_pack_usages k WHERE k.booking_id=b.id);
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'checkout_id',v.id,'booking_id',v.booking_id,'book_minutes',v.book_minutes,
 'payment_method',v.method,'logbook_confirmed',v.logbook_confirmed,'recorded_at',v.recorded_at,'recorded_by_email',au.email,
 'student_email',su.email,'report_status',r.status,'report_minutes',r.flight_minutes,
 'report_revision',r.revision,'reviewed_at',v.checked_at,
 'status', CASE WHEN r.id IS NULL THEN 'awaiting_report'
    WHEN r.status<>'approved' THEN CASE WHEN v.book_minutes<>r.flight_minutes THEN 'difference' ELSE 'awaiting_approval' END
    WHEN v.book_minutes<>r.flight_minutes THEN 'difference'
    WHEN v.checked_report_revision=r.revision AND v.checked_at IS NOT NULL THEN 'reviewed'
    ELSE 'awaiting_review' END)
 ORDER BY v.recorded_at DESC),'[]'::jsonb) INTO v_reviews
 FROM (SELECT * FROM public.aerosuite_flight_checkouts
  WHERE institution_id=p_institution_id ORDER BY recorded_at DESC LIMIT 200) v
 LEFT JOIN auth.users au ON au.id=v.recorded_by
 LEFT JOIN auth.users su ON su.id=v.student_id
 LEFT JOIN public.aerosuite_flight_reports r ON r.booking_id=v.booking_id AND r.institution_id=p_institution_id;
 RETURN jsonb_build_object('eligible',v_eligible,'reviews',v_reviews);
END $function$
;
