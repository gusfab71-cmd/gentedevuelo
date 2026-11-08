-- AeroSuite: excepciones de conciliación, SOLO CONSULTA. No corrige horas ni cobros.
-- Un vuelo pendiente de liquidar no constituye por sí solo una deuda exigible.
CREATE OR REPLACE FUNCTION public.aerosuite_reconciliation_open_items(
 p_institution_id uuid,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_actor uuid:=auth.uid();v_role text;v_mode text;v_items jsonb;v_total integer;
BEGIN
 SELECT m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 INTO v_role,v_mode FROM public.aerosuite_institution_members m
 JOIN public.aerosuite_institutions i ON i.id=m.institution_id
 WHERE m.institution_id=p_institution_id AND m.user_id=v_actor
   AND m.role IN ('administrador','secretaria')
 LIMIT 1;
 IF v_actor IS NULL OR v_role IS NULL OR v_mode='blocked' THEN
   RAISE EXCEPTION 'Solo Dirección o Secretaría pueden consultar la conciliación.' USING errcode='42501';
 END IF;
 WITH issues AS (
  SELECT 1 AS weight,'approved_unsettled'::text AS issue,'Informe aprobado sin liquidación registrada'::text AS description,
     b.id AS booking_id,b.starts_at,
     coalesce(nullif(b.aircraft,''),r.logbook_entry->>'aircraft_registration','') AS registration,
     r.flight_minutes AS minutes,
     'Confirmar primero si hubo cobro previo o pack. No crear deuda automática.'::text AS instruction
  FROM public.aerosuite_flight_bookings b
  JOIN public.aerosuite_flight_reports r ON r.booking_id=b.id
     AND r.institution_id=b.institution_id AND r.status='approved'
  WHERE b.institution_id=p_institution_id AND b.status='completed'
   AND NOT EXISTS (SELECT 1 FROM public.aerosuite_flight_checkouts c WHERE c.institution_id=b.institution_id AND c.booking_id=b.id)
   AND NOT EXISTS (SELECT 1 FROM public.aerosuite_student_debts d WHERE d.institution_id=b.institution_id AND d.booking_id=b.id AND d.cancelled_at IS NULL)
   AND NOT EXISTS (SELECT 1 FROM public.aerosuite_money_movements m WHERE m.institution_id=b.institution_id AND m.booking_id=b.id AND m.movement_type='hour_payment')
   AND NOT EXISTS (SELECT 1 FROM public.aerosuite_pack_usages u WHERE u.institution_id=b.institution_id AND u.booking_id=b.id)
  UNION ALL
  SELECT 2,'checkout_without_aircraft','Cierre histórico sin matrícula',
   b.id,b.starts_at,coalesce(nullif(b.aircraft,''),r.logbook_entry->>'aircraft_registration',''),c.book_minutes,
   'Cotejar RAV, Libro y comprobante antes de completar matrícula. No inferir automáticamente.'
  FROM public.aerosuite_flight_checkouts c
  JOIN public.aerosuite_flight_bookings b ON b.id=c.booking_id AND b.institution_id=c.institution_id
  LEFT JOIN public.aerosuite_flight_reports r ON r.booking_id=b.id AND r.institution_id=b.institution_id
  WHERE c.institution_id=p_institution_id AND nullif(btrim(coalesce(c.aircraft_registration,'')),'') IS NULL
  UNION ALL
  SELECT 3,'past_booking_without_report','Turno anterior sin informe registrado',
   b.id,b.starts_at,coalesce(b.aircraft,''),NULL::integer,
   'Confirmar si el vuelo se realizó, fue reprogramado o corresponde cancelar el turno; no sumar horas.'
  FROM public.aerosuite_flight_bookings b
  WHERE b.institution_id=p_institution_id AND b.status IN ('pending','confirmed')
   AND b.starts_at < now()-interval '2 hours'
   AND NOT EXISTS (SELECT 1 FROM public.aerosuite_flight_reports r WHERE r.institution_id=b.institution_id AND r.booking_id=b.id)
  UNION ALL
  SELECT 4,'checkout_report_minutes_mismatch','Minutos de caja distintos al informe aprobado',
   b.id,b.starts_at,coalesce(c.aircraft_registration,b.aircraft,''),c.book_minutes,
   'Confrontar valores originales antes de rectificar Libro o caja.'
  FROM public.aerosuite_flight_checkouts c
  JOIN public.aerosuite_flight_bookings b ON b.id=c.booking_id AND b.institution_id=c.institution_id
  JOIN public.aerosuite_flight_reports r ON r.booking_id=b.id AND r.institution_id=b.institution_id AND r.status='approved'
  WHERE c.institution_id=p_institution_id AND c.book_minutes IS DISTINCT FROM r.flight_minutes
 ),
 numbered AS (
  SELECT weight,issue,description,booking_id,starts_at,registration,minutes,instruction,
   row_number() OVER (ORDER BY weight,starts_at DESC,booking_id) AS rownum
  FROM issues
 )
 SELECT count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('issue',issue,'description',description,
  'booking_id',booking_id,'starts_at',starts_at,'registration',registration,'minutes',minutes,
  'instruction',instruction) ORDER BY weight,starts_at DESC) FILTER(WHERE rownum<=least(greatest(coalesce(p_limit,100),1),200)),'[]'::jsonb)
 INTO v_total,v_items FROM numbered;
 RETURN jsonb_build_object('total',v_total,'items',v_items,
  'read_only',v_mode NOT IN ('trial','active'),
  'automatically_changed',false,
  'disclaimer','Excepciones a revisar; no son deudas confirmadas ni implican que el vuelo se haya efectuado. Ningún dato fue modificado.');
END;
$fn$;
REVOKE ALL ON FUNCTION public.aerosuite_reconciliation_open_items(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aerosuite_reconciliation_open_items(uuid,integer) TO authenticated;
