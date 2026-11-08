alter table public.aerosuite_availability_slots add column if not exists retired_at timestamptz;
alter table public.aerosuite_flight_bookings add column if not exists with_instructor boolean not null default true;
create index if not exists aerosuite_slots_active_week_idx
 on public.aerosuite_availability_slots(institution_id,starts_at) where retired_at is null;

CREATE OR REPLACE FUNCTION public.aerosuite_availability_publish_full_week(p_institution_id uuid, p_week_start date, p_activity text, p_resources text[], p_capacity integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();
 v_role text;
 v_mode text;
 v_resources text[];
 v_resource text;
 v_day integer;
 v_time time;
 v_start timestamptz;
 v_id uuid;
 v_created integer:=0;
 v_skipped integer:=0;
 v_candidate integer:=0;
 v_now timestamptz:=now();
 v_today date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,v_now)
 into v_role,v_mode from public.aerosuite_institution_members m
 join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_role is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección y Secretaría pueden publicar horarios.' using errcode='42501';
 end if;
 if p_activity not in('flight','simulator','theory') or p_capacity not between 1 and 50
 or (p_activity='flight' and p_capacity<>1)
 or p_week_start is null or extract(isodow from p_week_start)<>1
 or p_week_start < v_today-6 or p_week_start > v_today+83
 then raise exception 'Actividad, cupos o semana inválidos.' using errcode='22023';end if;
 if coalesce(array_length(p_resources,1),0) not between 1 and 20 then
  raise exception 'Seleccioná entre 1 y 20 recursos para publicar.' using errcode='22023';end if;
 select array_agg(distinct case when p_activity='flight' then upper(btrim(x)) else btrim(x) end)
 into v_resources from unnest(p_resources) x;
 if exists(select 1 from unnest(v_resources) x where length(x) not between 2 and 90)
 then raise exception 'Todos los recursos deben tener nombres válidos.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 if p_activity='flight' then
  foreach v_resource in array v_resources loop
   if not exists(select 1 from public.aerosuite_aircraft_registry a
    where a.institution_id=p_institution_id and a.registration=v_resource
     and a.availability='available' and a.archived_at is null) then
    raise exception 'La aeronave % no está registrada y disponible en Flota.', v_resource using errcode='22023';
   end if;
  end loop;
 end if;
 if p_activity='simulator' then
  foreach v_resource in array v_resources loop
   if not exists(select 1 from public.aerosuite_simulators s
    where s.institution_id=p_institution_id and lower(s.name)=lower(v_resource)
     and s.availability='available' and s.archived_at is null) then
    raise exception 'El simulador % no está registrado y disponible en Flota.',v_resource using errcode='22023';
   end if;
  end loop;
 end if;
 foreach v_resource in array v_resources loop
  for v_day in 0..6 loop
   foreach v_time in array array[
    time '08:30',time '10:00',time '11:30',
    time '13:00',time '14:30',time '16:00'
   ] loop
    v_start:=((p_week_start+v_day)+v_time) at time zone 'America/Argentina/Buenos_Aires';
    if v_start<=v_now or v_start>v_now+interval '90 days' then
     v_skipped:=v_skipped+1;continue;
    end if;
    if exists(select 1 from public.aerosuite_availability_slots s
     where s.institution_id=p_institution_id and s.activity=p_activity and s.retired_at is null
     and lower(s.resource_label)=lower(v_resource) and s.starts_at<>v_start
     and tstzrange(s.starts_at,s.starts_at+s.duration_minutes*interval '1 minute','[)') &&
         tstzrange(v_start,v_start+interval '90 minutes','[)')
    ) then
     v_skipped:=v_skipped+1;continue;
    end if;
    v_candidate:=v_candidate+1;
    v_id:=null;
    insert into public.aerosuite_availability_slots
     (institution_id,activity,starts_at,duration_minutes,resource_label,capacity,published_at,created_by)
    values(p_institution_id,p_activity,v_start,90,v_resource,p_capacity,v_now,v_actor)
    on conflict(institution_id,activity,starts_at,resource_label)
    do update set published_at=coalesce(public.aerosuite_availability_slots.published_at,excluded.published_at),
     updated_at=v_now
    where public.aerosuite_availability_slots.published_at is null and public.aerosuite_availability_slots.retired_at is null
    returning id into v_id;
    if v_id is not null then v_created:=v_created+1;end if;
   end loop;
  end loop;
 end loop;
 insert into public.aerosuite_activity_audit(institution_id,actor_id,event,detail)
 values(p_institution_id,v_actor,'weekly_bulk_published',
  jsonb_build_object('week_start',p_week_start,'activity',p_activity,'resources',v_resources,
   'newly_published',v_created,'considered',v_candidate,'skipped',v_skipped,'capacity',p_capacity));
 return jsonb_build_object('ok',true,'week_start',p_week_start,'activity',p_activity,
  'resources',v_resources,'newly_published',v_created,'already_published',v_candidate-v_created,
  'skipped',v_skipped);
