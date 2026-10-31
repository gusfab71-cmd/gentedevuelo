-- Marcación de reservas saldadas (exclusiva de Dirección/Secretaría).
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_settled_bookings_week(p_institution_id uuid, p_date_from date, p_date_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_mode text;v_list jsonb;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m
 join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria');
 if v_actor is null or v_mode is null or v_mode='blocked' then
  raise exception 'Solo Dirección y Secretaría pueden consultar liquidaciones de vuelos.' using errcode='42501';
 end if;
 if p_date_from is null or p_date_to is null or p_date_to<p_date_from
 or p_date_to>p_date_from+14 then
  raise exception 'Rango semanal inválido.' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'booking_id',b.id,
   'method',case
    when c.method is not null then c.method
    when exists(select 1 from public.aerosuite_pack_usages k
       where k.booking_id=b.id and k.institution_id=p_institution_id) then 'pack'
    else 'hour_payment' end
  ) order by b.starts_at),'[]'::jsonb) into v_list
 from public.aerosuite_flight_bookings b
 left join public.aerosuite_flight_checkouts c
 on c.booking_id=b.id and c.institution_id=p_institution_id
 where b.institution_id=p_institution_id and b.status<>'cancelled'
 and b.starts_at >= (p_date_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
 and b.starts_at < ((p_date_to+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
 and (
   c.id is not null
   or exists(select 1 from public.aerosuite_money_movements m
     where m.booking_id=b.id and m.institution_id=p_institution_id
     and m.movement_type='hour_payment')
   or exists(select 1 from public.aerosuite_pack_usages k
     where k.booking_id=b.id and k.institution_id=p_institution_id)
 );
 return v_list;
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_settled_bookings_week(p_institution_id uuid, p_date_from date, p_date_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_settled_bookings_week(p_institution_id,p_date_from,p_date_to)
$function$
;
revoke all on function public.aerosuite_settled_bookings_week(uuid,date,date) from public,anon;
grant execute on function public.aerosuite_settled_bookings_week(uuid,date,date) to authenticated;
