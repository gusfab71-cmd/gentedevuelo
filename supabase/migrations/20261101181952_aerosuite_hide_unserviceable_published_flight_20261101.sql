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
   and starts_at<(p_week_start+7)::timestamp at time zone 'America/Argentina/Buenos_Aires'
   and (activity<>'flight' or upper(resource_label) not like 'LV-%'
    or exists(select 1 from public.aerosuite_aircraft_registry a
     where a.institution_id=p_institution_id and a.registration=upper(resource_label)
       and a.availability='available' and a.archived_at is null));
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
   if v_slot.activity='flight' and upper(v_slot.resource_label) like 'LV-%'
    and not exists(select 1 from public.aerosuite_aircraft_registry a
      where a.institution_id=p_institution_id and a.registration=upper(v_slot.resource_label)
        and a.availability='available' and a.archived_at is null) then
    raise exception 'La aeronave está fuera de servicio. No puede publicarse.' using errcode='22023';
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

