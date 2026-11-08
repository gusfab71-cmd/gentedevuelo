-- Extensión de consulta: identifica cuentas técnicas de instituciones de prueba.
-- Nueva función v2, conserva la RPC original para permitir reversión.
-- No cambia permisos, cuentas, membresías ni historiales.
-- 'is_test_account' verdadero solo si todas las membresías son de prueba,
-- el perfil no participa en la comunidad y no es una cuenta administradora.
CREATE OR REPLACE FUNCTION public.gdv_superadmin_global_accounts_v2(
 p_limit integer DEFAULT 200,p_offset integer DEFAULT 0
)
RETURNS TABLE(
 user_id uuid,email text,username text,created_at timestamptz,
 verified_at timestamptz,last_sign_in_at timestamptz,
 community_member boolean,profile_completed boolean,
 site_admin boolean,aerosuite_superadmin boolean,
 institutional_roles text[],institutions text[],
 pending_invitations integer,review_status text,is_test_account boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.aerosuite_superadmins s
   WHERE s.user_id=(SELECT auth.uid())
 ) THEN
  RAISE EXCEPTION 'Solo Superadministración puede consultar el padrón de cuentas.'
   USING ERRCODE='42501';
 END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN
  RAISE EXCEPTION 'Rango de consulta inválido.' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 SELECT u.id,u.email::text,p.username::text,u.created_at,
  u.email_confirmed_at,u.last_sign_in_at,
  coalesce(p.gdv_community_member,false),
  coalesce(p.onboarding_completed,false),
  EXISTS(SELECT 1 FROM public.site_admins sa WHERE sa.user_id=u.id),
  EXISTS(SELECT 1 FROM public.aerosuite_superadmins aa WHERE aa.user_id=u.id),
  coalesce(m.roles,ARRAY[]::text[]),
  coalesce(m.institution_names,ARRAY[]::text[]),
  coalesce(i.pending_count,0)::integer,
  CASE
   WHEN EXISTS(SELECT 1 FROM public.site_admins sa WHERE sa.user_id=u.id)
     OR EXISTS(SELECT 1 FROM public.aerosuite_superadmins aa WHERE aa.user_id=u.id)
    THEN 'Administración protegida'
   WHEN coalesce(m.member_count,0)>0 AND coalesce(p.gdv_community_member,false)
    THEN 'Comunidad + institución'
   WHEN coalesce(m.member_count,0)>0
    THEN 'Acceso institucional'
   WHEN coalesce(p.gdv_community_member,false)
    THEN 'Comunidad Gente de Vuelo'
   WHEN coalesce(i.pending_count,0)>0
    THEN 'Invitación pendiente'
   WHEN u.email_confirmed_at IS NULL
    THEN 'Correo sin verificar'
   ELSE 'Sin vínculo detectado · revisar'
  END::text,
  (coalesce(m.member_count,0)>0 AND coalesce(m.non_test_memberships,0)=0
   AND coalesce(m.test_memberships,0)>0 AND NOT coalesce(p.gdv_community_member,false)
   AND NOT EXISTS(SELECT 1 FROM public.site_admins sa WHERE sa.user_id=u.id)
   AND NOT EXISTS(SELECT 1 FROM public.aerosuite_superadmins aa WHERE aa.user_id=u.id))
 FROM auth.users u
 LEFT JOIN public.profiles p ON p.id=u.id
 LEFT JOIN LATERAL(
  SELECT count(*) member_count,
   count(*) FILTER (WHERE org.is_test) test_memberships,
   count(*) FILTER (WHERE NOT org.is_test) non_test_memberships,
   array_agg(DISTINCT m.role ORDER BY m.role)::text[] roles,
   array_agg(DISTINCT org.name::text ORDER BY org.name::text)::text[] institution_names
   FROM public.aerosuite_institution_members m
   JOIN public.aerosuite_institutions org ON org.id=m.institution_id
   WHERE m.user_id=u.id
 ) m ON true
 LEFT JOIN LATERAL(
  SELECT count(*) pending_count FROM public.aerosuite_institution_invitations inv
  WHERE lower(btrim(inv.email))=lower(btrim(u.email))
   AND inv.accepted_at IS NULL AND inv.revoked_at IS NULL
   AND inv.expires_at>now()
 ) i ON true
 WHERE u.deleted_at IS NULL
 ORDER BY u.created_at DESC,u.id DESC
 LIMIT p_limit OFFSET p_offset;
END;
$fn$;
REVOKE ALL ON FUNCTION public.gdv_superadmin_global_accounts_v2(integer,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gdv_superadmin_global_accounts_v2(integer,integer)
 TO authenticated;
