CREATE OR REPLACE FUNCTION public.aerosuite_cashier_student_search(p_institution_id uuid, p_search text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();
 v_mode text;
 v_term text:=left(btrim(coalesce(p_search,'')),90);
 v_digits text:=regexp_replace(v_term,'[^0-9]','','g');
 v_results jsonb;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode
 from public.aerosuite_institutions i
 join public.aerosuite_institution_members m on m.institution_id=i.id
 where i.id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria')
 limit 1;
 if v_actor is null or v_mode is null or v_mode='blocked' then
  raise exception 'Solo Dirección y Secretaría pueden buscar alumnos y pilotos de esta escuela.' using errcode='42501';
 end if;
 if length(v_term)<2 then return '[]'::jsonb;end if;
 with students as (
  select distinct on(m.user_id) m.user_id as student_id,
   u.email::text as email,
   coalesce(nullif(btrim(concat_ws(' ',mp.given_names,mp.family_names)), ''),
            nullif(btrim(p.full_name),''),
            nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
            u.email)::text as full_name,
   (case when m.role='piloto' then 'PI-' else 'AL-' end||lpad(m.legajo_number::text,6,'0'))::text as legajo,
   m.role as person_role,
   m.legajo_number
  from public.aerosuite_institution_members m
  join auth.users u on u.id=m.user_id
  left join public.aerosuite_member_profiles mp on mp.user_id=m.user_id
  left join public.profiles p on p.id=m.user_id
  where m.institution_id=p_institution_id and m.role in('alumno','piloto')
  order by m.user_id,case when m.role='piloto' then 0 else 1 end
 ),
 matches as (
  select *
  from students s
  where position(lower(v_term) in lower(s.full_name))>0
   or position(lower(v_term) in lower(s.email))>0
   or position(lower(v_term) in lower(s.legajo))>0
   or (v_term~'^[0-9]+$' and s.legajo_number::text=v_term)
   or (length(v_digits) between 7 and 12 and exists(
     select 1 from public.aerosuite_member_documents d
     where d.user_id=s.student_id and d.document_type='dni'
       and regexp_replace(d.document_number,'[^0-9]','','g')=v_digits
   ))
  order by s.full_name,s.legajo limit 20
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'student_id',student_id,'full_name',full_name,'email',email,'legajo',legajo,'role',person_role
  ) order by full_name,legajo),'[]'::jsonb) into v_results from matches;
 return v_results;
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.aerosuite_reserve_with_instructor(p_institution_id uuid, p_slot_id uuid, p_student_id uuid, p_with_instructor boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_slot public.aerosuite_availability_slots%rowtype;
 v_result jsonb;v_booking_id uuid;
begin
 if v_actor is null or p_with_instructor is null then
  raise exception 'Sesión y modalidad de vuelo requeridas.' using errcode='42501';end if;
 select * into v_slot from public.aerosuite_availability_slots s
 where s.id=p_slot_id and s.institution_id=p_institution_id and s.retired_at is null;
 if not found then raise exception 'Horario no encontrado o retirado.' using errcode='22023';end if;
 if v_slot.activity<>'flight' and p_with_instructor=false then
  raise exception 'La opción sin instructor solo corresponde a vuelos prácticos.' using errcode='22023';end if;
 if v_slot.activity='flight' and not p_with_instructor then
  if not exists(select 1 from public.aerosuite_pilot_authorizations pa
   join public.aerosuite_role_declarations d on d.user_id=pa.user_id and d.role='pilot'
   join public.aerosuite_institution_members mm on mm.institution_id=pa.institution_id and mm.user_id=pa.user_id and mm.role='piloto'
   where pa.institution_id=p_institution_id
   and pa.user_id=coalesce(p_student_id,v_actor) and pa.status='verified'
   and upper(coalesce(d.license_type,'')) ~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)')
  then raise exception 'Solo un Piloto PPA verificado por esta escuela puede reservar sin instructor. Completá tu ficha y solicitá la validación de Secretaría.' using errcode='42501';end if;
 end if;
 v_result:=public.aerosuite_availability_reserve(p_institution_id,p_slot_id,p_student_id);
 v_booking_id:=nullif(v_result->>'booking_id','')::uuid;
 if v_slot.activity='flight' then
  if v_booking_id is null then raise exception 'No se creó el vuelo.' using errcode='22023';end if;
  update public.aerosuite_flight_bookings set with_instructor=p_with_instructor,
   updated_at=now(),updated_by=v_actor where id=v_booking_id and institution_id=p_institution_id;
  insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,after_data)
  values(p_institution_id,v_booking_id,v_actor,'instructor_mode_selected',
   jsonb_build_object('with_instructor',p_with_instructor,'requires_school_authorization',not p_with_instructor));
 end if;
 return v_result||jsonb_build_object('with_instructor',p_with_instructor,
  'requires_school_authorization',v_slot.activity='flight' and not p_with_instructor);
end $function$;

