
-- AeroSuite: informes de vuelo versionados, packs de horas y contaduría de movimientos, sin doble cobro.
create table public.aerosuite_flight_reports (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 booking_id uuid not null unique references public.aerosuite_flight_bookings(id) on delete cascade,
 instructor_id uuid not null,
 flight_minutes integer not null check(flight_minutes between 1 and 600),
 fuel_liters numeric(10,2) not null default 0 check(fuel_liters>=0),
 oil_liters numeric(10,2) not null default 0 check(oil_liters>=0),
 teaching_notes text not null default '',
 aircraft_notes text not null default '',
 status text not null default 'submitted' check(status in ('submitted','returned','approved')),
 return_reason text not null default '',
 reviewed_by uuid, reviewed_at timestamptz,
 revision integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index aerosuite_reports_inst on public.aerosuite_flight_reports(institution_id,created_at desc);
create table public.aerosuite_report_versions (
 id bigint generated always as identity primary key,
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 report_id uuid not null references public.aerosuite_flight_reports(id) on delete cascade,
 revision integer not null,
 actor_id uuid not null,
 old_document jsonb not null,
 changed_at timestamptz not null default now()
);
create table public.aerosuite_hour_packs (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 student_id uuid not null,
 total_minutes integer not null check(total_minutes>0 and total_minutes<=60000),
 paid_amount numeric(14,2) not null check(paid_amount>=0),
 currency text not null check(currency in ('ARS','USD')),
 created_by uuid not null,created_at timestamptz not null default now()
);
create index aerosuite_packs_inst_student on public.aerosuite_hour_packs(institution_id,student_id);
create table public.aerosuite_pack_usages (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 pack_id uuid not null references public.aerosuite_hour_packs(id) on delete cascade,
 booking_id uuid not null unique references public.aerosuite_flight_bookings(id) on delete cascade,
 minutes integer not null check(minutes between 1 and 600),
 created_by uuid not null,created_at timestamptz not null default now()
);
create table public.aerosuite_money_movements (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 student_id uuid,
 booking_id uuid references public.aerosuite_flight_bookings(id) on delete set null,
 pack_id uuid references public.aerosuite_hour_packs(id) on delete set null,
 movement_type text not null check(movement_type in ('hour_payment','pack_sale','expense','petty_expense','refund')),
 amount numeric(14,2) not null check(amount>0),
 currency text not null check(currency in ('ARS','USD')),
 description text not null default '',
 created_by uuid not null,created_at timestamptz not null default now()
);
create unique index aerosuite_unique_booking_hour_payment on public.aerosuite_money_movements(booking_id) where movement_type='hour_payment' and booking_id is not null;
create index aerosuite_money_inst_created on public.aerosuite_money_movements(institution_id,created_at desc);
alter table public.aerosuite_flight_reports enable row level security;
alter table public.aerosuite_report_versions enable row level security;
alter table public.aerosuite_hour_packs enable row level security;
alter table public.aerosuite_pack_usages enable row level security;
alter table public.aerosuite_money_movements enable row level security;
revoke all on public.aerosuite_flight_reports,public.aerosuite_report_versions,public.aerosuite_hour_packs,public.aerosuite_pack_usages,public.aerosuite_money_movements from anon,authenticated;
create or replace function public.aerosuite_reports_list(p_institution_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid();v_role text;v_mode text;v_result jsonb;
begin
 select m.role,private.aerosuite_access_mode(org.status,org.trial_ends_at,org.license_ends_at,now()) into v_role,v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions org on org.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria','instructor','alumno') limit 1;
 if v_role is null or v_mode='blocked' then raise exception 'Sin acceso a los informes.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'booking_id',r.booking_id,'instructor_id',r.instructor_id,
 'student_id',b.student_id,'student_email',su.email,'instructor_email',iu.email,'starts_at',b.starts_at,
 'flight_minutes',r.flight_minutes,'fuel_liters',r.fuel_liters,'oil_liters',r.oil_liters,
 'teaching_notes',r.teaching_notes,'aircraft_notes',r.aircraft_notes,'status',r.status,
 'return_reason',r.return_reason,'revision',r.revision,'updated_at',r.updated_at) order by r.updated_at desc),'[]'::jsonb) into v_result
 from public.aerosuite_flight_reports r join public.aerosuite_flight_bookings b on b.id=r.booking_id
 left join auth.users su on su.id=b.student_id left join auth.users iu on iu.id=r.instructor_id
 where r.institution_id=p_institution_id and
 (v_role in ('administrador','secretaria') or
 (v_role='instructor' and r.instructor_id=v_actor) or
 (v_role='alumno' and b.student_id=v_actor and r.status='approved'));
 return v_result;
