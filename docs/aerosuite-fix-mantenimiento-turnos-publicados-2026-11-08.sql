-- Corrección focalizada: un turno ya publicado no puede cambiar de aeronave
-- o horario escapando del control de mantenimiento.
-- Conserva reglas de roles existentes y no modifica datos históricos.
-- Aplicar como migración atómica; no ejecutar por lote otros SQL no conciliados.
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_guard_published_flight_maintenance()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_all jsonb;
 v_aircraft jsonb;
 v_error text;
BEGIN
 IF new.activity<>'flight' OR new.published_at IS NULL THEN
  RETURN new;
 END IF;
 IF TG_OP='UPDATE'
  AND old.published_at IS NOT NULL
  AND new.published_at IS NOT DISTINCT FROM old.published_at
  AND new.institution_id IS NOT DISTINCT FROM old.institution_id
  AND new.activity IS NOT DISTINCT FROM old.activity
  AND new.resource_label IS NOT DISTINCT FROM old.resource_label
  AND new.starts_at IS NOT DISTINCT FROM old.starts_at
 THEN
  RETURN new;
 END IF;
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'No se puede publicar o modificar un vuelo publicado sin identidad institucional válida.'
    USING ERRCODE='42501';
 END IF;
 v_all:=public.aerosuite_maintenance_alerts(new.institution_id);
 SELECT aircraft.value INTO v_aircraft
 FROM jsonb_array_elements(coalesce(v_all->'aircraft','[]'::jsonb)) aircraft
 WHERE upper(btrim(aircraft.value->>'registration'))=upper(btrim(new.resource_label))
 LIMIT 1;
 IF v_aircraft IS NULL THEN
  RAISE EXCEPTION 'No se pudo verificar el mantenimiento de la matrícula. Revisá Flota antes de publicar.'
    USING ERRCODE='22023';
 END IF;
 SELECT left(coalesce(alert.value->>'message','Vencimiento de mantenimiento registrado'),350)
 INTO v_error
 FROM jsonb_array_elements(coalesce(v_aircraft->'alerts','[]'::jsonb)) alert
 WHERE alert.value->>'level'='due'
 LIMIT 1;
 IF v_error IS NOT NULL THEN
  RAISE EXCEPTION 'Publicación bloqueada por vencimiento de mantenimiento en %: %',
    new.resource_label,v_error USING ERRCODE='22023';
 END IF;
 RETURN new;
END
$function$;

DROP TRIGGER IF EXISTS aerosuite_guard_flight_maintenance_publish
 ON public.aerosuite_availability_slots;

CREATE TRIGGER aerosuite_guard_flight_maintenance_publish
BEFORE INSERT OR UPDATE OF published_at,resource_label,starts_at,activity,institution_id
ON public.aerosuite_availability_slots
FOR EACH ROW EXECUTE FUNCTION aerosuite_internal.aerosuite_guard_published_flight_maintenance();
