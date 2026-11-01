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