-- Matrícula real al cierre y datos de fuera de servicio. Reproducible en el orden de migraciones.
alter table public.aerosuite_flight_checkouts add column if not exists aircraft_registration text not null default '';
alter table public.aerosuite_aircraft_registry
 add column if not exists status_changed_on date,
 add column if not exists out_of_service_since date,
 add column if not exists out_of_service_reason text not null default '',
 add column if not exists service_location text not null default '';
create index if not exists aerosuite_checkouts_aircraft_by_institution on public.aerosuite_flight_checkouts(institution_id,aircraft_registration);
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_aircraft_service_update(p_institution_id uuid, p_aircraft_id uuid, p_availability text, p_from_date date, p_reason text, p_location text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_mode text;
 v_old public.aerosuite_aircraft_registry%rowtype;
begin
 select private.aerosuite_access_mode(o.status,o.trial_ends_at,o.license_ends_at,now()) into v_mode
 from public.aerosuite_institutions o join public.aerosuite_institution_members m on m.institution_id=o.id
 where o.id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria');
 if v_actor is null or v_mode not in('trial','grace','active') then
  raise exception 'Solo Dirección y Secretaría pueden actualizar la flota.' using errcode='42501';
 end if;
 if p_availability not in('available','out_of_service') or length(btrim(coalesce(p_location,'')))>180
 or length(btrim(coalesce(p_reason,'')))>300 or p_from_date is null
 or p_from_date> (now() at time zone 'America/Argentina/Buenos_Aires')::date
 or p_from_date<date '2000-01-01' then
  raise exception 'Indicá estado, fecha, motivo y ubicación válidos.' using errcode='22023';
 end if;
 if p_availability='out_of_service' and
 (length(btrim(coalesce(p_reason,'')))<5 or length(btrim(coalesce(p_location,'')))<3) then
  raise exception 'Para sacar de servicio indicá el motivo y dónde se encuentra.' using errcode='22023';
 end if;
 select * into v_old from public.aerosuite_aircraft_registry a
 where a.institution_id=p_institution_id and a.id=p_aircraft_id for update;
 if not found then raise exception 'La aeronave no pertenece a esta institución.' using errcode='P0002';end if;
 update public.aerosuite_aircraft_registry a
 set availability=p_availability,status_changed_on=p_from_date,
  out_of_service_since=case when p_availability='out_of_service' then p_from_date else null end,
  out_of_service_reason=case when p_availability='out_of_service' then btrim(p_reason) else '' end,
  service_location=btrim(coalesce(p_location,'')),
  remarks=case when p_availability='out_of_service' then left(btrim(p_reason),300) else a.remarks end,
  updated_by=v_actor,updated_at=now()
 where a.institution_id=p_institution_id and a.id=p_aircraft_id;
 insert into public.aerosuite_aircraft_changes(institution_id,aircraft_id,actor_id,before_data,after_data)
  select p_institution_id,p_aircraft_id,v_actor,to_jsonb(v_old),to_jsonb(a)
  from public.aerosuite_aircraft_registry a where a.id=p_aircraft_id;
 return jsonb_build_object('ok',true,'aircraft_id',p_aircraft_id,'availability',p_availability);
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_aircraft_service_update(p_institution_id uuid, p_aircraft_id uuid, p_availability text, p_from_date date, p_reason text, p_location text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_aircraft_service_update(
  p_institution_id,p_aircraft_id,p_availability,p_from_date,p_reason,p_location)
$function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_checkout_flight_with_aircraft(p_institution_id uuid, p_booking_id uuid, p_book_minutes integer, p_mode text, p_aircraft_registration text, p_pack_id uuid DEFAULT NULL::uuid, p_amount numeric DEFAULT NULL::numeric, p_currency text DEFAULT 'ARS'::text, p_bank_ref text DEFAULT ''::text, p_fiscal_ref text DEFAULT ''::text, p_note text DEFAULT ''::text, p_request_id uuid DEFAULT NULL::uuid, p_book_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_reg text:=upper(btrim(coalesce(p_aircraft_registration,'')));
 v_existing text;v_log text;v_out jsonb;
begin
 if length(v_reg) not between 3 and 18 or v_reg !~ '^[A-Z0-9][A-Z0-9 -]{2,17}$' then
  raise exception 'Indicá una matrícula válida (ej.: LV-ABC) para el vuelo realizado.' using errcode='22023';
 end if;
 select c.aircraft_registration into v_existing
 from public.aerosuite_flight_checkouts c
 where c.institution_id=p_institution_id and c.booking_id=p_booking_id;
 if found and v_existing<>'' and v_existing<>v_reg then
  raise exception 'Este vuelo ya fue liquidado con otra matrícula. Revisá con Dirección.' using errcode='22023';
 end if;
 select upper(btrim(coalesce(r.logbook_entry->>'aircraft_registration',''))) into v_log
 from public.aerosuite_flight_reports r
 where r.institution_id=p_institution_id and r.booking_id=p_booking_id and r.status='approved';
 if coalesce(v_log,'')<>'' and v_log<>v_reg then
  raise exception 'La matrícula no coincide con el Libro de Vuelo aprobado.' using errcode='22023';
 end if;
 -- Cierre financiero existente: autorización, serialización, saldo de pack, antidualidad.
 v_out:=aerosuite_internal.aerosuite_checkout_flight_at_desk(
  p_institution_id,p_booking_id,p_book_minutes,p_mode,p_pack_id,p_amount,p_currency,
  p_bank_ref,p_fiscal_ref,p_note,p_request_id,p_book_confirmed
 );
 update public.aerosuite_flight_checkouts c set aircraft_registration=v_reg
 where c.institution_id=p_institution_id and c.booking_id=p_booking_id
 and (c.aircraft_registration='' or c.aircraft_registration=v_reg);
 if not found then raise exception 'No fue posible asociar la aeronave al cierre de vuelo.';end if;
 update public.aerosuite_flight_bookings b
 set aircraft=v_reg,updated_by=auth.uid(),updated_at=now()
 where b.id=p_booking_id and b.institution_id=p_institution_id and b.status<>'cancelled'
 and coalesce(b.aircraft,'')<>v_reg;
 return v_out||jsonb_build_object('aircraft_registration',v_reg);
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_checkout_flight_with_aircraft(p_institution_id uuid, p_booking_id uuid, p_book_minutes integer, p_mode text, p_aircraft_registration text, p_pack_id uuid DEFAULT NULL::uuid, p_amount numeric DEFAULT NULL::numeric, p_currency text DEFAULT 'ARS'::text, p_bank_ref text DEFAULT ''::text, p_fiscal_ref text DEFAULT ''::text, p_note text DEFAULT ''::text, p_request_id uuid DEFAULT NULL::uuid, p_book_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_checkout_flight_with_aircraft(
  p_institution_id,p_booking_id,p_book_minutes,p_mode,p_aircraft_registration,
  p_pack_id,p_amount,p_currency,p_bank_ref,p_fiscal_ref,p_note,p_request_id,p_book_confirmed)
$function$
;
revoke all on function public.aerosuite_aircraft_service_update(uuid,uuid,text,date,text,text),public.aerosuite_checkout_flight_with_aircraft(uuid,uuid,integer,text,text,uuid,numeric,text,text,text,text,uuid,boolean) from public,anon;
revoke all on function aerosuite_internal.aerosuite_aircraft_service_update(uuid,uuid,text,date,text,text),aerosuite_internal.aerosuite_checkout_flight_with_aircraft(uuid,uuid,integer,text,text,uuid,numeric,text,text,text,text,uuid,boolean) from public,anon;
grant execute on function public.aerosuite_aircraft_service_update(uuid,uuid,text,date,text,text),public.aerosuite_checkout_flight_with_aircraft(uuid,uuid,integer,text,text,uuid,numeric,text,text,text,text,uuid,boolean) to authenticated;
grant execute on function aerosuite_internal.aerosuite_aircraft_service_update(uuid,uuid,text,date,text,text),aerosuite_internal.aerosuite_checkout_flight_with_aircraft(uuid,uuid,integer,text,text,uuid,numeric,text,text,text,text,uuid,boolean) to authenticated;
