-- Consistency: approved instruction report required to settle completed flights, and no silent cancellation with a report.
CREATE OR REPLACE FUNCTION public.aerosuite_booking_action(p_institution_id uuid, p_action text, p_booking_id uuid DEFAULT NULL::uuid, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_student_id uuid DEFAULT NULL::uuid, p_instructor_id uuid DEFAULT NULL::uuid, p_aircraft text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_role text;v_mode text;v_booking public.aerosuite_flight_bookings%rowtype;v_id uuid;v_student uuid;v_instructor uuid;v_before jsonb;
begin
 select m.role,private.aerosuite_access_mode(org.status,org.trial_ends_at,org.license_ends_at,now())
 into v_role,v_mode from public.aerosuite_institution_members m
 join public.aerosuite_institutions org on org.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in ('administrador','secretaria','instructor','alumno') limit 1;
 if v_actor is null or v_role is null then raise exception 'No autorizado para esta institución.' using errcode='42501';end if;
 if v_mode not in ('trial','grace','active') then raise exception 'La institución está en modo consulta.' using errcode='42501';end if;
 if p_action not in ('request','confirm','cancel','finish') then raise exception 'Acción inválida.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 if p_action='request' then
   if p_starts_at is null or p_starts_at < now()-interval '30 minutes' or p_starts_at>now()+interval '90 days'
   then raise exception 'Elegí un turno futuro dentro de los próximos 90 días.' using errcode='22023';end if;
   v_student:=case when v_role in ('administrador','secretaria') then coalesce(p_student_id,v_actor) else v_actor end;
   if not exists(select 1 from public.aerosuite_institution_members m where m.institution_id=p_institution_id and m.user_id=v_student and m.role='alumno')
   then raise exception 'El alumno no está registrado en esta institución.' using errcode='42501';end if;
   if exists(select 1 from public.aerosuite_flight_bookings b where b.institution_id=p_institution_id and b.status<>'cancelled' and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') && tstzrange(p_starts_at,p_starts_at+interval '90 minutes','[)'))
   then raise exception 'El horario ya tiene una reserva. Elegí otro turno.' using errcode='23505';end if;
   insert into public.aerosuite_flight_bookings(institution_id,student_id,starts_at,created_by,updated_by)
   values(p_institution_id,v_student,p_starts_at,v_actor,v_actor) returning id into v_id;
   insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,after_data) values(p_institution_id,v_id,v_actor,'requested',jsonb_build_object('student_id',v_student,'starts_at',p_starts_at));
 else
   select * into v_booking from public.aerosuite_flight_bookings where id=p_booking_id and institution_id=p_institution_id for update;
   if not found then raise exception 'No existe esa reserva en tu institución.' using errcode='P0002';end if;
   v_before:=to_jsonb(v_booking); v_id:=v_booking.id;
   if p_action='confirm' then
     if v_booking.status<>'pending' or v_role not in ('administrador','secretaria','instructor') then raise exception 'No podés confirmar esta reserva.' using errcode='42501';end if;
     v_instructor:=case when v_role='instructor' then v_actor else p_instructor_id end;
     if v_instructor is null or not exists(select 1 from public.aerosuite_institution_members m where m.institution_id=p_institution_id and m.user_id=v_instructor and m.role='instructor')
     then raise exception 'Seleccioná un instructor habilitado en esta escuela.' using errcode='22023';end if;
     if exists(select 1 from public.aerosuite_flight_bookings b where b.institution_id=p_institution_id and b.id<>v_booking.id
       and b.instructor_id=v_instructor and b.status in ('confirmed','completed')
       and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') && tstzrange(v_booking.starts_at,v_booking.starts_at+interval '90 minutes','[)'))
     then raise exception 'Ese instructor tiene otro vuelo en el mismo horario.' using errcode='23505';end if;
     update public.aerosuite_flight_bookings set status='confirmed',instructor_id=v_instructor,
       aircraft=case when v_role in ('administrador','secretaria') then left(btrim(coalesce(p_aircraft,'')),60) else aircraft end,
       updated_by=v_actor,updated_at=now() where id=v_id;
   elsif p_action='cancel' then
     if v_booking.status not in ('pending','confirmed') or not (v_role in ('administrador','secretaria') or (v_role='alumno' and v_booking.student_id=v_actor and v_booking.status='pending'))
     then raise exception 'No podés cancelar esta reserva.' using errcode='42501';end if;
     if exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=v_booking.id) then raise exception 'El vuelo ya tiene un informe presentado. Debés resolverlo desde Administración, sin cancelar el registro de manera silenciosa.' using errcode='22023';end if;
     if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Indicá el motivo de cancelación.' using errcode='22023';end if;
     update public.aerosuite_flight_bookings set status='cancelled',cancellation_reason=left(btrim(p_reason),250),updated_by=v_actor,updated_at=now() where id=v_id;
   else
     if not exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=v_booking.id and r.status='approved') then raise exception 'No se puede cerrar un vuelo sin informe de instrucción validado.' using errcode='22023';end if;
     if v_role not in ('administrador','secretaria') or v_booking.status<>'confirmed' then raise exception 'Solo Administración puede cerrar vuelos confirmados.' using errcode='42501';end if;
     update public.aerosuite_flight_bookings set status='completed',updated_by=v_actor,updated_at=now() where id=v_id;
   end if;
   insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,before_data,after_data)
    select p_institution_id,v_id,v_actor,p_action,v_before,to_jsonb(b) from public.aerosuite_flight_bookings b where b.id=v_id;
 end if;
 return jsonb_build_object('ok',true,'booking_id',v_id,'action',p_action);
