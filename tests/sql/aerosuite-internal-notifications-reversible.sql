-- PRUEBA 100% REVERSIBLE: ejecutar en proyecto CTP cuando ya se instaló la migración de avisos.
-- No envía correos/WhatsApp. Sólo usa la misma sesión SQL y concluye con ROLLBACK.
BEGIN;
INSERT INTO public.aerosuite_institutions(id,name,kind,contact_email,is_test)
 VALUES('00000000-0000-4000-8000-000000000f51','Campana interna prueba reversible','escuela','campana@invalid.example',true);
INSERT INTO public.aerosuite_institution_members(institution_id,user_id,role)
 VALUES('00000000-0000-4000-8000-000000000f51','9a31e8ed-6c75-4781-a638-52b769baf2c5','administrador'),('00000000-0000-4000-8000-000000000f51','e3f6cdaa-1999-4d63-97fd-f7964d7de605','secretaria'),
 ('00000000-0000-4000-8000-000000000f51','bb84f8c5-0453-42c8-a937-5adac99a0358','instructor'),('00000000-0000-4000-8000-000000000f51','3bd62205-9280-4283-84fb-594298359bd3','alumno');
INSERT INTO public.aerosuite_flight_bookings(id,institution_id,student_id,instructor_id,starts_at,status,aircraft,with_instructor,created_by,updated_by)
 VALUES('00000000-0000-4000-8000-000000000f52','00000000-0000-4000-8000-000000000f51','3bd62205-9280-4283-84fb-594298359bd3','bb84f8c5-0453-42c8-a937-5adac99a0358',now()+interval '2 days','pending','LV-TST',true,'9a31e8ed-6c75-4781-a638-52b769baf2c5','9a31e8ed-6c75-4781-a638-52b769baf2c5');
UPDATE public.aerosuite_flight_bookings SET status='confirmed' WHERE id='00000000-0000-4000-8000-000000000f52';
UPDATE public.aerosuite_flight_bookings SET status='confirmed' WHERE id='00000000-0000-4000-8000-000000000f52'; -- Reintento idéntico.
UPDATE public.aerosuite_flight_bookings SET starts_at=starts_at+interval '1 hour' WHERE id='00000000-0000-4000-8000-000000000f52';
INSERT INTO public.aerosuite_flight_reports(institution_id,booking_id,instructor_id,flight_minutes,fuel_liters,oil_liters,
 teaching_notes,aircraft_notes,status,logbook_entry)
 VALUES('00000000-0000-4000-8000-000000000f51','00000000-0000-4000-8000-000000000f52','bb84f8c5-0453-42c8-a937-5adac99a0358',90,0,0,'Prueba interna','Sin novedad','submitted',
 jsonb_build_object('flight_date','2026-11-09','aircraft_registration','LV-TST'));
UPDATE public.aerosuite_flight_reports SET status='returned',return_reason='Ensayo reversible' WHERE booking_id='00000000-0000-4000-8000-000000000f52';
DO $validate$
DECLARE v_count integer;
BEGIN
 SELECT count(*) INTO v_count FROM public.aerosuite_notification_inbox WHERE institution_id='00000000-0000-4000-8000-000000000f51';
 IF v_count<>20 THEN RAISE EXCEPTION 'Esperados 5 eventos x 4 miembros = 20, registrados %',v_count;END IF;
 IF EXISTS(SELECT 1 FROM public.aerosuite_notification_inbox
  WHERE institution_id='00000000-0000-4000-8000-000000000f51' AND recipient_id='0aa5bb0e-6cbe-48c2-a224-c26be5756b34') THEN
  RAISE EXCEPTION 'Un destinatario ajeno recibió una notificación';
 END IF;
 IF EXISTS(SELECT recipient_id FROM public.aerosuite_notification_inbox WHERE institution_id='00000000-0000-4000-8000-000000000f51'
  GROUP BY recipient_id HAVING count(*)<>5) THEN RAISE EXCEPTION 'Algún destinatario tiene eventos faltantes o duplicados';END IF;
END $validate$;
SET LOCAL ROLE authenticated;
DO $roles$
DECLARE j jsonb;v_id uuid;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','3bd62205-9280-4283-84fb-594298359bd3',true);
 j:=public.aerosuite_notification_inbox_list('00000000-0000-4000-8000-000000000f51',100);
 IF jsonb_array_length(j->'items')<>5 OR (j->>'unread')::int<>5 THEN RAISE EXCEPTION 'Alumno no ve sus cinco avisos';END IF;
 v_id:=(j->'items'->0->>'id')::uuid;
 j:=public.aerosuite_notification_mark_read('00000000-0000-4000-8000-000000000f51',ARRAY[v_id]);
 IF (j->>'marked')::int<>1 THEN RAISE EXCEPTION 'No pudo marcar su aviso como leído';END IF;
 PERFORM set_config('request.jwt.claim.sub','bb84f8c5-0453-42c8-a937-5adac99a0358',true);
 j:=public.aerosuite_notification_mark_read('00000000-0000-4000-8000-000000000f51',ARRAY[v_id]);
 IF (j->>'marked')::int<>0 THEN RAISE EXCEPTION 'Un instructor pudo modificar aviso de Alumno';END IF;
 PERFORM set_config('request.jwt.claim.sub','0aa5bb0e-6cbe-48c2-a224-c26be5756b34',true);
 BEGIN
  PERFORM public.aerosuite_notification_inbox_list('00000000-0000-4000-8000-000000000f51',100);
  RAISE EXCEPTION 'Otra escuela pudo consultar bandeja privada';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;END;
END $roles$;
RESET ROLE;
UPDATE public.aerosuite_institutions SET status='active',license_started_at=now()-interval '33 days',
 license_ends_at=now()-interval '1 day' WHERE id='00000000-0000-4000-8000-000000000f51';
SET LOCAL ROLE authenticated;
DO $readonly$
DECLARE v_items jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','3bd62205-9280-4283-84fb-594298359bd3',true);
 v_items:=public.aerosuite_notification_inbox_list('00000000-0000-4000-8000-000000000f51',100);
 IF jsonb_array_length(v_items->'items')<>5 THEN RAISE EXCEPTION 'Expiración impide lectura';END IF;
 BEGIN
  PERFORM public.aerosuite_notification_mark_read('00000000-0000-4000-8000-000000000f51',ARRAY[(v_items->'items'->1->>'id')::uuid]);
  RAISE EXCEPTION 'Licencia vencida permitió marcar lectura';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;END;
END $readonly$;
RESET ROLE;
SELECT 'PRUEBAS APROBADAS: entrega interna, deduplicación, aislamiento y solo lectura' AS result;
ROLLBACK;