CREATE OR REPLACE FUNCTION public.aerosuite_confirm_without_instructor(p_institution_id uuid, p_booking_id uuid, p_authorization_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_mode text;
 v_booking public.aerosuite_flight_bookings%rowtype;
 v_slot public.aerosuite_availability_slots%rowtype;
 v_ref text:=btrim(coalesce(p_authorization_reference,''));
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección o Secretaría pueden autorizar vuelos sin instructor.' using errcode='42501';end if;
 if length(v_ref) not between 8 and 250 then
  raise exception 'Indicá una referencia verificable de autorización (8 a 250 caracteres).' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_booking from public.aerosuite_flight_bookings
 where id=p_booking_id and institution_id=p_institution_id for update;
 if not found or v_booking.with_instructor or v_booking.status<>'pending' or v_booking.starts_at<=now()
 then raise exception 'Solo se pueden autorizar solicitudes futuras pendientes sin instructor.' using errcode='22023';end if;
 if not exists(select 1 from public.aerosuite_pilot_authorizations pa
   join public.aerosuite_role_declarations d on d.user_id=pa.user_id and d.role='pilot'
   join public.aerosuite_institution_members mm on mm.institution_id=pa.institution_id and mm.user_id=pa.user_id and mm.role='piloto'
   where pa.institution_id=p_institution_id and pa.user_id=v_booking.student_id and pa.status='verified'
   and upper(coalesce(d.license_type,'')) ~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)')
 then raise exception 'No se puede confirmar un vuelo sin instructor: Piloto PPA no verificado por la institución.' using errcode='42501';end if;
 if exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=v_booking.id)
 or exists(select 1 from public.aerosuite_flight_checkouts c where c.booking_id=v_booking.id)
 then raise exception 'El vuelo ya tiene informe o movimiento de caja.' using errcode='22023';end if;
 select s.* into v_slot from public.aerosuite_activity_reservations r
 join public.aerosuite_availability_slots s on s.id=r.slot_id
 where r.institution_id=p_institution_id and r.booking_id=v_booking.id and r.status='pending'
 and s.activity='flight' and s.published_at is not null and s.retired_at is null
 for update of s;
 if not found then raise exception 'No hay horario de vuelo publicado para esta reserva.' using errcode='22023';end if;
 if not exists(select 1 from public.aerosuite_aircraft_registry a
 where a.institution_id=p_institution_id and a.registration=upper(v_slot.resource_label)
 and a.availability='available' and a.archived_at is null)
 then raise exception 'La aeronave seleccionada no está disponible.' using errcode='22023';end if;
 if exists(select 1 from public.aerosuite_flight_bookings b
 where b.institution_id=p_institution_id and b.id<>v_booking.id
 and b.status in('pending','confirmed','completed')
 and upper(coalesce(b.aircraft,''))=upper(v_slot.resource_label)
 and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
     tstzrange(v_booking.starts_at,v_booking.starts_at+interval '90 minutes','[)'))
 then raise exception 'La aeronave tiene otra reserva superpuesta.' using errcode='23505';end if;
 update public.aerosuite_flight_bookings set status='confirmed',
  instructor_id=null,aircraft=upper(v_slot.resource_label),
  updated_by=v_actor,updated_at=now() where id=v_booking.id;
 insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,before_data,after_data)
 select p_institution_id,v_booking.id,v_actor,'solo_flight_authorized',to_jsonb(v_booking),
 to_jsonb(b)||jsonb_build_object('authorization_reference',v_ref,'verified_by_school',true)
 from public.aerosuite_flight_bookings b where b.id=v_booking.id;
 return jsonb_build_object('ok',true,'booking_id',v_booking.id,'status','confirmed',
  'with_instructor',false);
end $function$;

CREATE OR REPLACE FUNCTION public.aerosuite_pilot_verify(p_institution_id uuid, p_user_id uuid, p_approved boolean, p_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_allowed boolean;v_ref text:=btrim(coalesce(p_reference,''));v_type text;
begin
 select exists(select 1 from public.aerosuite_institution_members m
 join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria')
 and private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) in ('active','trial','grace')) into v_allowed;
 if not v_allowed then raise exception 'Solo Secretaría o Dirección habilitadas pueden verificar al piloto.' using errcode='42501';end if;
 if p_approved is null or length(v_ref) not between 8 and 250
 then raise exception 'Indicá una referencia documental válida de 8 a 250 caracteres.' using errcode='22023';end if;
 if not exists(select 1 from public.aerosuite_institution_members m
 where m.institution_id=p_institution_id and m.user_id=p_user_id and m.role='piloto')
 then raise exception 'La persona no está vinculada a la escuela.' using errcode='22023';end if;
 select d.license_type into v_type from public.aerosuite_role_declarations d
 where d.user_id=p_user_id and d.role='pilot';
 if p_approved and (not found or upper(coalesce(v_type,'')) !~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)') then
  raise exception 'La persona primero debe declarar en su ficha una licencia de Piloto PPA o Comercial.' using errcode='22023';end if;
 insert into public.aerosuite_pilot_authorizations(institution_id,user_id,status,verification_reference,verified_by,verified_at,updated_at)
 values(p_institution_id,p_user_id,case when p_approved then 'verified' else 'revoked' end,v_ref,v_actor,now(),now())
 on conflict(institution_id,user_id) do update set
 status=excluded.status,verification_reference=excluded.verification_reference,verified_by=excluded.verified_by,
 verified_at=excluded.verified_at,updated_at=now();
 return jsonb_build_object('ok',true,'pilot_verified',p_approved,'user_id',p_user_id);
end $function$;

create or replace function public.aerosuite_revoke_changed_pilot_license()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if TG_OP='DELETE' then
  if old.role='pilot' then
   update public.aerosuite_pilot_authorizations set status='revoked',updated_at=now()
   where user_id=old.user_id and status='verified';
  end if;
  return old;
 end if;
 if new.role='pilot' and TG_OP='UPDATE'
  and (new.license_type is distinct from old.license_type or new.license_number is distinct from old.license_number)
 then
  update public.aerosuite_pilot_authorizations set status='revoked',updated_at=now()
  where user_id=new.user_id and status='verified';
 end if;
 return new;
end $fn$;
drop trigger if exists aerosuite_pilot_license_change_reverify on public.aerosuite_role_declarations;
create trigger aerosuite_pilot_license_change_reverify
after update or delete on public.aerosuite_role_declarations
for each row execute function public.aerosuite_revoke_changed_pilot_license();