end;$function$;
CREATE OR REPLACE FUNCTION public.aerosuite_finance_action(p_institution_id uuid, p_operation text, p_student_id uuid DEFAULT NULL::uuid, p_booking_id uuid DEFAULT NULL::uuid, p_pack_id uuid DEFAULT NULL::uuid, p_minutes integer DEFAULT NULL::integer, p_amount numeric DEFAULT NULL::numeric, p_currency text DEFAULT 'ARS'::text, p_description text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_mode text;v_pack public.aerosuite_hour_packs%rowtype;v_booking public.aerosuite_flight_bookings%rowtype;
 v_id uuid;v_used int;
begin
 if not exists(select 1 from public.aerosuite_institution_members m where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria'))
 then raise exception 'Solo Administración gestiona los movimientos económicos.' using errcode='42501';end if;
 select private.aerosuite_access_mode(status,trial_ends_at,license_ends_at,now()) into v_mode
 from public.aerosuite_institutions where id=p_institution_id;
 if v_mode not in ('trial','grace','active') then raise exception 'La institución está en modo consulta.' using errcode='42501';end if;
 if p_operation not in ('pack_sale','pack_use','hour_payment','expense','petty_expense','refund') then raise exception 'Operación desconocida.' using errcode='22023';end if;
 if p_operation<>'pack_use' and (p_amount is null or p_amount<=0 or p_currency not in ('ARS','USD'))
 then raise exception 'Ingresá importe positivo y moneda válida.' using errcode='22023';end if;
 if p_operation in ('pack_sale','hour_payment') and not exists(
 select 1 from public.aerosuite_institution_members m where m.institution_id=p_institution_id and m.user_id=p_student_id and m.role='alumno')
 then raise exception 'Seleccioná un alumno registrado.' using errcode='22023';end if;
 if p_operation='pack_sale' then
  if p_minutes is null or p_minutes not between 1 and 60000 then raise exception 'Ingresá la cantidad de minutos del pack.' using errcode='22023';end if;
  insert into public.aerosuite_hour_packs(institution_id,student_id,total_minutes,paid_amount,currency,created_by)
  values(p_institution_id,p_student_id,p_minutes,p_amount,p_currency,v_actor) returning id into v_id;
  insert into public.aerosuite_money_movements(institution_id,student_id,pack_id,movement_type,amount,currency,description,created_by)
  values(p_institution_id,p_student_id,v_id,'pack_sale',p_amount,p_currency,left(coalesce(p_description,''),500),v_actor);
 elsif p_operation='pack_use' then
  select * into v_pack from public.aerosuite_hour_packs where id=p_pack_id and institution_id=p_institution_id for update;
  if not found then raise exception 'El pack no pertenece a la institución.' using errcode='P0002';end if;
  select * into v_booking from public.aerosuite_flight_bookings where id=p_booking_id and institution_id=p_institution_id;
  if not found or v_booking.student_id<>v_pack.student_id or v_booking.status<>'completed'
     or not exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=p_booking_id and r.status='approved') then
   raise exception 'Solo podés descontar horas de un vuelo realizado por el titular del pack.' using errcode='22023';end if;
  if exists(select 1 from public.aerosuite_money_movements m where m.booking_id=p_booking_id and m.movement_type='hour_payment')
  then raise exception 'Este vuelo ya fue cobrado por hora; no se puede descontar también un pack.' using errcode='22023';end if;
  if p_minutes is null or p_minutes not between 1 and 600 then raise exception 'Indicá minutos válidos para descontar.' using errcode='22023';end if;
  select coalesce(sum(minutes),0) into v_used from public.aerosuite_pack_usages where pack_id=v_pack.id;
  if v_used+p_minutes>v_pack.total_minutes then raise exception 'El pack no tiene suficientes horas disponibles.' using errcode='22023';end if;
  insert into public.aerosuite_pack_usages(institution_id,pack_id,booking_id,minutes,created_by)
  values(p_institution_id,v_pack.id,p_booking_id,p_minutes,v_actor) returning id into v_id;
 else
  if p_operation='hour_payment' then
   select * into v_booking from public.aerosuite_flight_bookings where id=p_booking_id and institution_id=p_institution_id;
   if not found or v_booking.status<>'completed' or v_booking.student_id<>p_student_id
    or not exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=p_booking_id and r.status='approved')
   then raise exception 'Seleccioná un vuelo realizado del alumno.' using errcode='22023';end if;
   if exists(select 1 from public.aerosuite_pack_usages where booking_id=p_booking_id)
   then raise exception 'Ese vuelo ya se descontó de un pack.' using errcode='22023';end if;
  end if;
  insert into public.aerosuite_money_movements(institution_id,student_id,booking_id,movement_type,amount,currency,description,created_by)
  values(p_institution_id,case when p_operation='hour_payment' then p_student_id else null end,
   case when p_operation='hour_payment' then p_booking_id else null end,
   p_operation,p_amount,p_currency,left(coalesce(p_description,''),500),v_actor) returning id into v_id;
 end if;
 return jsonb_build_object('ok',true,'id',v_id,'operation',p_operation);