end;$fn$;
create or replace function public.aerosuite_report_action(
 p_institution_id uuid,p_booking_id uuid,p_action text,p_flight_minutes integer default null,
 p_fuel_liters numeric default null,p_oil_liters numeric default null,
 p_teaching_notes text default null,p_aircraft_notes text default null,p_review_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
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
end;$fn$;
create or replace function public.aerosuite_finance_snapshot(p_institution_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid();v_role text;v_mode text;v_packs jsonb;v_money jsonb;
begin
 select m.role,private.aerosuite_access_mode(org.status,org.trial_ends_at,org.license_ends_at,now()) into v_role,v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions org on org.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria','alumno') limit 1;
 if v_role is null or v_mode='blocked' then raise exception 'Sin acceso a la información económica.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'student_id',x.student_id,
  'student_email',u.email,'total_minutes',x.total_minutes,'used_minutes',x.used_minutes,
  'remaining_minutes',x.total_minutes-x.used_minutes,'paid_amount',x.paid_amount,'currency',x.currency,'created_at',x.created_at)
 order by x.created_at desc),'[]'::jsonb) into v_packs from (
 select pk.*,coalesce((select sum(usage.minutes) from public.aerosuite_pack_usages usage where usage.pack_id=pk.id),0) as used_minutes
 from public.aerosuite_hour_packs pk where pk.institution_id=p_institution_id
 and (v_role in ('administrador','secretaria') or pk.student_id=v_actor)
 ) x left join auth.users u on u.id=x.student_id;
 if v_role in ('administrador','secretaria') then
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'movement_type',m.movement_type,
 'student_id',m.student_id,'amount',m.amount,'currency',m.currency,
 'description',m.description,'created_by',m.created_by,'created_at',m.created_at) order by m.created_at desc),'[]'::jsonb)
 into v_money from (select * from public.aerosuite_money_movements where institution_id=p_institution_id order by created_at desc limit 150) m;
 else v_money:='[]'::jsonb;end if;
 return jsonb_build_object('packs',v_packs,'movements',v_money);
end;$fn$;
create or replace function public.aerosuite_finance_action(
 p_institution_id uuid,p_operation text,p_student_id uuid default null,p_booking_id uuid default null,
 p_pack_id uuid default null,p_minutes integer default null,p_amount numeric default null,
 p_currency text default 'ARS',p_description text default ''
) returns jsonb language plpgsql security definer set search_path='' as $fn$
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
end;$fn$;
revoke all on function public.aerosuite_reports_list(uuid),public.aerosuite_report_action(uuid,uuid,text,integer,numeric,numeric,text,text,text),public.aerosuite_finance_snapshot(uuid),public.aerosuite_finance_action(uuid,text,uuid,uuid,uuid,integer,numeric,text,text) from public,anon;
grant execute on function public.aerosuite_reports_list(uuid),public.aerosuite_report_action(uuid,uuid,text,integer,numeric,numeric,text,text,text),public.aerosuite_finance_snapshot(uuid),public.aerosuite_finance_action(uuid,text,uuid,uuid,uuid,integer,numeric,text,text) to authenticated;
