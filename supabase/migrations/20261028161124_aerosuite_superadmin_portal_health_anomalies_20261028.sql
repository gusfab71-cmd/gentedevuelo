-- Ampliación de comprobaciones de integridad de solo lectura; sin datos personales.
-- AeroSuite: diagnóstico agregado por institución para revisión de portales.
-- No expone usuarios, correos, montos, notas ni identidades. Solo Superadmin.
create or replace function public.aerosuite_superadmin_portal_health(p_institution_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare v_org public.aerosuite_institutions%rowtype;
begin
 if auth.uid() is null or not exists(
   select 1 from public.aerosuite_superadmins sa where sa.user_id=auth.uid()
 ) then
   raise exception 'Solo Superadministración puede consultar el diagnóstico de portales.' using errcode='42501';
 end if;
 select * into v_org from public.aerosuite_institutions org where org.id=p_institution_id;
 if not found then raise exception 'Institución no encontrada.' using errcode='P0002'; end if;

 return jsonb_build_object(
  'checked_at', now(),
  'institution_id',v_org.id,
  'institution_name',v_org.name,
  'institution_kind',v_org.kind,
  'access_mode',private.aerosuite_access_mode(v_org.status,v_org.trial_ends_at,v_org.license_ends_at,now()),
  'directors',(select count(*) from public.aerosuite_institution_members m where m.institution_id=v_org.id and m.role='administrador'),
  'secretaries',(select count(*) from public.aerosuite_institution_members m where m.institution_id=v_org.id and m.role='secretaria'),
  'instructors',(select count(*) from public.aerosuite_institution_members m where m.institution_id=v_org.id and m.role='instructor'),
  'students',(select count(*) from public.aerosuite_institution_members m where m.institution_id=v_org.id and m.role='alumno'),
  'aircraft_total',(select count(*) from public.aerosuite_aircraft_registry a where a.institution_id=v_org.id),
  'aircraft_available',(select count(*) from public.aerosuite_aircraft_registry a where a.institution_id=v_org.id and a.availability='available'),
  'aircraft_out_of_service',(select count(*) from public.aerosuite_aircraft_registry a where a.institution_id=v_org.id and a.availability='out_of_service'),
  'bookings_pending',(select count(*) from public.aerosuite_flight_bookings b where b.institution_id=v_org.id and b.status='pending'),
  'bookings_confirmed',(select count(*) from public.aerosuite_flight_bookings b where b.institution_id=v_org.id and b.status='confirmed'),
  'bookings_completed',(select count(*) from public.aerosuite_flight_bookings b where b.institution_id=v_org.id and b.status='completed'),
  'bookings_cancelled',(select count(*) from public.aerosuite_flight_bookings b where b.institution_id=v_org.id and b.status='cancelled'),
  'bookings_upcoming',(select count(*) from public.aerosuite_flight_bookings b where b.institution_id=v_org.id and b.status in ('pending','confirmed') and b.starts_at>=now() and b.starts_at<now()+interval '7 days'),
  'reports_submitted',(select count(*) from public.aerosuite_flight_reports r where r.institution_id=v_org.id and r.status='submitted'),
  'reports_returned',(select count(*) from public.aerosuite_flight_reports r where r.institution_id=v_org.id and r.status='returned'),
  'reports_approved',(select count(*) from public.aerosuite_flight_reports r where r.institution_id=v_org.id and r.status='approved'),
  'packs_total',(select count(*) from public.aerosuite_hour_packs p where p.institution_id=v_org.id),
  'pack_minutes_available',(
    select coalesce(sum(p.total_minutes-coalesce((
      select sum(u.minutes) from public.aerosuite_pack_usages u where u.pack_id=p.id
    ),0)),0) from public.aerosuite_hour_packs p where p.institution_id=v_org.id
  ),
  'money_movements_total',(select count(*) from public.aerosuite_money_movements m where m.institution_id=v_org.id),
  'last_booking_at',(select max(b.updated_at) from public.aerosuite_flight_bookings b where b.institution_id=v_org.id),
  'last_report_at',(select max(r.updated_at) from public.aerosuite_flight_reports r where r.institution_id=v_org.id),
  'last_finance_at',(select max(m.created_at) from public.aerosuite_money_movements m where m.institution_id=v_org.id),
  'stale_pending',(
    select count(*) from public.aerosuite_flight_bookings b
    where b.institution_id=v_org.id and b.status='pending' and b.starts_at+interval '90 minutes'<now()
  ),
  'confirmed_without_instructor',(
    select count(*) from public.aerosuite_flight_bookings b
    where b.institution_id=v_org.id and b.status='confirmed' and b.instructor_id is null
  ),
  'completed_without_approved_report',(
    select count(*) from public.aerosuite_flight_bookings b
    where b.institution_id=v_org.id and b.status='completed'
    and not exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=b.id and r.status='approved')
  ),
  'negative_pack_balance',(
    select count(*) from public.aerosuite_hour_packs p where p.institution_id=v_org.id
    and (select coalesce(sum(u.minutes),0) from public.aerosuite_pack_usages u where u.pack_id=p.id)>p.total_minutes
  ),
  'double_settlement',(
    select count(*) from public.aerosuite_flight_bookings b where b.institution_id=v_org.id
    and exists(select 1 from public.aerosuite_pack_usages u where u.booking_id=b.id)
    and exists(select 1 from public.aerosuite_money_movements m where m.booking_id=b.id and m.movement_type='hour_payment')
  ),
  'overlapping_institution_slots',(
    select count(*) from public.aerosuite_flight_bookings b
    join public.aerosuite_flight_bookings c on c.institution_id=b.institution_id and c.id>b.id
    and c.status<>'cancelled'
    and tstzrange(c.starts_at,c.starts_at+interval '90 minutes','[)') &&
        tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)')
    where b.institution_id=v_org.id and b.status<>'cancelled'
  ),
  'instructor_cross_institution_overlap',(
    select count(*) from public.aerosuite_flight_bookings b
    join public.aerosuite_flight_bookings c on c.instructor_id=b.instructor_id and c.id>b.id
    and c.institution_id<>b.institution_id and c.status in ('confirmed','completed')
    and tstzrange(c.starts_at,c.starts_at+interval '90 minutes','[)') &&
        tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)')
    where b.instructor_id is not null and b.status in ('confirmed','completed')
      and (b.institution_id=v_org.id or c.institution_id=v_org.id)
  ),
  'upcoming_slots',(
    select coalesce(jsonb_agg(jsonb_build_object('starts_at',q.starts_at,'status',q.status) order by q.starts_at),'[]'::jsonb)
    from (
      select b.starts_at,b.status from public.aerosuite_flight_bookings b
      where b.institution_id=v_org.id and b.status in ('pending','confirmed')
      and b.starts_at >= now()-interval '1 day' and b.starts_at < now()+interval '14 days'
      order by b.starts_at limit 100
    ) q
  )
 );
end;
$function$;
revoke all on function public.aerosuite_superadmin_portal_health(uuid) from public,anon;
grant execute on function public.aerosuite_superadmin_portal_health(uuid) to authenticated;
