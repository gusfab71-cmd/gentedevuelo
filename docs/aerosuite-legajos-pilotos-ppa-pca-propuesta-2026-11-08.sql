-- MIGRACIÓN APLICADA EN SUPABASE PRINCIPAL EL 2026-11-08.
-- Nombre: aerosuite_pilot_credentials_private_expiry_20261108.
-- Aplicación confirmada en el historial de migraciones (versión 20261108042545).
-- Legajo documental declarado por el Piloto PPA/PCA: la información no
-- verifica licencia, no modifica aerosuite_pilot_authorizations ni autoriza vuelos.
-- No se almacenan escaneos médicos, diagnósticos ni archivos de identidad.
-- Verificado: RLS habilitado con políticas para el titular, acceso anónimo
-- denegado, RPC institucional restringida por pertenencia al rol gestor,
-- y sin modificación de cuentas o suspensiones existentes.
CREATE TABLE IF NOT EXISTS public.aerosuite_pilot_credentials (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 medical_certificate_type text CHECK (
  medical_certificate_type IS NULL OR
  char_length(btrim(medical_certificate_type)) BETWEEN 2 AND 80
 ),
 medical_expires_on date,
 license_expires_on date,
 ratings_declared text CHECK (
  ratings_declared IS NULL OR char_length(btrim(ratings_declared)) BETWEEN 2 AND 400
 ),
 ratings_expires_on date,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.aerosuite_pilot_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aerosuite_pilot_credentials FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.aerosuite_pilot_credentials TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.aerosuite_pilot_credentials TO service_role;
DROP POLICY IF EXISTS aerosuite_pilot_credentials_own_select ON public.aerosuite_pilot_credentials;
CREATE POLICY aerosuite_pilot_credentials_own_select
 ON public.aerosuite_pilot_credentials FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS aerosuite_pilot_credentials_own_insert ON public.aerosuite_pilot_credentials;
CREATE POLICY aerosuite_pilot_credentials_own_insert
 ON public.aerosuite_pilot_credentials FOR INSERT TO authenticated
 WITH CHECK (
  user_id=(SELECT auth.uid()) AND EXISTS(
   SELECT 1 FROM public.aerosuite_role_declarations d
   WHERE d.user_id=(SELECT auth.uid()) AND d.role='pilot'
  )
 );
DROP POLICY IF EXISTS aerosuite_pilot_credentials_own_update ON public.aerosuite_pilot_credentials;
CREATE POLICY aerosuite_pilot_credentials_own_update
 ON public.aerosuite_pilot_credentials FOR UPDATE TO authenticated
 USING (user_id=(SELECT auth.uid()))
 WITH CHECK (
  user_id=(SELECT auth.uid()) AND EXISTS(
   SELECT 1 FROM public.aerosuite_role_declarations d
   WHERE d.user_id=(SELECT auth.uid()) AND d.role='pilot'
  )
 );

-- Dirección y Secretaría consultan las fechas declaradas únicamente de
-- pilotos vinculados a SU institución, mediante la RPC ya autorizada.
-- La RPC es de consulta; nunca cambia el estado de habilitación.
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
  'verified',coalesce(pa.status='verified',false),
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
REVOKE ALL ON FUNCTION public.aerosuite_pilot_candidates(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aerosuite_pilot_candidates(uuid) TO authenticated;
