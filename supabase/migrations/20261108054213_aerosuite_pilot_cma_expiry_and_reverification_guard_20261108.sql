-- La habilitación para un vuelo sin instructor exige CMA vigente para el día del turno.
-- Una licencia sin fecha de vencimiento registrada no se presume vencida.
-- El tipo de avión, atribuciones y habilitaciones particulares requieren control institucional independiente.
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_pilot_documents_valid(p_user_id uuid,p_flight_date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT p_user_id IS NOT NULL AND p_flight_date IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.aerosuite_pilot_credentials pc
  WHERE pc.user_id=p_user_id
    AND nullif(btrim(coalesce(pc.medical_certificate_type,'')),'') IS NOT NULL
    AND pc.medical_expires_on IS NOT NULL AND pc.medical_expires_on>=p_flight_date
    AND (pc.license_expires_on IS NULL OR pc.license_expires_on>=p_flight_date)
    AND (pc.ratings_expires_on IS NULL OR pc.ratings_expires_on>=p_flight_date)
 );
$fn$;
REVOKE ALL ON FUNCTION aerosuite_internal.aerosuite_pilot_documents_valid(uuid,date) FROM PUBLIC,anon,authenticated;

-- Una edición posterior de documentos revoca la verificación institucional previa.
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_revoke_pilot_on_document_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF TG_OP='DELETE' OR (
    NEW.medical_certificate_type IS DISTINCT FROM OLD.medical_certificate_type
    OR NEW.medical_expires_on IS DISTINCT FROM OLD.medical_expires_on
    OR NEW.license_expires_on IS DISTINCT FROM OLD.license_expires_on
    OR NEW.ratings_declared IS DISTINCT FROM OLD.ratings_declared
    OR NEW.ratings_expires_on IS DISTINCT FROM OLD.ratings_expires_on
 ) THEN
   UPDATE public.aerosuite_pilot_authorizations
   SET status='revoked',updated_at=now()
   WHERE user_id=OLD.user_id AND status='verified';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION aerosuite_internal.aerosuite_revoke_pilot_on_document_change() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS aerosuite_pilot_credentials_change_reverify ON public.aerosuite_pilot_credentials;
CREATE TRIGGER aerosuite_pilot_credentials_change_reverify
 AFTER UPDATE OF medical_certificate_type,medical_expires_on,license_expires_on,ratings_declared,ratings_expires_on
 OR DELETE ON public.aerosuite_pilot_credentials
 FOR EACH ROW EXECUTE FUNCTION aerosuite_internal.aerosuite_revoke_pilot_on_document_change();

CREATE OR REPLACE FUNCTION public.aerosuite_pilot_verify(p_institution_id uuid, p_user_id uuid, p_approved boolean, p_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_allowed boolean;v_ref text:=btrim(coalesce(p_reference,''));v_type text;
begin
 select exists(select 1 from public.aerosuite_institution_members m
 join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria')
 and private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) in ('active','trial','grace')) into v_allowed;
 if not v_allowed then raise exception 'Solo Secretaría o Dirección habilitadas pueden verificar al piloto.' using errcode='42501';end if;
 if p_approved is null or length(v_ref) not between 8 and 250
 then raise exception 'Indicá una referencia documental válida de 8 a 250 caracteres.' using errcode='22023';end if;
 if not exists(select 1 from public.aerosuite_institution_members m
 where m.institution_id=p_institution_id and m.user_id=p_user_id and m.role='piloto')
 then raise exception 'La persona no está vinculada a la escuela.' using errcode='22023';end if;
 select d.license_type into v_type from public.aerosuite_role_declarations d
 where d.user_id=p_user_id and d.role='pilot';
 if p_approved and (not found or upper(coalesce(v_type,'')) !~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)') then
  raise exception 'La persona primero debe declarar en su ficha una licencia de Piloto PPA o Comercial.' using errcode='22023';end if;
 if p_approved AND NOT aerosuite_internal.aerosuite_pilot_documents_valid(
    p_user_id,(now() at time zone 'America/Argentina/Buenos_Aires')::date) THEN
  raise exception 'No se puede verificar al piloto sin CMA vigente registrada y sin vencimientos declarados de licencia/habilitaciones. Comprobá los documentos originales.' using errcode='22023';
 end if;
 insert into public.aerosuite_pilot_authorizations(institution_id,user_id,status,verification_reference,verified_by,verified_at,updated_at)
 values(p_institution_id,p_user_id,case when p_approved then 'verified' else 'revoked' end,v_ref,v_actor,now(),now())
 on conflict(institution_id,user_id) do update set
 status=excluded.status,verification_reference=excluded.verification_reference,verified_by=excluded.verified_by,
 verified_at=excluded.verified_at,updated_at=now();
 return jsonb_build_object('ok',true,'pilot_verified',p_approved,'user_id',p_user_id);
