-- Corrección de serialización de la ruta económica heredada, basada en la definición efectiva consultada 2026-11-08.
-- Evita carrera entre pack_use y hour_payment; conserva roles, validaciones, importes, historial y firma pública.
-- No borra datos ni cambia privilegios; CREATE OR REPLACE mantiene los grants existentes.

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
 select 1 from public.aerosuite_institution_members m where m.institution_id=p_institution_id and m.user_id=p_student_id and m.role in('alumno','piloto'))
 then raise exception 'Seleccioná un alumno o piloto registrado.' using errcode='22023';end if;
 -- Orden único de bloqueo para todos los medios de pago y caminos heredados.
 -- Cobros y pack compiten sobre la MISMA reserva antes de comprobar asientos.
 IF p_operation IN ('pack_use','hour_payment') THEN
  SELECT * INTO v_booking FROM public.aerosuite_flight_bookings b
   WHERE b.id=p_booking_id AND b.institution_id=p_institution_id FOR UPDATE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Seleccioná una reserva de vuelo válida para la institución.' USING errcode='22023';
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.aerosuite_student_debts d WHERE d.booking_id=p_booking_id AND d.institution_id=p_institution_id AND d.cancelled_at IS NULL) THEN
  RAISE EXCEPTION 'Este vuelo tiene una deuda registrada. Cobrala desde Contaduría → Deudas de alumnos y pilotos para evitar duplicaciones.' USING ERRCODE='22023';
 END IF;
 if p_operation='pack_sale' then
  if p_minutes is null or p_minutes not between 1 and 60000 then raise exception 'Ingresá la cantidad de minutos del pack.' using errcode='22023';end if;
  insert into public.aerosuite_hour_packs(institution_id,student_id,total_minutes,paid_amount,currency,created_by)
  values(p_institution_id,p_student_id,p_minutes,p_amount,p_currency,v_actor) returning id into v_id;
  insert into public.aerosuite_money_movements(institution_id,student_id,pack_id,movement_type,amount,currency,description,created_by)
  values(p_institution_id,p_student_id,v_id,'pack_sale',p_amount,p_currency,left(coalesce(p_description,''),500),v_actor);
 elsif p_operation='pack_use' then
  select * into v_pack from public.aerosuite_hour_packs where id=p_pack_id and institution_id=p_institution_id for update;
  if not found then raise exception 'El pack no pertenece a la institución.' using errcode='P0002';end if;
  -- Reserva ya bloqueada por identificador al ingresar en la rama de liquidación.
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
   -- Reserva ya bloqueada por identificador al ingresar en la rama de liquidación.
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
end;$function$

