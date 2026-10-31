-- Cierre de caja y flota por jornada ART. Definición final restringida a Dirección.
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_daily_close_snapshot(p_institution_id uuid, p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_mode text;v_start timestamptz;v_end timestamptz;
 v_money jsonb;v_lines jsonb;v_fleet jsonb;v_unknown jsonb;
 v_pack jsonb;v_close_time timestamptz:=now();
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode from public.aerosuite_institutions i
 join public.aerosuite_institution_members m on m.institution_id=i.id
 where i.id=p_institution_id and m.user_id=v_actor and m.role='administrador';
 if v_actor is null or v_mode is null or v_mode='blocked' then
  raise exception 'Solo Dirección puede consultar el cierre diario.' using errcode='42501';
 end if;
 if p_day is null or p_day>(now() at time zone 'America/Argentina/Buenos_Aires')::date
 or p_day<date '2020-01-01' then
  raise exception 'La fecha de cierre no es válida.' using errcode='22023';
 end if;
 v_start:=(p_day::timestamp at time zone 'America/Argentina/Buenos_Aires');
 v_end:=((p_day+1)::timestamp at time zone 'America/Argentina/Buenos_Aires');
 select coalesce(jsonb_agg(jsonb_build_object(
   'currency',currency,'income',income,'expenses',expenses,'balance',income-expenses,
   'cash_in',cash_in,'bank_in',bank_in,'other_in',other_in,
   'cash_out',cash_out,'bank_out',bank_out,'other_out',other_out,
   'movement_count',count_rows) order by currency),'[]'::jsonb)
 into v_money from (
  select currency,count(*) count_rows,
   coalesce(sum(amount) filter(where movement_type in ('pack_sale','hour_payment')),0) income,
   coalesce(sum(amount) filter(where movement_type in ('expense','petty_expense','refund')),0) expenses,
   coalesce(sum(amount) filter(where movement_type in ('pack_sale','hour_payment') and payment_method='cash'),0) cash_in,
   coalesce(sum(amount) filter(where movement_type in ('pack_sale','hour_payment') and payment_method='bank_transfer'),0) bank_in,
   coalesce(sum(amount) filter(where movement_type in ('pack_sale','hour_payment') and payment_method not in('cash','bank_transfer')),0) other_in,
   coalesce(sum(amount) filter(where movement_type in ('expense','petty_expense','refund') and payment_method='cash'),0) cash_out,
   coalesce(sum(amount) filter(where movement_type in ('expense','petty_expense','refund') and payment_method='bank_transfer'),0) bank_out,
   coalesce(sum(amount) filter(where movement_type in ('expense','petty_expense','refund') and payment_method not in('cash','bank_transfer')),0) other_out
  from public.aerosuite_money_movements
  where institution_id=p_institution_id and created_at>=v_start and created_at<v_end
  group by currency
 ) totals;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',m.id,'type',m.movement_type,'amount',m.amount,'currency',m.currency,
   'method',m.payment_method,'description',m.description,
   'category',m.expense_category,'at',m.created_at,'student',u.email,
   'booking_id',m.booking_id) order by m.created_at,m.id),'[]'::jsonb)
 into v_lines from public.aerosuite_money_movements m
 left join auth.users u on u.id=m.student_id
 where m.institution_id=p_institution_id and m.created_at>=v_start and m.created_at<v_end;

 -- El día de actividad corresponde a la reserva en ART. Los horarios reales del Libro siguen en UTC.
 with approved as (
  select upper(btrim(coalesce(nullif(r.logbook_entry->>'aircraft_registration',''),
    nullif(c.aircraft_registration,''),nullif(b.aircraft,''),''))) as registration,
   r.flight_minutes as minutes,b.starts_at,'approved'::text kind
  from public.aerosuite_flight_reports r
  join public.aerosuite_flight_bookings b on b.id=r.booking_id and b.institution_id=r.institution_id
  left join public.aerosuite_flight_checkouts c on c.booking_id=b.id and c.institution_id=b.institution_id
  where r.institution_id=p_institution_id and r.status='approved'
 ),
 provisional as (
  select upper(btrim(coalesce(nullif(c.aircraft_registration,''),nullif(b.aircraft,''),''))) registration,
    c.book_minutes minutes,b.starts_at,'provisional'::text kind
  from public.aerosuite_flight_checkouts c
  join public.aerosuite_flight_bookings b on b.id=c.booking_id and b.institution_id=c.institution_id
  where c.institution_id=p_institution_id
  and not exists(select 1 from public.aerosuite_flight_reports r
   where r.booking_id=c.booking_id and r.institution_id=c.institution_id and r.status='approved')
 ),
 totals as (
  select registration,
   coalesce(sum(minutes) filter(where kind='approved'),0)::bigint approved_minutes,
   coalesce(sum(minutes) filter(where kind='provisional'),0)::bigint provisional_minutes,
   coalesce(sum(minutes) filter(where kind='approved' and starts_at>=v_start and starts_at<v_end),0)::bigint approved_day_minutes,
   coalesce(sum(minutes) filter(where kind='provisional' and starts_at>=v_start and starts_at<v_end),0)::bigint provisional_day_minutes
  from (select * from approved union all select * from provisional) x group by registration
 )
 select
  (select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'registration',a.registration,'model',a.model,'availability',a.availability,
    'remarks',a.remarks,'status_changed_on',a.status_changed_on,
    'out_of_service_since',a.out_of_service_since,
    'out_of_service_reason',a.out_of_service_reason,'service_location',a.service_location,
    'approved_minutes',coalesce(t.approved_minutes,0),
    'provisional_minutes',coalesce(t.provisional_minutes,0),
    'approved_day_minutes',coalesce(t.approved_day_minutes,0),
    'provisional_day_minutes',coalesce(t.provisional_day_minutes,0)
   ) order by a.registration),'[]'::jsonb)
   from public.aerosuite_aircraft_registry a
   left join totals t on t.registration=a.registration
   where a.institution_id=p_institution_id),
  (select coalesce(jsonb_agg(jsonb_build_object(
   'registration',coalesce(nullif(t.registration,''),'MATRÍCULA SIN INFORMAR'),
   'approved_minutes',t.approved_minutes,'provisional_minutes',t.provisional_minutes
   ) order by t.registration),'[]'::jsonb)
   from totals t where not exists(
    select 1 from public.aerosuite_aircraft_registry a where a.institution_id=p_institution_id and a.registration=t.registration))
 into v_fleet,v_unknown;

 select jsonb_build_object(
   'count',count(*),'minutes',coalesce(sum(u.minutes),0))
 into v_pack
 from public.aerosuite_pack_usages u where u.institution_id=p_institution_id
 and u.created_at>=v_start and u.created_at<v_end;
 return jsonb_build_object(
  'day',p_day,'as_of',v_close_time,'zone','America/Argentina/Buenos_Aires',
  'finances',v_money,'movements',v_lines,'pack_consumptions',v_pack,
  'fleet',v_fleet,'not_registered_aircraft',v_unknown,
  'note','Cierre operativo: ingresos y egresos efectivamente registrados. No es ganancia ni saldo bancario. Horas validadas: informes aprobados; provisionales: vuelos liquidados pendientes de informe aprobado. Actividad del día basada en turno ART; Libro de Vuelo UTC.');
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_daily_close_snapshot(p_institution_id uuid, p_day date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_daily_close_snapshot(p_institution_id,p_day)
$function$
;
revoke all on function public.aerosuite_daily_close_snapshot(uuid,date),aerosuite_internal.aerosuite_daily_close_snapshot(uuid,date) from public,anon;
grant execute on function public.aerosuite_daily_close_snapshot(uuid,date),aerosuite_internal.aerosuite_daily_close_snapshot(uuid,date) to authenticated;
