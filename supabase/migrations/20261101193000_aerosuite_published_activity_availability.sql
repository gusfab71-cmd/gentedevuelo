-- AeroSuite: disponibilidad controlada por Secretaría, múltiples actividades y cupos.
-- Esta migración es reproducible en entornos que ya tienen las tablas base de AeroSuite.
create table if not exists public.aerosuite_availability_slots (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 activity text not null check(activity in ('flight','simulator','theory')),
 starts_at timestamptz not null,
 duration_minutes integer not null default 90 check(duration_minutes between 30 and 240),
 resource_label text not null check(length(btrim(resource_label)) between 2 and 90),
 capacity integer not null check(capacity between 1 and 50),
 published_at timestamptz,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint aerosuite_slot_uniq_resource unique(institution_id,activity,starts_at,resource_label)
);
create index if not exists aerosuite_slots_week on public.aerosuite_availability_slots(institution_id,starts_at);
alter table public.aerosuite_availability_slots enable row level security;
revoke all on public.aerosuite_availability_slots from public,anon,authenticated;

create table if not exists public.aerosuite_activity_reservations (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 slot_id uuid not null references public.aerosuite_availability_slots(id) on delete restrict,
 student_id uuid not null references auth.users(id),
 booking_id uuid unique references public.aerosuite_flight_bookings(id) on delete restrict,
 status text not null default 'pending' check(status in ('pending','confirmed','completed','cancelled')),
 cancellation_reason text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 constraint aerosuite_slot_student_unique unique(slot_id,student_id)
);
create index if not exists aerosuite_activity_reservations_by_student on public.aerosuite_activity_reservations(institution_id,student_id,slot_id);
alter table public.aerosuite_activity_reservations enable row level security;
revoke all on public.aerosuite_activity_reservations from public,anon,authenticated;

