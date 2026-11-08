-- Una escuela puede operar varias aeronaves en paralelo.
-- El índice anterior imponía un único vuelo por institución y hora, sin distinguir aeronaves.
-- Los chequeos de alumno, aeronave e instructor se serializan por institución
-- y aplican a las operaciones de reserva, confirmación y reprogramación.
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_booking_overlap_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF NEW.status NOT IN ('pending','confirmed') THEN RETURN NEW;END IF;
 IF NEW.institution_id IS NULL OR NEW.student_id IS NULL OR NEW.starts_at IS NULL THEN
  RAISE EXCEPTION 'Datos de vuelo incompletos.' USING errcode='22023';END IF;
 -- Mismo lock por institución utilizado por disponibilidad y reservas del servidor.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.institution_id::text,0));
 IF EXISTS(
   SELECT 1 FROM public.aerosuite_flight_bookings b
   WHERE b.institution_id=NEW.institution_id AND b.id<>NEW.id AND b.student_id=NEW.student_id
     AND b.status IN ('pending','confirmed')
     AND tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
         tstzrange(NEW.starts_at,NEW.starts_at+interval '90 minutes','[)')
 ) THEN
  RAISE EXCEPTION 'Este alumno/piloto ya tiene un vuelo superpuesto.' USING errcode='23505';END IF;
 IF btrim(coalesce(NEW.aircraft,''))<>'' AND EXISTS(
   SELECT 1 FROM public.aerosuite_flight_bookings b
   WHERE b.institution_id=NEW.institution_id AND b.id<>NEW.id
     AND b.status IN ('pending','confirmed') AND upper(btrim(b.aircraft))=upper(btrim(NEW.aircraft))
     AND tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
         tstzrange(NEW.starts_at,NEW.starts_at+interval '90 minutes','[)')
 ) THEN
  RAISE EXCEPTION 'La aeronave ya está ocupada por otro vuelo en ese horario.' USING errcode='23505';END IF;
 IF NEW.status='confirmed' AND NEW.instructor_id IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.aerosuite_flight_bookings b
   WHERE b.institution_id=NEW.institution_id AND b.id<>NEW.id
     AND b.status='confirmed' AND b.instructor_id=NEW.instructor_id
     AND tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
         tstzrange(NEW.starts_at,NEW.starts_at+interval '90 minutes','[)')
 ) THEN
  RAISE EXCEPTION 'El instructor tiene otro vuelo confirmado en ese horario.' USING errcode='23505';END IF;
 RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION aerosuite_internal.aerosuite_booking_overlap_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS aerosuite_flight_booking_overlap_guard ON public.aerosuite_flight_bookings;
CREATE TRIGGER aerosuite_flight_booking_overlap_guard
 BEFORE INSERT OR UPDATE OF institution_id,student_id,starts_at,aircraft,status,instructor_id
 ON public.aerosuite_flight_bookings
 FOR EACH ROW EXECUTE FUNCTION aerosuite_internal.aerosuite_booking_overlap_guard();
-- Crear primero protección por matrícula; después retirar restricción global incorrecta.
CREATE UNIQUE INDEX IF NOT EXISTS aerosuite_flight_booking_aircraft_start_unique
 ON public.aerosuite_flight_bookings(institution_id,upper(btrim(aircraft)),starts_at)
 WHERE status<>'cancelled' AND btrim(aircraft)<>'';
DROP INDEX IF EXISTS public.aerosuite_flight_booking_slot_unique;
