
create or replace function public.aerosuite_pilot_hours_summary(p_institution_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid();v_allowed boolean;v_total integer;v_count integer;v_last timestamptz;v_history jsonb;
begin
 select exists(select 1 from public.aerosuite_institution_members m
 join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role='piloto'
 and private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())<>'blocked') into v_allowed;
 if v_actor is null or not v_allowed then raise exception 'No tenés acceso a las horas de piloto en esta institución.' using errcode='42501';end if;
 select coalesce(sum(c.book_minutes),0)::integer,count(*)::integer,max(c.recorded_at)
 into v_total,v_count,v_last
 from public.aerosuite_flight_checkouts c
 where c.institution_id=p_institution_id and c.student_id=v_actor;
 select coalesce(jsonb_agg(jsonb_build_object('date',x.recorded_at,'minutes',x.book_minutes,
 'aircraft',x.aircraft_registration,'method',x.method) order by x.recorded_at desc),'[]'::jsonb) into v_history
 from (select recorded_at,book_minutes,aircraft_registration,method
 from public.aerosuite_flight_checkouts
 where institution_id=p_institution_id and student_id=v_actor order by recorded_at desc limit 60) x;
 return jsonb_build_object('total_minutes',v_total,'flight_count',v_count,'last_flight',v_last,'history',v_history);
end $fn$;
revoke all on function public.aerosuite_pilot_hours_summary(uuid) from public,anon;
grant execute on function public.aerosuite_pilot_hours_summary(uuid) to authenticated;
