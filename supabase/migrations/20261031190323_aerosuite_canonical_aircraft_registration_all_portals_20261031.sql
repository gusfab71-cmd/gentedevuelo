-- Canonical aircraft registration e.g. lvert => LV-ERT for all institutional writes.
-- Preserve existing rows. Do not rewrite financial or flight history.
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_normalize_registration(p_raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v text;
begin
 v:=translate(regexp_replace(upper(btrim(coalesce(p_raw,''))),'[[:space:]]+','','g'),'‐‑‒–—−_','-------');
 if v ~ '^[A-Z]{2}-?[A-Z0-9]*$' then
  v:=replace(v,'-','');
  return substr(v,1,2)||'-'||substr(v,3);
 end if;
 return v;
end $function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_registration_valid(p_raw text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_normalize_registration(p_raw) ~
  '^(?:[A-Z]{2}-[A-Z0-9]{3,5}|[A-Z0-9]{1,3}-[A-Z0-9]{2,6}|[A-Z][A-Z0-9]{2,6})$'
$function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_normalize_registration_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v text;
begin
 if tg_table_name='aerosuite_aircraft_registry' then
  v:=aerosuite_internal.aerosuite_normalize_registration(new.registration);
  if not aerosuite_internal.aerosuite_registration_valid(v) then
   raise exception 'Matrícula inválida: usá LV-ERT o un formato internacional válido.' using errcode='22023';
  end if;
  new.registration:=v;
 elsif tg_table_name='aerosuite_flight_bookings' then
  if btrim(coalesce(new.aircraft,''))<>'' and upper(btrim(new.aircraft)) not in('A DEFINIR','PENDIENTE') then
   v:=aerosuite_internal.aerosuite_normalize_registration(new.aircraft);
   if not aerosuite_internal.aerosuite_registration_valid(v) then
    raise exception 'Matrícula de reserva inválida.' using errcode='22023';
   end if;
   new.aircraft:=v;
  end if;
 elsif tg_table_name='aerosuite_flight_checkouts' then
  if btrim(coalesce(new.aircraft_registration,''))<>'' then
   v:=aerosuite_internal.aerosuite_normalize_registration(new.aircraft_registration);
   if not aerosuite_internal.aerosuite_registration_valid(v) then
    raise exception 'Matrícula de liquidación inválida.' using errcode='22023';
   end if;
   new.aircraft_registration:=v;
  end if;
 elsif tg_table_name='aerosuite_flight_reports' then
  if jsonb_typeof(new.logbook_entry)='object' and
     coalesce(new.logbook_entry->>'aircraft_registration','')<>'' then
   v:=aerosuite_internal.aerosuite_normalize_registration(new.logbook_entry->>'aircraft_registration');
   if not aerosuite_internal.aerosuite_registration_valid(v) then
    raise exception 'Matrícula de Libro de Vuelo inválida.' using errcode='22023';
   end if;
   new.logbook_entry:=jsonb_set(new.logbook_entry,'{aircraft_registration}',to_jsonb(v),true);
  end if;
 end if;
 return new;
end $function$
;
CREATE TRIGGER aerosuite_booking_registration_format BEFORE INSERT OR UPDATE OF aircraft ON public.aerosuite_flight_bookings FOR EACH ROW EXECUTE FUNCTION aerosuite_internal.aerosuite_normalize_registration_before_write();
CREATE TRIGGER aerosuite_checkout_registration_format BEFORE INSERT OR UPDATE OF aircraft_registration ON public.aerosuite_flight_checkouts FOR EACH ROW EXECUTE FUNCTION aerosuite_internal.aerosuite_normalize_registration_before_write();
CREATE TRIGGER aerosuite_logbook_registration_format BEFORE INSERT OR UPDATE OF logbook_entry ON public.aerosuite_flight_reports FOR EACH ROW EXECUTE FUNCTION aerosuite_internal.aerosuite_normalize_registration_before_write();
CREATE TRIGGER aerosuite_registry_registration_format BEFORE INSERT OR UPDATE OF registration ON public.aerosuite_aircraft_registry FOR EACH ROW EXECUTE FUNCTION aerosuite_internal.aerosuite_normalize_registration_before_write();
CREATE OR REPLACE FUNCTION public.aerosuite_aircraft_action(p_institution_id uuid, p_operation text, p_aircraft_id uuid DEFAULT NULL::uuid, p_registration text DEFAULT NULL::text, p_model text DEFAULT NULL::text, p_availability text DEFAULT NULL::text, p_remarks text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_mode text;v_row public.aerosuite_aircraft_registry%rowtype;v_id uuid;
begin
 select private.aerosuite_access_mode(o.status,o.trial_ends_at,o.license_ends_at,now())
 into v_mode from public.aerosuite_institutions o join public.aerosuite_institution_members m on m.institution_id=o.id
 where o.id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria') limit 1;
 if v_mode not in ('trial','grace','active') or v_mode is null then raise exception 'Solo Administración puede actualizar flota.' using errcode='42501';end if;
 if p_operation='create' then
  if not aerosuite_internal.aerosuite_registration_valid(p_registration) then raise exception 'Ingresá una matrícula válida (ej.: LV-ERT).' using errcode='22023';end if;
  insert into public.aerosuite_aircraft_registry(institution_id,registration,model,remarks,created_by,updated_by)
  values(p_institution_id,aerosuite_internal.aerosuite_normalize_registration(p_registration),left(btrim(coalesce(p_model,'')),100),left(btrim(coalesce(p_remarks,'')),300),v_actor,v_actor)
  returning id into v_id;
  insert into public.aerosuite_aircraft_changes(institution_id,aircraft_id,actor_id,after_data)
   select p_institution_id,v_id,v_actor,to_jsonb(a) from public.aerosuite_aircraft_registry a where a.id=v_id;
 elsif p_operation='status' then
  if p_availability not in ('available','out_of_service') then raise exception 'Estado de disponibilidad inválido.' using errcode='22023';end if;
  select * into v_row from public.aerosuite_aircraft_registry where institution_id=p_institution_id and id=p_aircraft_id for update;
  if not found then raise exception 'Aeronave no registrada.' using errcode='P0002';end if;
  update public.aerosuite_aircraft_registry set availability=p_availability,remarks=left(btrim(coalesce(p_remarks,'')),300),
  updated_by=v_actor,updated_at=now() where id=p_aircraft_id;
  insert into public.aerosuite_aircraft_changes(institution_id,aircraft_id,actor_id,before_data,after_data)
   select p_institution_id,p_aircraft_id,v_actor,to_jsonb(v_row),to_jsonb(a) from public.aerosuite_aircraft_registry a where a.id=p_aircraft_id;
  v_id:=p_aircraft_id;
 else raise exception 'Acción de flota desconocida.' using errcode='22023';end if;
 return jsonb_build_object('ok',true,'aircraft_id',v_id,'action',p_operation);
end;$function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_checkout_flight_with_aircraft(p_institution_id uuid, p_booking_id uuid, p_book_minutes integer, p_mode text, p_aircraft_registration text, p_pack_id uuid DEFAULT NULL::uuid, p_amount numeric DEFAULT NULL::numeric, p_currency text DEFAULT 'ARS'::text, p_bank_ref text DEFAULT ''::text, p_fiscal_ref text DEFAULT ''::text, p_note text DEFAULT ''::text, p_request_id uuid DEFAULT NULL::uuid, p_book_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_reg text:=aerosuite_internal.aerosuite_normalize_registration(p_aircraft_registration);
 v_existing text;v_log text;v_out jsonb;
begin
 if not aerosuite_internal.aerosuite_registration_valid(v_reg) then
  raise exception 'Indicá una matrícula válida (ej.: LV-ABC) para el vuelo realizado.' using errcode='22023';
 end if;
 select c.aircraft_registration into v_existing
 from public.aerosuite_flight_checkouts c
 where c.institution_id=p_institution_id and c.booking_id=p_booking_id;
 if found and v_existing<>'' and aerosuite_internal.aerosuite_normalize_registration(v_existing)<>v_reg then
  raise exception 'Este vuelo ya fue liquidado con otra matrícula. Revisá con Dirección.' using errcode='22023';
 end if;
 select aerosuite_internal.aerosuite_normalize_registration(r.logbook_entry->>'aircraft_registration') into v_log
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
 and (c.aircraft_registration='' or aerosuite_internal.aerosuite_normalize_registration(c.aircraft_registration)=v_reg);
 if not found then raise exception 'No fue posible asociar la aeronave al cierre de vuelo.';end if;
 update public.aerosuite_flight_bookings b
 set aircraft=v_reg,updated_by=auth.uid(),updated_at=now()
 where b.id=p_booking_id and b.institution_id=p_institution_id and b.status<>'cancelled'
 and coalesce(b.aircraft,'')<>v_reg;
 return v_out||jsonb_build_object('aircraft_registration',v_reg);
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_submit_flight_report_with_logbook(p_institution_id uuid, p_booking_id uuid, p_flight_minutes integer, p_fuel_liters numeric, p_oil_liters numeric, p_teaching_notes text, p_aircraft_notes text, p_logbook_entry jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid := auth.uid();
 v_saved jsonb;
 v_key text;
 v_data jsonb;
 v_count integer;
 v_count_key text;
BEGIN
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'Necesitás iniciar sesión.' USING errcode='42501';
 END IF;
 IF p_logbook_entry IS NULL OR jsonb_typeof(p_logbook_entry)<>'object'
   OR length(p_logbook_entry::text)>5000 THEN
  RAISE EXCEPTION 'El registro del Libro de Vuelo es inválido.' USING errcode='22023';
 END IF;
 FOR v_key IN SELECT jsonb_object_keys(p_logbook_entry) LOOP
  IF v_key NOT IN ('flight_date','departure_utc','origin','destination',
   'arrival_utc','flight_count','landings_count','aircraft_make','aircraft_registration',
   'aircraft_power','aircraft_class','flight_area','flight_period','flight_role') THEN
   RAISE EXCEPTION 'El registro contiene un campo no permitido.' USING errcode='22023';
  END IF;
 END LOOP;
 IF coalesce(p_logbook_entry->>'flight_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR coalesce(p_logbook_entry->>'departure_utc','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR coalesce(p_logbook_entry->>'arrival_utc','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
  RAISE EXCEPTION 'Completá fecha y horarios reales en UTC (HH:MM).' USING errcode='22023';
 END IF;
 IF (p_logbook_entry->>'flight_date')::date > current_date + 1
   OR (p_logbook_entry->>'flight_date')::date < date '2000-01-01' THEN
  RAISE EXCEPTION 'La fecha del vuelo está fuera de rango.' USING errcode='22023';
 END IF;
 IF length(btrim(coalesce(p_logbook_entry->>'origin',''))) NOT BETWEEN 2 AND 100
  OR length(btrim(coalesce(p_logbook_entry->>'destination',''))) NOT BETWEEN 2 AND 100
  OR length(btrim(coalesce(p_logbook_entry->>'aircraft_make',''))) NOT BETWEEN 2 AND 80
  OR length(btrim(coalesce(p_logbook_entry->>'aircraft_registration',''))) NOT BETWEEN 2 AND 30
  OR length(btrim(coalesce(p_logbook_entry->>'aircraft_class',''))) NOT BETWEEN 2 AND 60
  OR length(coalesce(p_logbook_entry->>'aircraft_power',''))>40
  OR lower(btrim(coalesce(p_logbook_entry->>'aircraft_class',''))) NOT IN ('monomotor','multimotor') THEN
  RAISE EXCEPTION 'Revisá los aeródromos y los datos de la aeronave.' USING errcode='22023';
 END IF;
 -- Los formularios anteriores registraban cantidad de vuelos. La nueva
 -- versión registra aterrizajes; nunca convertir uno en el otro implícitamente.
 IF (p_logbook_entry ? 'flight_count') AND (p_logbook_entry ? 'landings_count') THEN
  RAISE EXCEPTION 'No se pueden combinar vuelos y aterrizajes en un registro.' USING errcode='22023';
 END IF;
 v_count_key := CASE WHEN p_logbook_entry ? 'landings_count' THEN 'landings_count' ELSE 'flight_count' END;
 IF jsonb_typeof(p_logbook_entry->v_count_key)<>'number'
   OR coalesce(p_logbook_entry->>v_count_key,'') !~ '^[0-9]{1,2}$' THEN
  RAISE EXCEPTION 'Indicá la cantidad de %.', CASE WHEN v_count_key='landings_count' THEN 'aterrizajes' ELSE 'vuelos' END USING errcode='22023';
 END IF;
 v_count := (p_logbook_entry->>v_count_key)::integer;
 IF v_count NOT BETWEEN 1 AND (CASE WHEN v_count_key='landings_count' THEN 99 ELSE 20 END) THEN
  RAISE EXCEPTION 'Cantidad de % fuera de rango.', CASE WHEN v_count_key='landings_count' THEN 'aterrizajes' ELSE 'vuelos' END USING errcode='22023';
 END IF;
 IF coalesce(p_logbook_entry->>'flight_area','') NOT IN ('aerodromo','travesia')
  OR coalesce(p_logbook_entry->>'flight_period','') NOT IN ('dia','noche')
  OR coalesce(p_logbook_entry->>'flight_role','') NOT IN ('piloto','copiloto','instructor')
  OR (v_count_key='landings_count' AND p_logbook_entry->>'flight_role'='copiloto') THEN
  RAISE EXCEPTION 'Elegí modalidad y función para registrar el tiempo de vuelo.' USING errcode='22023';
 END IF;
 v_data:=jsonb_build_object(
  'flight_date',p_logbook_entry->>'flight_date',
  'departure_utc',p_logbook_entry->>'departure_utc',
  'origin',btrim(p_logbook_entry->>'origin'),
  'destination',btrim(p_logbook_entry->>'destination'),
  'arrival_utc',p_logbook_entry->>'arrival_utc',
  'aircraft_make',btrim(p_logbook_entry->>'aircraft_make'),
  'aircraft_registration',aerosuite_internal.aerosuite_normalize_registration(p_logbook_entry->>'aircraft_registration'),
  'aircraft_power',btrim(coalesce(p_logbook_entry->>'aircraft_power','')),
  'aircraft_class',lower(btrim(p_logbook_entry->>'aircraft_class')),
  'flight_area',p_logbook_entry->>'flight_area',
  'flight_period',p_logbook_entry->>'flight_period',
  'flight_role',p_logbook_entry->>'flight_role'
 ) || jsonb_build_object(v_count_key,v_count);
 -- Se ejecuta primero el flujo ya existente de autorización, versiones e informes.
 -- Una falla posterior revierte toda la transacción, evitando dejar un informe parcial.
 v_saved:=public.aerosuite_report_action(
  p_institution_id,p_booking_id,'submit',
  p_flight_minutes,p_fuel_liters,p_oil_liters,p_teaching_notes,p_aircraft_notes,NULL
 );
 UPDATE public.aerosuite_flight_reports r
 SET logbook_entry=v_data
 WHERE r.id=(v_saved->>'report_id')::uuid
  AND r.institution_id=p_institution_id
  AND r.booking_id=p_booking_id
  AND r.instructor_id=v_actor
  AND r.status='submitted';
 IF NOT FOUND THEN
  RAISE EXCEPTION 'No se pudo vincular el registro de vuelo al informe.' USING errcode='P0002';
 END IF;
 RETURN v_saved||jsonb_build_object('logbook_saved',true);
END;
$function$
;
revoke all on function aerosuite_internal.aerosuite_normalize_registration(text),
 aerosuite_internal.aerosuite_registration_valid(text),
 aerosuite_internal.aerosuite_normalize_registration_before_write()
 from public,anon,authenticated;