end;$function$;
CREATE OR REPLACE FUNCTION public.aerosuite_report_action(p_institution_id uuid, p_booking_id uuid, p_action text, p_flight_minutes integer DEFAULT NULL::integer, p_fuel_liters numeric DEFAULT NULL::numeric, p_oil_liters numeric DEFAULT NULL::numeric, p_teaching_notes text DEFAULT NULL::text, p_aircraft_notes text DEFAULT NULL::text, p_review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_role text;v_mode text;v_booking public.aerosuite_flight_bookings%rowtype;
 v_report public.aerosuite_flight_reports%rowtype;v_id uuid;v_minutes integer;
begin
 select m.role,private.aerosuite_access_mode(org.status,org.trial_ends_at,org.license_ends_at,now()) into v_role,v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions org on org.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria','instructor') limit 1;
 if v_role is null or v_mode not in ('trial','grace','active') then raise exception 'No tenés permiso para registrar informes.' using errcode='42501';end if;
 select * into v_booking from public.aerosuite_flight_bookings b where b.institution_id=p_institution_id and b.id=p_booking_id for update;
 if not found then raise exception 'Reserva inexistente.' using errcode='P0002';end if;
 select * into v_report from public.aerosuite_flight_reports r where r.booking_id=p_booking_id for update;
 if p_action='submit' then
  if v_role<>'instructor' or v_booking.instructor_id<>v_actor or v_booking.status not in ('confirmed','completed') then
    raise exception 'Solo el instructor asignado puede presentar este informe.' using errcode='42501';end if;
  if v_report.id is not null and v_report.status<>'returned' then raise exception 'El informe ya fue presentado o aprobado.' using errcode='42501';end if;
  if p_flight_minutes is null or p_flight_minutes not between 1 and 600 or coalesce(p_fuel_liters,0)<0 or coalesce(p_oil_liters,0)<0
    or nullif(btrim(coalesce(p_teaching_notes,'')),'') is null then raise exception 'Completá minutos, devolución y cantidades válidas.' using errcode='22023';end if;
  if v_report.id is null then
   insert into public.aerosuite_flight_reports(institution_id,booking_id,instructor_id,flight_minutes,fuel_liters,oil_liters,teaching_notes,aircraft_notes)
    values(p_institution_id,p_booking_id,v_actor,p_flight_minutes,coalesce(p_fuel_liters,0),coalesce(p_oil_liters,0),left(p_teaching_notes,3000),left(coalesce(p_aircraft_notes,''),2000))
    returning id into v_id;
  else
   insert into public.aerosuite_report_versions(institution_id,report_id,revision,actor_id,old_document)
    values(p_institution_id,v_report.id,v_report.revision,v_actor,to_jsonb(v_report));
   update public.aerosuite_flight_reports set flight_minutes=p_flight_minutes,fuel_liters=coalesce(p_fuel_liters,0),
    oil_liters=coalesce(p_oil_liters,0),teaching_notes=left(p_teaching_notes,3000),aircraft_notes=left(coalesce(p_aircraft_notes,''),2000),
    status='submitted',return_reason='',reviewed_by=null,reviewed_at=null,revision=revision+1,updated_at=now() where id=v_report.id;
   v_id:=v_report.id;
  end if;
 elsif p_action in ('approve','return') then
  if v_role not in ('administrador','secretaria') or v_report.id is null or v_report.status<>'submitted' then
   raise exception 'Solo Administración puede revisar informes presentados.' using errcode='42501';end if;
  if v_booking.status<>'confirmed' then raise exception 'El vuelo ya no está confirmado y requiere revisión administrativa.' using errcode='22023';end if;
  if p_action='return' and nullif(btrim(coalesce(p_review_note,'')),'') is null then
   raise exception 'Indicá el motivo de la devolución.' using errcode='22023';end if;
  insert into public.aerosuite_report_versions(institution_id,report_id,revision,actor_id,old_document)
   values(p_institution_id,v_report.id,v_report.revision,v_actor,to_jsonb(v_report));
  update public.aerosuite_flight_reports set status=case when p_action='approve' then 'approved' else 'returned' end,
   return_reason=case when p_action='return' then left(p_review_note,1200) else '' end,
   reviewed_by=v_actor,reviewed_at=now(),revision=revision+1,updated_at=now() where id=v_report.id;
  if p_action='approve' then
   update public.aerosuite_flight_bookings set status='completed',updated_by=v_actor,updated_at=now()
   where id=p_booking_id and status='confirmed';
  end if;
  v_id:=v_report.id;
 else raise exception 'Acción de informe no reconocida.' using errcode='22023';end if;
 return jsonb_build_object('ok',true,'report_id',v_id,'action',p_action);
end;$function$;