end $function$;


CREATE OR REPLACE FUNCTION public.aerosuite_confirm_without_instructor(p_institution_id uuid, p_booking_id uuid, p_authorization_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_mode text;
 v_booking public.aerosuite_flight_bookings%rowtype;
 v_slot public.aerosuite_availability_slots%rowtype;
 v_ref text:=btrim(coalesce(p_authorization_reference,''));
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección o Secretaría pueden autorizar vuelos sin instructor.' using errcode='42501';end if;
 if length(v_ref) not between 8 and 250 then
  raise exception 'Indicá una referencia verificable de autorización (8 a 250 caracteres).' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_booking from public.aerosuite_flight_bookings
 where id=p_booking_id and institution_id=p_institution_id for update;
 if not found or v_booking.with_instructor or v_booking.status<>'pending' or v_booking.starts_at<=now()
 then raise exception 'Solo se pueden autorizar solicitudes futuras pendientes sin instructor.' using errcode='22023';end if;
 if not exists(select 1 from public.aerosuite_pilot_authorizations pa
   join public.aerosuite_role_declarations d on d.user_id=pa.user_id and d.role='pilot'
   join public.aerosuite_institution_members mm on mm.institution_id=pa.institution_id and mm.user_id=pa.user_id and mm.role='piloto'
   where pa.institution_id=p_institution_id and pa.user_id=v_booking.student_id and pa.status='verified'
   and upper(coalesce(d.license_type,'')) ~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)')
 then raise exception 'No se puede confirmar un vuelo sin instructor: Piloto PPA no verificado por la institución.' using errcode='42501';end if;
 IF NOT aerosuite_internal.aerosuite_pilot_documents_valid(
   v_booking.student_id,(v_booking.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) THEN
  RAISE EXCEPTION 'No se puede autorizar el vuelo sin instructor: CMA no registrada, vencida antes del vuelo o vencimiento de licencia/habilitación declarado.' USING errcode='42501';
 END IF;
 if exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=v_booking.id)
 or exists(select 1 from public.aerosuite_flight_checkouts c where c.booking_id=v_booking.id)
 then raise exception 'El vuelo ya tiene informe o movimiento de caja.' using errcode='22023';end if;
 select s.* into v_slot from public.aerosuite_activity_reservations r
 join public.aerosuite_availability_slots s on s.id=r.slot_id
 where r.institution_id=p_institution_id and r.booking_id=v_booking.id and r.status='pending'
 and s.activity='flight' and s.published_at is not null and s.retired_at is null
 for update of s;
 if not found then raise exception 'No hay horario de vuelo publicado para esta reserva.' using errcode='22023';end if;
 if not exists(select 1 from public.aerosuite_aircraft_registry a
 where a.institution_id=p_institution_id and a.registration=upper(v_slot.resource_label)
 and a.availability='available' and a.archived_at is null)
 then raise exception 'La aeronave seleccionada no está disponible.' using errcode='22023';end if;
 if exists(select 1 from public.aerosuite_flight_bookings b
 where b.institution_id=p_institution_id and b.id<>v_booking.id
 and b.status in('pending','confirmed','completed')
 and upper(coalesce(b.aircraft,''))=upper(v_slot.resource_label)
 and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
     tstzrange(v_booking.starts_at,v_booking.starts_at+interval '90 minutes','[)'))
 then raise exception 'La aeronave tiene otra reserva superpuesta.' using errcode='23505';end if;
 update public.aerosuite_flight_bookings set status='confirmed',
  instructor_id=null,aircraft=upper(v_slot.resource_label),
  updated_by=v_actor,updated_at=now() where id=v_booking.id;
 insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,before_data,after_data)
 select p_institution_id,v_booking.id,v_actor,'solo_flight_authorized',to_jsonb(v_booking),
 to_jsonb(b)||jsonb_build_object('authorization_reference',v_ref,'verified_by_school',true)
 from public.aerosuite_flight_bookings b where b.id=v_booking.id;
 return jsonb_build_object('ok',true,'booking_id',v_booking.id,'status','confirmed',
  'with_instructor',false);
