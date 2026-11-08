-- Pre-despacho SOLO PPA/PCA: una revisión documental que NO reemplaza
-- a la autorización operativa de salida, evaluación de aeronavegabilidad ni ANAC.
CREATE TABLE IF NOT EXISTS public.aerosuite_pilot_dispatch_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.aerosuite_institutions(id) ON DELETE CASCADE,
 booking_id uuid NOT NULL REFERENCES public.aerosuite_flight_bookings(id),
 pilot_id uuid NOT NULL REFERENCES auth.users(id),
 reviewer_id uuid NOT NULL REFERENCES auth.users(id),
 outcome text NOT NULL CHECK(outcome IN ('checked','blocked')),
 reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 8 AND 250),
 reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
 aircraft_registration text NOT NULL,
 credential_updated_at timestamptz,
 authorization_updated_at timestamptz,
 aircraft_updated_at timestamptz,
 maintenance_revision bigint,
 checked_at timestamptz NOT NULL DEFAULT now(),
 valid_until timestamptz,
 CONSTRAINT pilot_dispatch_revision_link UNIQUE(id,institution_id)
);
CREATE INDEX IF NOT EXISTS aerosuite_pilot_dispatch_reviews_booking_idx
 ON public.aerosuite_pilot_dispatch_reviews(institution_id,booking_id,checked_at DESC);