create table if not exists public.aerosuite_activity_audit (
 id bigint generated always as identity primary key,
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 slot_id uuid references public.aerosuite_availability_slots(id) on delete restrict,
 reservation_id uuid references public.aerosuite_activity_reservations(id) on delete restrict,
 actor_id uuid not null references auth.users(id),
 event text not null,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists aerosuite_activity_audit_inst on public.aerosuite_activity_audit(institution_id,created_at desc);
alter table public.aerosuite_activity_audit enable row level security;
revoke all on public.aerosuite_activity_audit from public,anon,authenticated;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_sync_activity_flight_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.status is distinct from old.status then
  update public.aerosuite_activity_reservations r
  set status=new.status,updated_at=now(),updated_by=new.updated_by,
      cancellation_reason=case when new.status='cancelled' then new.cancellation_reason else r.cancellation_reason end
  where r.booking_id=new.id;
 end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_availability_cancel(p_institution_id uuid, p_reservation_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_mode text;v_res public.aerosuite_activity_reservations%rowtype;
 v_slot public.aerosuite_availability_slots%rowtype;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección o Secretaría pueden cancelar reservas.' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,'')))<3 then
  raise exception 'Indicá el motivo de cancelación.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_res from public.aerosuite_activity_reservations
 where id=p_reservation_id and institution_id=p_institution_id for update;
 if not found or v_res.status='cancelled' then raise exception 'Reserva no activa o inexistente.' using errcode='22023';end if;
 select * into v_slot from public.aerosuite_availability_slots where id=v_res.slot_id;
 if v_slot.starts_at<=now() then raise exception 'La actividad ya comenzó. Requiere revisión administrativa.' using errcode='22023';end if;
 if v_res.booking_id is not null then
  perform public.aerosuite_booking_action(p_institution_id,'cancel',v_res.booking_id,null,null,null,null,p_reason);
 else
  update public.aerosuite_activity_reservations
  set status='cancelled',cancellation_reason=left(btrim(p_reason),250),updated_by=v_actor,updated_at=now()
  where id=v_res.id;
 end if;
 insert into public.aerosuite_activity_audit
  (institution_id,slot_id,reservation_id,actor_id,event,detail)
 values(p_institution_id,v_slot.id,v_res.id,v_actor,'cancelled',jsonb_build_object('reason',p_reason));
 return jsonb_build_object('ok',true);
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_availability_confirm(p_institution_id uuid, p_reservation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_mode text;
 v_res public.aerosuite_activity_reservations%rowtype;
 v_slot public.aerosuite_availability_slots%rowtype;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección o Secretaría pueden confirmar actividades.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_res from public.aerosuite_activity_reservations
 where id=p_reservation_id and institution_id=p_institution_id for update;
 if not found or v_res.status<>'pending' then
  raise exception 'La reserva no está pendiente.' using errcode='22023';end if;
 select * into v_slot from public.aerosuite_availability_slots where id=v_res.slot_id;
 if v_slot.starts_at<=now() then raise exception 'El turno ya comenzó.' using errcode='22023';end if;
 if v_res.booking_id is not null then
  raise exception 'Las reservas de vuelo se confirman desde el detalle, asignando Instructor.' using errcode='22023';
 end if;
 update public.aerosuite_activity_reservations
  set status='confirmed',updated_by=v_actor,updated_at=now() where id=v_res.id;
 insert into public.aerosuite_activity_audit(institution_id,slot_id,reservation_id,actor_id,event)
  values(p_institution_id,v_slot.id,v_res.id,v_actor,'confirmed');
 return jsonb_build_object('ok',true);
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_availability_manage(p_institution_id uuid, p_action text, p_slot_id uuid DEFAULT NULL::uuid, p_activity text DEFAULT NULL::text, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_resource text DEFAULT NULL::text, p_capacity integer DEFAULT 1, p_duration_minutes integer DEFAULT 90, p_week_start date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_mode text;v_id uuid;v_slot public.aerosuite_availability_slots%rowtype;
 v_resource text:=btrim(coalesce(p_resource,''));v_count integer;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección y Secretaría con acceso de escritura pueden publicar horarios.' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 if p_action='create' then
  if p_activity not in ('flight','simulator','theory') or p_starts_at is null
   or p_starts_at<=now() or p_starts_at>now()+interval '90 days'
   or length(v_resource) not between 2 and 90
   or p_duration_minutes not in (90) or p_capacity not between 1 and 50
   or (p_activity='flight' and p_capacity<>1)
  then raise exception 'Actividad, recurso, cupo u horario inválido.' using errcode='22023';end if;
  if p_activity='flight' and upper(v_resource) like 'LV-%' and exists(
   select 1 from public.aerosuite_aircraft_registry a where a.institution_id=p_institution_id
  ) and not exists(
   select 1 from public.aerosuite_aircraft_registry a
   where a.institution_id=p_institution_id and a.registration=upper(v_resource)
    and a.availability='available' and a.archived_at is null
  ) then raise exception 'No se puede publicar un turno de una aeronave fuera de servicio.' using errcode='22023';end if;
  if exists(select 1 from public.aerosuite_availability_slots a
   where a.institution_id=p_institution_id and a.activity=p_activity and lower(a.resource_label)=lower(v_resource)
   and tstzrange(a.starts_at,a.starts_at+a.duration_minutes*interval '1 minute','[)') &&
       tstzrange(p_starts_at,p_starts_at+p_duration_minutes*interval '1 minute','[)')
  ) then raise exception 'Este recurso ya tiene un turno superpuesto.' using errcode='23505';end if;
  insert into public.aerosuite_availability_slots
   (institution_id,activity,starts_at,resource_label,capacity,duration_minutes,created_by)
  values(p_institution_id,p_activity,p_starts_at,
   case when p_activity='flight' and upper(v_resource) like 'LV-%' then upper(v_resource) else v_resource end,
   p_capacity,p_duration_minutes,v_actor) returning id into v_id;
  insert into public.aerosuite_activity_audit(institution_id,slot_id,actor_id,event,detail)
   values(p_institution_id,v_id,v_actor,'draft_created',jsonb_build_object('activity',p_activity,'resource',v_resource,'capacity',p_capacity));
 elsif p_action='publish_week' then
  if p_week_start is null or p_week_start < (now() at time zone 'America/Argentina/Buenos_Aires')::date-7
     or p_week_start > (now() at time zone 'America/Argentina/Buenos_Aires')::date+90
  then raise exception 'Semana fuera del rango permitido.' using errcode='22023';end if;
  update public.aerosuite_availability_slots set published_at=now(),updated_at=now()
  where institution_id=p_institution_id and published_at is null and starts_at>now()
   and starts_at>=p_week_start::timestamp at time zone 'America/Argentina/Buenos_Aires'
   and starts_at<(p_week_start+7)::timestamp at time zone 'America/Argentina/Buenos_Aires';
  get diagnostics v_count=row_count;
  insert into public.aerosuite_activity_audit(institution_id,actor_id,event,detail)
   values(p_institution_id,v_actor,'week_published',jsonb_build_object('week_start',p_week_start,'slots',v_count));
  return jsonb_build_object('ok',true,'published',v_count);
 else
  select * into v_slot from public.aerosuite_availability_slots
   where id=p_slot_id and institution_id=p_institution_id for update;
  if not found then raise exception 'Horario inexistente.' using errcode='P0002';end if;
  if p_action='publish' then
   if v_slot.starts_at<=now() then raise exception 'No se publican horarios ya iniciados.' using errcode='22023';end if;
   update public.aerosuite_availability_slots set published_at=now(),updated_at=now() where id=v_slot.id;
  elsif p_action='hide' then
   if exists(select 1 from public.aerosuite_activity_reservations r where r.slot_id=v_slot.id and r.status in('pending','confirmed','completed')) then
    raise exception 'Este turno tiene alumnos. Gestioná las reservas antes de retirarlo.' using errcode='22023';
   end if;
   update public.aerosuite_availability_slots set published_at=null,updated_at=now() where id=v_slot.id;
  elsif p_action='discard' then
   if exists(select 1 from public.aerosuite_activity_reservations r where r.slot_id=v_slot.id) then
    raise exception 'Este turno tiene historial de reservas y no puede eliminarse.' using errcode='22023';
   end if;
   delete from public.aerosuite_availability_slots where id=v_slot.id;
  else raise exception 'Acción inválida.' using errcode='22023';
  end if;
  v_id=v_slot.id;
  insert into public.aerosuite_activity_audit(institution_id,slot_id,actor_id,event,detail)
   values(p_institution_id,case when p_action='discard' then null else v_id end,v_actor,p_action,
    jsonb_build_object('slot_id',v_id,'activity',v_slot.activity));
 end if;
 return jsonb_build_object('ok',true,'slot_id',v_id,'action',p_action);
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_availability_reserve(p_institution_id uuid, p_slot_id uuid, p_student_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_role text;v_mode text;v_slot public.aerosuite_availability_slots%rowtype;
 v_student uuid;v_res_id uuid;v_booking_id uuid;v_count integer;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_role,v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria','alumno') limit 1;
 if v_actor is null or v_role is null or v_mode not in('trial','active','grace') then
  raise exception 'Sin autorización para reservar en esta escuela.' using errcode='42501';
 end if;
 v_student:=case when v_role='alumno' then v_actor else p_student_id end;
 if v_student is null or not exists(select 1 from public.aerosuite_institution_members m
  where m.institution_id=p_institution_id and m.user_id=v_student and m.role='alumno') then
  raise exception 'Elegí un alumno registrado en la institución.' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_slot from public.aerosuite_availability_slots
 where id=p_slot_id and institution_id=p_institution_id for update;
 if not found or v_slot.published_at is null or v_slot.starts_at<=now()
   or v_slot.starts_at>now()+interval '90 days' then
  raise exception 'Este horario no está publicado o ya venció.' using errcode='22023';
 end if;
 if v_slot.activity='flight' and upper(v_slot.resource_label) like 'LV-%'
 and not exists(select 1 from public.aerosuite_aircraft_registry a
  where a.institution_id=p_institution_id and a.registration=upper(v_slot.resource_label)
   and a.availability='available' and a.archived_at is null) then
  raise exception 'La aeronave ya no está disponible. Consultá con Secretaría.' using errcode='22023';
 end if;
 if exists(select 1 from public.aerosuite_activity_reservations r
   where r.institution_id=p_institution_id and r.student_id=v_student and r.status<>'cancelled'
     and r.slot_id=v_slot.id) then
  raise exception 'El alumno ya está anotado en este turno.' using errcode='23505';
 end if;
 if exists(select 1 from public.aerosuite_activity_reservations r
    join public.aerosuite_availability_slots s on s.id=r.slot_id
    where r.institution_id=p_institution_id and r.student_id=v_student and r.status in('pending','confirmed')
    and tstzrange(s.starts_at,s.starts_at+s.duration_minutes*interval '1 minute','[)') &&
        tstzrange(v_slot.starts_at,v_slot.starts_at+v_slot.duration_minutes*interval '1 minute','[)')
 ) or exists(select 1 from public.aerosuite_flight_bookings b
    where b.institution_id=p_institution_id and b.student_id=v_student
    and b.status in('pending','confirmed')
    and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
        tstzrange(v_slot.starts_at,v_slot.starts_at+v_slot.duration_minutes*interval '1 minute','[)')
 ) then
  raise exception 'El alumno ya tiene otra actividad en ese horario.' using errcode='23505';
 end if;
 select count(*) into v_count from public.aerosuite_activity_reservations r
  where r.slot_id=v_slot.id and r.status in('pending','confirmed','completed');
 if v_count>=v_slot.capacity then
  raise exception 'No quedan cupos para este horario.' using errcode='23505';
 end if;
 if v_slot.activity='flight' then
  if exists(select 1 from public.aerosuite_flight_bookings b
   where b.institution_id=p_institution_id and b.status in('pending','confirmed')
    and upper(coalesce(b.aircraft,''))=upper(v_slot.resource_label)
    and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
        tstzrange(v_slot.starts_at,v_slot.starts_at+interval '90 minutes','[)')
  ) then raise exception 'Esta aeronave está asignada a otro vuelo.' using errcode='23505';end if;
  insert into public.aerosuite_flight_bookings
   (institution_id,student_id,starts_at,status,created_by,updated_by)
  values(p_institution_id,v_student,v_slot.starts_at,'pending',v_actor,v_actor)
  returning id into v_booking_id;
  insert into public.aerosuite_flight_booking_audit
   (institution_id,booking_id,actor_id,event,after_data)
  values(p_institution_id,v_booking_id,v_actor,'requested',jsonb_build_object(
    'student_id',v_student,'starts_at',v_slot.starts_at,'availability_slot_id',v_slot.id));
 end if;
 insert into public.aerosuite_activity_reservations
  (institution_id,slot_id,student_id,booking_id,created_by)
 values(p_institution_id,v_slot.id,v_student,v_booking_id,v_actor) returning id into v_res_id;
 insert into public.aerosuite_activity_audit
  (institution_id,slot_id,reservation_id,actor_id,event,detail)
 values(p_institution_id,v_slot.id,v_res_id,v_actor,'reserved',jsonb_build_object(
  'student_id',v_student,'activity',v_slot.activity,'booking_id',v_booking_id));
 return jsonb_build_object('ok',true,'reservation_id',v_res_id,'booking_id',v_booking_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_availability_week(p_institution_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_role text;v_mode text;v_slots jsonb;v_reservations jsonb;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_role,v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria','alumno','instructor') limit 1;
 if v_actor is null or v_role is null or v_mode='blocked' then
  raise exception 'Sin acceso a la agenda institucional.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to>p_from+14 then
  raise exception 'Período inválido.' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'activity',s.activity,'starts_at',s.starts_at,'duration_minutes',s.duration_minutes,
  'resource',case when v_role in('administrador','secretaria','instructor') then s.resource_label else null end,
  'capacity',s.capacity,'reserved',coalesce(counts.n,0),
  'published',s.published_at is not null
 ) order by s.starts_at,s.activity,s.resource_label),'[]'::jsonb) into v_slots
 from public.aerosuite_availability_slots s
 left join lateral (select count(*) n from public.aerosuite_activity_reservations r
   where r.slot_id=s.id and r.status in('pending','confirmed','completed')) counts on true
 where s.institution_id=p_institution_id
 and s.starts_at>=p_from::timestamp at time zone 'America/Argentina/Buenos_Aires'
 and s.starts_at<(p_to+1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
 and (v_role in('administrador','secretaria') or s.published_at is not null);
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'slot_id',r.slot_id,'booking_id',r.booking_id,'student_id',
  case when v_role in('administrador','secretaria','instructor') or r.student_id=v_actor then r.student_id else null end,
  'student_email',case when v_role in('administrador','secretaria','instructor') or r.student_id=v_actor then u.email else null end,
  'my_booking',r.student_id=v_actor,'status',r.status,
  'starts_at',s.starts_at,'activity',s.activity
 ) order by s.starts_at),'[]'::jsonb) into v_reservations
 from public.aerosuite_activity_reservations r
 join public.aerosuite_availability_slots s on s.id=r.slot_id
 left join auth.users u on u.id=r.student_id
 where r.institution_id=p_institution_id and r.status<>'cancelled'
 and s.starts_at>=p_from::timestamp at time zone 'America/Argentina/Buenos_Aires'
 and s.starts_at<(p_to+1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
 and (v_role in('administrador','secretaria') or r.student_id=v_actor);
 return jsonb_build_object('slots',v_slots,'reservations',v_reservations);
end $function$
;

drop trigger if exists aerosuite_activity_booking_status_sync on public.aerosuite_flight_bookings;
create trigger aerosuite_activity_booking_status_sync after update of status on public.aerosuite_flight_bookings
for each row execute function aerosuite_internal.aerosuite_sync_activity_flight_status();

revoke all on function public.aerosuite_availability_manage(uuid,text,uuid,text,timestamptz,text,integer,integer,date) from public,anon;
grant execute on function public.aerosuite_availability_manage(uuid,text,uuid,text,timestamptz,text,integer,integer,date) to authenticated;
revoke all on function public.aerosuite_availability_reserve(uuid,uuid,uuid) from public,anon;
grant execute on function public.aerosuite_availability_reserve(uuid,uuid,uuid) to authenticated;
revoke all on function public.aerosuite_availability_cancel(uuid,uuid,text) from public,anon;
grant execute on function public.aerosuite_availability_cancel(uuid,uuid,text) to authenticated;
revoke all on function public.aerosuite_availability_confirm(uuid,uuid) from public,anon;
grant execute on function public.aerosuite_availability_confirm(uuid,uuid) to authenticated;
revoke all on function public.aerosuite_availability_week(uuid,date,date) from public,anon;
grant execute on function public.aerosuite_availability_week(uuid,date,date) to authenticated;