end $function$;


CREATE OR REPLACE FUNCTION public.aerosuite_reserve_with_instructor(p_institution_id uuid, p_slot_id uuid, p_student_id uuid, p_with_instructor boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_slot public.aerosuite_availability_slots%rowtype;
 v_result jsonb;v_booking_id uuid;v_pilot uuid;v_role text;
begin
 if v_actor is null or p_with_instructor is null then
  raise exception 'Sesión y modalidad de vuelo requeridas.' using errcode='42501';end if;
 select * into v_slot from public.aerosuite_availability_slots s
 where s.id=p_slot_id and s.institution_id=p_institution_id and s.retired_at is null;
 if not found then raise exception 'Horario no encontrado o retirado.' using errcode='22023';end if;
 if v_slot.activity<>'flight' and p_with_instructor=false then
  raise exception 'La opción sin instructor solo corresponde a vuelos prácticos.' using errcode='22023';end if;
 if v_slot.activity='flight' and not p_with_instructor then
  -- Un piloto no puede usar el ID de otro piloto verificado para evitar los controles.
  SELECT m.role INTO v_role FROM public.aerosuite_institution_members m
    WHERE m.institution_id=p_institution_id AND m.user_id=v_actor
      AND m.role IN ('administrador','secretaria','alumno','piloto') LIMIT 1;
  v_pilot:=CASE WHEN v_role IN ('administrador','secretaria') THEN p_student_id ELSE v_actor END;
  IF v_pilot IS NULL THEN RAISE EXCEPTION 'Elegí un piloto de la institución.' USING errcode='42501';END IF;
  if not exists(select 1 from public.aerosuite_pilot_authorizations pa
   join public.aerosuite_role_declarations d on d.user_id=pa.user_id and d.role='pilot'
   join public.aerosuite_institution_members mm on mm.institution_id=pa.institution_id and mm.user_id=pa.user_id and mm.role='piloto'
   where pa.institution_id=p_institution_id
   and pa.user_id=v_pilot and pa.status='verified'
   and upper(coalesce(d.license_type,'')) ~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)')
  then raise exception 'Solo un Piloto PPA/PCA verificado por esta escuela puede reservar sin instructor. Completá tu ficha y solicitá la validación de Secretaría.' using errcode='42501';end if;
  IF NOT aerosuite_internal.aerosuite_pilot_documents_valid(
    v_pilot,(v_slot.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) THEN
   RAISE EXCEPTION 'No se puede reservar sin instructor: CMA ausente, vencida antes del vuelo o vencimiento de licencia/habilitación declarado.' USING errcode='42501';
  END IF;
 end if;
 v_result:=public.aerosuite_availability_reserve(p_institution_id,p_slot_id,p_student_id);
 v_booking_id:=nullif(v_result->>'booking_id','')::uuid;
 if v_slot.activity='flight' then
  if v_booking_id is null then raise exception 'No se creó el vuelo.' using errcode='22023';end if;
  update public.aerosuite_flight_bookings set with_instructor=p_with_instructor,
   updated_at=now(),updated_by=v_actor where id=v_booking_id and institution_id=p_institution_id;
  insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,after_data)
  values(p_institution_id,v_booking_id,v_actor,'instructor_mode_selected',
   jsonb_build_object('with_instructor',p_with_instructor,'requires_school_authorization',not p_with_instructor));
 end if;
 return v_result||jsonb_build_object('with_instructor',p_with_instructor,
  'requires_school_authorization',v_slot.activity='flight' and not p_with_instructor);
end $function$;


CREATE OR REPLACE FUNCTION public.aerosuite_pilot_profile(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_decl public.aerosuite_role_declarations%rowtype;
 v_verified boolean:=false;v_student boolean:=false;v_member boolean:=false;
begin
 if v_actor is null then raise exception 'Iniciá sesión.' using errcode='42501';end if;
 select exists(select 1 from public.aerosuite_institution_members m
   where m.institution_id=p_institution_id and m.user_id=v_actor and m.role='piloto')
 into v_member;
 if not v_member then raise exception 'No pertenecés a esta institución con acceso a la turnera.' using errcode='42501';end if;
 select * into v_decl from public.aerosuite_role_declarations d
 where d.user_id=v_actor and d.role='pilot';
 select exists(select 1 from public.aerosuite_role_declarations d
 where d.user_id=v_actor and d.role='student') into v_student;
 select exists(select 1 from public.aerosuite_pilot_authorizations p
 where p.institution_id=p_institution_id and p.user_id=v_actor and p.status='verified'
 and exists(select 1 from public.aerosuite_role_declarations d where d.user_id=v_actor
  and d.role='pilot' and upper(coalesce(d.license_type,'')) ~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)'))
  AND aerosuite_internal.aerosuite_pilot_documents_valid(v_actor,(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
  INTO v_verified;
 return jsonb_build_object(
  'pilot_declared',v_decl.user_id is not null,
  'pilot_ppa_declared',v_decl.user_id is not null and upper(coalesce(v_decl.license_type,'')) ~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)',
  'student_declared',v_student,
  'pilot_verified',v_verified,
  'medical_and_declared_expiries_current',aerosuite_internal.aerosuite_pilot_documents_valid(v_actor,(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date),
  'portal','pilot_ppa', 'license_type',coalesce(v_decl.license_type,''),
  'pilot_portal',true
 );
end $function$;

-- Seguridad: las verificaciones anteriores son por fecha de la operación y se ejecutan en el servidor.
-- Los vuelos con instructor no se bloquean de manera automática por esta regla de vuelos sin instructor.

-- La lista de Secretaría informa vigencia efectiva, no solo verificación histórica.
CREATE OR REPLACE FUNCTION public.aerosuite_pilot_candidates(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=auth.uid();v_allowed boolean;v_result jsonb;
BEGIN
 SELECT EXISTS(SELECT 1 FROM public.aerosuite_institution_members m
 WHERE m.institution_id=p_institution_id AND m.user_id=v_actor
 AND m.role IN('administrador','secretaria')) INTO v_allowed;
 IF NOT v_allowed THEN RAISE EXCEPTION 'Solo Dirección o Secretaría puede ver esta lista.'
  USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'user_id',m.user_id,'email',u.email,'name',concat_ws(' ',mp.given_names,mp.family_names),
  'license_type',d.license_type,'license_number',d.license_number,
  'verified',coalesce(pa.status='verified',false) AND
     aerosuite_internal.aerosuite_pilot_documents_valid(m.user_id,(now() at time zone 'America/Argentina/Buenos_Aires')::date),
  'school_verified',coalesce(pa.status='verified',false),
  'documentation_current',aerosuite_internal.aerosuite_pilot_documents_valid(m.user_id,(now() at time zone 'America/Argentina/Buenos_Aires')::date),
  'verified_at',pa.verified_at,
  'medical_certificate_type',pc.medical_certificate_type,
  'medical_expires_on',pc.medical_expires_on,
  'license_expires_on',pc.license_expires_on,
  'ratings_declared',pc.ratings_declared,
  'ratings_expires_on',pc.ratings_expires_on
 ) ORDER BY u.email),'[]'::jsonb) INTO v_result
 FROM public.aerosuite_institution_members m
 JOIN auth.users u ON u.id=m.user_id
 LEFT JOIN public.aerosuite_role_declarations d ON d.user_id=m.user_id AND d.role='pilot'
 LEFT JOIN public.aerosuite_member_profiles mp ON mp.user_id=m.user_id
 LEFT JOIN public.aerosuite_pilot_authorizations pa ON pa.institution_id=m.institution_id AND pa.user_id=m.user_id
 LEFT JOIN public.aerosuite_pilot_credentials pc ON pc.user_id=m.user_id
 WHERE m.institution_id=p_institution_id AND m.role='piloto';
 RETURN v_result;
END $function$;