ALTER TABLE public.aerosuite_pilot_dispatch_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aerosuite_pilot_dispatch_reviews FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.aerosuite_pilot_dispatch_status(p_institution_id uuid,p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_actor uuid:=auth.uid();v_role text;v_mode text;
 v_b public.aerosuite_flight_bookings%rowtype;
 v_pa public.aerosuite_pilot_authorizations%rowtype;
 v_pc public.aerosuite_pilot_credentials%rowtype;
 v_ac public.aerosuite_aircraft_registry%rowtype;
 v_r public.aerosuite_pilot_dispatch_reviews%rowtype;
 v_revision bigint;v_license text;
 v_reasons jsonb:='[]'::jsonb;v_doc_ok boolean;v_review_ok boolean:=false;
 v_today date:=(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
 SELECT m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 INTO v_role,v_mode FROM public.aerosuite_institution_members m
 JOIN public.aerosuite_institutions i ON i.id=m.institution_id
 WHERE m.institution_id=p_institution_id AND m.user_id=v_actor
 AND m.role IN ('administrador','secretaria','piloto') LIMIT 1;
 IF v_actor IS NULL OR v_role IS NULL OR v_mode='blocked' THEN
  RAISE EXCEPTION 'Acceso institucional no autorizado.' USING errcode='42501';END IF;
 SELECT * INTO v_b FROM public.aerosuite_flight_bookings b
 WHERE b.id=p_booking_id AND b.institution_id=p_institution_id;
 IF NOT FOUND OR (v_role='piloto' AND v_b.student_id IS DISTINCT FROM v_actor) THEN
  RAISE EXCEPTION 'Reserva no disponible para esta cuenta.' USING errcode='42501';END IF;
 IF v_b.with_instructor THEN
  RETURN jsonb_build_object('booking_id',v_b.id,'solo',false,'status','not_applicable','ready',false,
    'dispatched',false,'disclaimer','Este control corresponde solamente a vuelos sin instructor.');END IF;
 SELECT * INTO v_pa FROM public.aerosuite_pilot_authorizations a
 WHERE a.institution_id=p_institution_id AND a.user_id=v_b.student_id;
 SELECT * INTO v_pc FROM public.aerosuite_pilot_credentials c WHERE c.user_id=v_b.student_id;
 SELECT * INTO v_ac FROM public.aerosuite_aircraft_registry a
 WHERE a.institution_id=p_institution_id AND upper(a.registration)=upper(v_b.aircraft);
 SELECT d.license_type INTO v_license FROM public.aerosuite_role_declarations d WHERE d.user_id=v_b.student_id AND d.role='pilot';
 SELECT m.revision INTO v_revision FROM public.aerosuite_institution_maintenance m WHERE m.institution_id=p_institution_id;
 IF v_b.status<>'confirmed' THEN v_reasons:=v_reasons||'"booking_not_confirmed"'::jsonb;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.aerosuite_institution_members m WHERE m.institution_id=p_institution_id AND m.user_id=v_b.student_id AND m.role='piloto') THEN
  v_reasons:=v_reasons||'"not_institution_pilot"'::jsonb;END IF;
 IF upper(coalesce(v_license,'')) !~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)' THEN
  v_reasons:=v_reasons||'"license_not_declared"'::jsonb;END IF;
 IF v_pa.status IS DISTINCT FROM 'verified' THEN v_reasons:=v_reasons||'"authorization_not_verified"'::jsonb;END IF;
 v_doc_ok:=aerosuite_internal.aerosuite_pilot_documents_valid(v_b.student_id,v_today)
  AND aerosuite_internal.aerosuite_pilot_documents_valid(v_b.student_id,
     (v_b.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date);
 IF NOT v_doc_ok THEN v_reasons:=v_reasons||'"cma_or_declared_expiries_invalid"'::jsonb;END IF;
 IF v_ac.id IS NULL OR v_ac.availability<>'available' OR v_ac.archived_at IS NOT NULL THEN
  v_reasons:=v_reasons||'"aircraft_unavailable"'::jsonb;END IF;
 IF v_b.starts_at<now()-interval '15 minutes' OR v_b.starts_at>now()+interval '4 hours'
 OR (v_b.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date<>v_today THEN
  v_reasons:=v_reasons||'"outside_preflight_window"'::jsonb;END IF;
 SELECT * INTO v_r FROM public.aerosuite_pilot_dispatch_reviews r
 WHERE r.institution_id=p_institution_id AND r.booking_id=v_b.id
 ORDER BY r.checked_at DESC,r.id DESC LIMIT 1;
 v_review_ok:=v_r.id IS NOT NULL AND v_r.outcome='checked' AND
   v_r.valid_until>=now() AND v_r.aircraft_registration IS NOT DISTINCT FROM v_b.aircraft AND
   v_r.credential_updated_at IS NOT DISTINCT FROM v_pc.updated_at AND
   v_r.authorization_updated_at IS NOT DISTINCT FROM v_pa.updated_at AND
   v_r.aircraft_updated_at IS NOT DISTINCT FROM v_ac.updated_at AND
   v_r.maintenance_revision IS NOT DISTINCT FROM v_revision;
 RETURN jsonb_build_object('booking_id',v_b.id,'solo',true,'status',v_b.status,
  'reasons',v_reasons,'documentation_current',v_doc_ok,
  'school_authorization_current',v_pa.status='verified','review_current',v_review_ok,
  'ready',jsonb_array_length(v_reasons)=0 AND v_review_ok,
  'reviewed_at',v_r.checked_at,'review_valid_until',v_r.valid_until,
  'dispatched',false,
  'disclaimer','Revisión documental interna de predespacho. NO autoriza ni registra una salida real; requiere control operativo previo al vuelo.');
END;$fn$;
REVOKE ALL ON FUNCTION public.aerosuite_pilot_dispatch_status(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aerosuite_pilot_dispatch_status(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.aerosuite_pilot_dispatch_review(
 p_institution_id uuid,p_booking_id uuid,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_actor uuid:=auth.uid();v_mode text;
 v_b public.aerosuite_flight_bookings%rowtype;
 v_pc public.aerosuite_pilot_credentials%rowtype;
 v_pa public.aerosuite_pilot_authorizations%rowtype;
 v_ac public.aerosuite_aircraft_registry%rowtype;
 v_maintenance jsonb;v_item jsonb;v_alerts jsonb;
 v_facts jsonb;v_reasons jsonb:='[]'::jsonb;v_ok boolean;v_rev bigint;
 v_reference text:=btrim(coalesce(p_reference,''));
BEGIN
 SELECT private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 INTO v_mode FROM public.aerosuite_institution_members m
 JOIN public.aerosuite_institutions i ON i.id=m.institution_id
 WHERE m.user_id=v_actor AND m.institution_id=p_institution_id AND m.role IN ('administrador','secretaria') LIMIT 1;
 IF v_actor IS NULL OR v_mode NOT IN ('trial','active','grace') THEN
  RAISE EXCEPTION 'Sólo Dirección o Secretaría habilitadas pueden revisar el predespacho.' USING errcode='42501';END IF;
 IF length(v_reference) NOT BETWEEN 8 AND 250 THEN
  RAISE EXCEPTION 'Indicá referencia documental comprobable (8 a 250 caracteres).' USING errcode='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 SELECT * INTO v_b FROM public.aerosuite_flight_bookings b
 WHERE b.institution_id=p_institution_id AND b.id=p_booking_id FOR UPDATE;
 IF NOT FOUND OR v_b.with_instructor THEN
  RAISE EXCEPTION 'No existe reserva de vuelo solo para esta institución.' USING errcode='22023';END IF;
 SELECT * INTO v_pc FROM public.aerosuite_pilot_credentials WHERE user_id=v_b.student_id;
 SELECT * INTO v_pa FROM public.aerosuite_pilot_authorizations WHERE institution_id=p_institution_id AND user_id=v_b.student_id;
 SELECT * INTO v_ac FROM public.aerosuite_aircraft_registry WHERE institution_id=p_institution_id AND upper(registration)=upper(v_b.aircraft);
 SELECT revision INTO v_rev FROM public.aerosuite_institution_maintenance WHERE institution_id=p_institution_id;
 v_facts:=public.aerosuite_pilot_dispatch_status(p_institution_id,p_booking_id);
 v_reasons:=coalesce(v_facts->'reasons','[]'::jsonb);
 -- Consulta integrada de alertas con permiso exclusivo institucional.
 v_maintenance:=public.aerosuite_maintenance_alerts(p_institution_id);
 SELECT a.value INTO v_item FROM jsonb_array_elements(coalesce(v_maintenance->'aircraft','[]'::jsonb)) a
  WHERE upper(a.value->>'registration')=upper(v_b.aircraft) LIMIT 1;
 IF v_item IS NULL THEN
  v_reasons:=v_reasons||'"maintenance_not_configured"'::jsonb;
 ELSE
  IF coalesce((v_item->>'initial_hours_pending')::boolean,false) THEN
   v_reasons:=v_reasons||'"technical_initial_hours_pending"'::jsonb;END IF;
  SELECT coalesce(jsonb_agg(a.value),'[]'::jsonb) INTO v_alerts
   FROM jsonb_array_elements(coalesce(v_item->'alerts','[]'::jsonb)) a
   WHERE a.value->>'level'='due' OR a.value->>'code'='no_controls';
  IF jsonb_array_length(v_alerts)>0 THEN
   v_reasons:=v_reasons||'"maintenance_due_or_unconfigured"'::jsonb;END IF;
 END IF;
 v_ok:=jsonb_array_length(v_reasons)=0;
 INSERT INTO public.aerosuite_pilot_dispatch_reviews(institution_id,booking_id,pilot_id,reviewer_id,outcome,
   reference,reason_codes,aircraft_registration,credential_updated_at,authorization_updated_at,aircraft_updated_at,maintenance_revision,valid_until)
 VALUES(p_institution_id,v_b.id,v_b.student_id,v_actor,CASE WHEN v_ok THEN 'checked' ELSE 'blocked' END,
  v_reference,v_reasons,v_b.aircraft,v_pc.updated_at,v_pa.updated_at,v_ac.updated_at,v_rev,
  CASE WHEN v_ok THEN least(now()+interval '15 minutes',v_b.starts_at+interval '15 minutes') ELSE NULL END);
 RETURN jsonb_build_object('ok',v_ok,'checked',v_ok,'reasons',v_reasons,
  'valid_for_minutes',CASE WHEN v_ok THEN 15 ELSE 0 END,'dispatched',false,
  'disclaimer','Control documental interno únicamente. No constituye despacho técnico ni autorización legal de vuelo.');
END;$fn$;
REVOKE ALL ON FUNCTION public.aerosuite_pilot_dispatch_review(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aerosuite_pilot_dispatch_review(uuid,uuid,text) TO authenticated;