end $function$;

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
   or (p_starts_at at time zone 'America/Argentina/Buenos_Aires')::time not in (time '08:30',time '10:00',time '11:30',time '13:00',time '14:30',time '16:00')
   or p_starts_at<=now() or p_starts_at>now()+interval '90 days'
   or length(v_resource) not between 2 and 90
   or p_duration_minutes not in (90) or p_capacity not between 1 and 50
   or (p_activity='flight' and p_capacity<>1)
  then raise exception 'Actividad, recurso, cupo u horario inválido.' using errcode='22023';end if;
  if p_activity='flight' and not exists(
   select 1 from public.aerosuite_aircraft_registry a
   where a.institution_id=p_institution_id and a.registration=upper(v_resource)
    and a.availability='available' and a.archived_at is null
  ) then raise exception 'No se puede publicar un turno de una aeronave fuera de servicio.' using errcode='22023';end if;
  if p_activity='simulator' and not exists(
   select 1 from public.aerosuite_simulators s where s.institution_id=p_institution_id
    and lower(s.name)=lower(v_resource) and s.availability='available' and s.archived_at is null
  ) then raise exception 'El simulador no está disponible en Flota.' using errcode='22023';end if;
  if exists(select 1 from public.aerosuite_availability_slots a
   where a.institution_id=p_institution_id and a.activity=p_activity and a.retired_at is null and lower(a.resource_label)=lower(v_resource)
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
  where institution_id=p_institution_id and published_at is null and retired_at is null and starts_at>now()
   and starts_at>=p_week_start::timestamp at time zone 'America/Argentina/Buenos_Aires'
   and starts_at<(p_week_start+7)::timestamp at time zone 'America/Argentina/Buenos_Aires'
   and (activity<>'flight' or exists(select 1 from public.aerosuite_aircraft_registry a
     where a.institution_id=p_institution_id and a.registration=upper(resource_label)
       and a.availability='available' and a.archived_at is null))
   and (activity<>'simulator' or exists(select 1 from public.aerosuite_simulators s
     where s.institution_id=p_institution_id and lower(s.name)=lower(resource_label)
       and s.availability='available' and s.archived_at is null));
  get diagnostics v_count=row_count;
  insert into public.aerosuite_activity_audit(institution_id,actor_id,event,detail)
   values(p_institution_id,v_actor,'week_published',jsonb_build_object('week_start',p_week_start,'slots',v_count));
  return jsonb_build_object('ok',true,'published',v_count);
 else
  select * into v_slot from public.aerosuite_availability_slots
   where id=p_slot_id and institution_id=p_institution_id and retired_at is null for update;
  if not found then raise exception 'Horario inexistente.' using errcode='P0002';end if;
  if p_action='publish' then
   if v_slot.starts_at<=now() then raise exception 'No se publican horarios ya iniciados.' using errcode='22023';end if;
   if v_slot.activity='flight' and not exists(select 1 from public.aerosuite_aircraft_registry a
      where a.institution_id=p_institution_id and a.registration=upper(v_slot.resource_label)
        and a.availability='available' and a.archived_at is null) then
    raise exception 'La aeronave está fuera de servicio. No puede publicarse.' using errcode='22023';
   end if;
   if v_slot.activity='simulator' and not exists(select 1 from public.aerosuite_simulators s
    where s.institution_id=p_institution_id and lower(s.name)=lower(v_slot.resource_label)
      and s.availability='available' and s.archived_at is null) then
    raise exception 'El simulador está fuera de servicio o no está registrado.' using errcode='22023';
   end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.aerosuite_availability_edit(p_institution_id uuid, p_slot_id uuid, p_starts_at timestamp with time zone, p_resource text, p_capacity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();
 v_mode text;
 v_slot public.aerosuite_availability_slots%rowtype;
 v_resource text:=btrim(coalesce(p_resource,''));
 v_local timestamp;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode from public.aerosuite_institution_members m
 join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Secretaría y Dirección pueden modificar horarios.' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_slot from public.aerosuite_availability_slots s
 where s.id=p_slot_id and s.institution_id=p_institution_id and s.retired_at is null for update;
 if not found then raise exception 'No se encontró el horario seleccionado.' using errcode='P0002';end if;
 if v_slot.starts_at<=now() then
  raise exception 'Un turno iniciado o vencido no puede modificarse.' using errcode='22023';
 end if;
 if exists(select 1 from public.aerosuite_activity_reservations r where r.slot_id=p_slot_id) then
  raise exception 'Este horario tiene reservas o antecedentes. Reprogramá cada reserva antes de modificarlo.' using errcode='22023';
 end if;
 if p_starts_at is null or p_starts_at<=now() or p_starts_at>now()+interval '90 days' then
  raise exception 'Elegí una fecha futura dentro de los próximos 90 días.' using errcode='22023';
 end if;
 v_local:=p_starts_at at time zone 'America/Argentina/Buenos_Aires';
 if v_local::time not in(time '08:30',time '10:00',time '11:30',
  time '13:00',time '14:30',time '16:00') then
  raise exception 'Elegí un horario de la grilla de 90 minutos (08:30 a 16:00; finalización 17:30).' using errcode='22023';
 end if;
 if length(v_resource) not between 2 and 90 or p_capacity not between 1 and 50
 or (v_slot.activity in('flight','simulator') and p_capacity<>1) then
  raise exception 'El recurso o los cupos no son válidos.' using errcode='22023';
 end if;
 if v_slot.activity='flight' then
  v_resource:=upper(v_resource);
  if not exists(select 1 from public.aerosuite_aircraft_registry a
    where a.institution_id=p_institution_id and a.registration=v_resource
     and a.availability='available' and a.archived_at is null) then
   raise exception 'La aeronave no está habilitada como disponible en Flota.' using errcode='22023';
  end if;
  if exists(select 1 from public.aerosuite_flight_bookings b
    where b.institution_id=p_institution_id and b.status in('pending','confirmed','completed')
      and upper(coalesce(b.aircraft,''))=v_resource
      and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
       tstzrange(p_starts_at,p_starts_at+interval '90 minutes','[)')) then
   raise exception 'La aeronave está asignada a otro vuelo en el horario elegido.' using errcode='23505';
  end if;
 elsif v_slot.activity='simulator' then
  if not exists(select 1 from public.aerosuite_simulators s
    where s.institution_id=p_institution_id and lower(s.name)=lower(v_resource)
     and s.availability='available' and s.archived_at is null) then
   raise exception 'El simulador no está disponible en Flota.' using errcode='22023';
  end if;
 end if;
 if exists(select 1 from public.aerosuite_availability_slots s
    where s.institution_id=p_institution_id and s.id<>v_slot.id and s.retired_at is null
     and s.activity=v_slot.activity and lower(s.resource_label)=lower(v_resource)
     and tstzrange(s.starts_at,s.starts_at+s.duration_minutes*interval '1 minute','[)') &&
         tstzrange(p_starts_at,p_starts_at+interval '90 minutes','[)')) then
  raise exception 'Ya existe un turno superpuesto para ese recurso.' using errcode='23505';
 end if;
 update public.aerosuite_availability_slots set starts_at=p_starts_at,
  resource_label=v_resource,capacity=p_capacity,updated_at=now()
  where id=v_slot.id;
 insert into public.aerosuite_activity_audit(institution_id,slot_id,actor_id,event,detail)
 values(p_institution_id,v_slot.id,v_actor,'slot_edited',
  jsonb_build_object('previous_starts_at',v_slot.starts_at,
   'new_starts_at',p_starts_at,
   'previous_resource',v_slot.resource_label,'new_resource',v_resource,
   'previous_capacity',v_slot.capacity,'new_capacity',p_capacity,
   'published',v_slot.published_at is not null));
 return jsonb_build_object('ok',true,'slot_id',v_slot.id,'starts_at',p_starts_at,
   'resource',v_resource,'capacity',p_capacity,'published',v_slot.published_at is not null);
end $function$;

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
  'resource',s.resource_label,
  'capacity',s.capacity,'reserved',coalesce(counts.n,0),
  'published',s.published_at is not null,'bookable', ((s.activity<>'flight' or exists(select 1 from public.aerosuite_aircraft_registry a where a.institution_id=p_institution_id and a.registration=upper(s.resource_label) and a.availability='available' and a.archived_at is null)) and (s.activity<>'simulator' or exists(select 1 from public.aerosuite_simulators x where x.institution_id=p_institution_id and lower(x.name)=lower(s.resource_label) and x.availability='available' and x.archived_at is null)))
 ) order by s.starts_at,s.activity,s.resource_label),'[]'::jsonb) into v_slots
 from public.aerosuite_availability_slots s
 left join lateral (select count(*) n from public.aerosuite_activity_reservations r
   where r.slot_id=s.id and r.status in('pending','confirmed','completed')) counts on true
 where s.institution_id=p_institution_id and s.retired_at is null
 and s.starts_at>=p_from::timestamp at time zone 'America/Argentina/Buenos_Aires'
 and s.starts_at<(p_to+1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
 and (v_role in('administrador','secretaria') or s.published_at is not null);
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'slot_id',r.slot_id,'booking_id',r.booking_id,'student_id',
  case when v_role in('administrador','secretaria','instructor') or r.student_id=v_actor then r.student_id else null end,
  'student_email',case when v_role in('administrador','secretaria','instructor') or r.student_id=v_actor then u.email else null end,
  'my_booking',r.student_id=v_actor,'status',r.status,
  'with_instructor',case when v_role in('administrador','secretaria','instructor') or r.student_id=v_actor then coalesce(b.with_instructor,true) else null end,
  'starts_at',s.starts_at,'activity',s.activity
 ) order by s.starts_at),'[]'::jsonb) into v_reservations
 from public.aerosuite_activity_reservations r
 join public.aerosuite_availability_slots s on s.id=r.slot_id
 left join public.aerosuite_flight_bookings b on b.id=r.booking_id
 left join auth.users u on u.id=r.student_id
 where r.institution_id=p_institution_id and r.status<>'cancelled'
 and s.starts_at>=p_from::timestamp at time zone 'America/Argentina/Buenos_Aires'
 and s.starts_at<(p_to+1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
 and (v_role in('administrador','secretaria') or r.student_id=v_actor);
 return jsonb_build_object('slots',v_slots,'reservations',v_reservations);
end $function$;

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
 where id=p_slot_id and institution_id=p_institution_id and retired_at is null for update;
 if not found or v_slot.published_at is null or v_slot.starts_at<=now()
   or (v_slot.starts_at at time zone 'America/Argentina/Buenos_Aires')::time not in (time '08:30',time '10:00',time '11:30',time '13:00',time '14:30',time '16:00')
   or v_slot.starts_at>now()+interval '90 days' then
  raise exception 'Este horario no está publicado o ya venció.' using errcode='22023';
 end if;
 if v_slot.activity='flight' and not exists(select 1 from public.aerosuite_aircraft_registry a
  where a.institution_id=p_institution_id and a.registration=upper(v_slot.resource_label)
   and a.availability='available' and a.archived_at is null) then
  raise exception 'La aeronave ya no está disponible. Consultá con Secretaría.' using errcode='22023';
 end if;
 if v_slot.activity='simulator' and not exists(select 1 from public.aerosuite_simulators s
  where s.institution_id=p_institution_id and lower(s.name)=lower(v_slot.resource_label)
    and s.availability='available' and s.archived_at is null) then
  raise exception 'El simulador ya no está disponible. Consultá con Secretaría.' using errcode='22023';
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
end $function$;