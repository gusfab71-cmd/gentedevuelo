-- Prevent double charge; mask peer booking ids for students.
CREATE OR REPLACE FUNCTION public.aerosuite_booking_schedule(p_institution_id uuid, p_date_from date, p_date_to date)
 RETURNS TABLE(booking_id uuid, starts_at timestamp with time zone, status text, my_booking boolean, student_id uuid, student_email text, instructor_id uuid, instructor_email text, aircraft text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := auth.uid();v_role text;v_mode text;
begin
 select m.role,private.aerosuite_access_mode(org.status,org.trial_ends_at,org.license_ends_at,now())
 into v_role,v_mode from public.aerosuite_institution_members m
 join public.aerosuite_institutions org on org.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','instructor','alumno','secretaria')
 limit 1;
 if v_role is null or v_mode='blocked' then raise exception 'No tenés acceso a esta institución.' using errcode='42501';end if;
 if p_date_from is null or p_date_to is null or p_date_to<p_date_from or p_date_to>p_date_from+14
 then raise exception 'Período de consulta inválido.' using errcode='22023';end if;
 return query select case when v_role in ('administrador','secretaria','instructor') or b.student_id=v_actor then b.id else null::uuid end,b.starts_at,b.status,b.student_id=v_actor,
  case when v_role in ('administrador','secretaria','instructor') or b.student_id=v_actor then b.student_id else null::uuid end,
  case when v_role in ('administrador','secretaria','instructor') or b.student_id=v_actor then su.email::text else null::text end,
  case when v_role in ('administrador','secretaria','instructor') or b.student_id=v_actor then b.instructor_id else null::uuid end,
  case when v_role in ('administrador','secretaria','instructor') or b.student_id=v_actor then iu.email::text else null::text end,
  case when v_role in ('administrador','secretaria','instructor') or b.student_id=v_actor then b.aircraft else '' end
 from public.aerosuite_flight_bookings b
 left join auth.users su on su.id=b.student_id
 left join auth.users iu on iu.id=b.instructor_id
 where b.institution_id=p_institution_id
 and b.starts_at >= (p_date_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
 and b.starts_at < ((p_date_to+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
 order by b.starts_at;
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
  if not found or v_booking.student_id<>v_pack.student_id or v_booking.status<>'completed' then
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
