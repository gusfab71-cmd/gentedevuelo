-- Publicación semanal masiva, atómica y sin duplicar horarios existentes.
create or replace function public.aerosuite_availability_publish_full_week(
 p_institution_id uuid,
 p_week_start date,
 p_activity text,
 p_resources text[],
 p_capacity integer default 1
) returns jsonb
language plpgsql security definer set search_path='' as $fn$
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
 foreach v_resource in array v_resources loop
  for v_day in 0..6 loop
   foreach v_time in array array[
    time '08:00',time '09:30',time '11:00',time '12:30',
    time '14:00',time '15:30',time '17:00',time '18:30'
   ] loop
    v_start:=((p_week_start+v_day)+v_time) at time zone 'America/Argentina/Buenos_Aires';
    if v_start<=v_now or v_start>v_now+interval '90 days' then
     v_skipped:=v_skipped+1;continue;
    end if;
    if exists(select 1 from public.aerosuite_availability_slots s
     where s.institution_id=p_institution_id and s.activity=p_activity
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
    where public.aerosuite_availability_slots.published_at is null
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
end $fn$;
revoke all on function public.aerosuite_availability_publish_full_week(uuid,date,text,text[],integer) from public,anon;
grant execute on function public.aerosuite_availability_publish_full_week(uuid,date,text,text[],integer) to authenticated;

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
  'published',s.published_at is not null,'bookable', (s.activity<>'flight' or upper(s.resource_label) not like 'LV-%' or exists(select 1 from public.aerosuite_aircraft_registry a where a.institution_id=p_institution_id and a.registration=upper(s.resource_label) and a.availability='available' and a.archived_at is null))
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
