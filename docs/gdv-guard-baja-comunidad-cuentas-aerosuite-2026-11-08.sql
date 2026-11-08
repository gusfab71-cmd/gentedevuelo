-- PROPUESTA REVISABLE, NO APLICADA A PRODUCCION.
-- GDV: impedir que el borrado antiguo de miembros de la comunidad elimine
-- cuentas que tambien pertenecen (o estan vinculadas documentalmente) a AeroSuite.
-- No borra ningun dato ni modifica cuentas al instalar esta proteccion.
-- Requisito: verificar la migracion efectiva y ejecutar pruebas con JWT real
-- en un entorno segregado antes de aplicar en el proyecto principal.
--
-- La funcion core no es una RPC directa de usuarios finales. Mantener el revoke.
REVOKE ALL ON FUNCTION public.gdv_admin_delete_member_integral_core(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gdv_admin_delete_member(
  p_user uuid, p_confirmation text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_target_email text;
BEGIN
  -- Autorizar antes de inspeccionar ninguna pertenencia o identidad.
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.site_admins s WHERE s.user_id=auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acceso restringido' USING ERRCODE='42501';
  END IF;
  IF p_confirmation IS DISTINCT FROM 'ELIMINAR CUENTA Y CONTENIDO' THEN
    RAISE EXCEPTION 'Falta confirmar la eliminación completa' USING ERRCODE='22023';
  END IF;
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'Integrante inválido' USING ERRCODE='22023';
  END IF;

  -- El bloqueo de la identidad también serializa nuevas membresías por FK.
  SELECT u.email INTO v_target_email
    FROM auth.users u WHERE u.id=p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta ya no existe' USING ERRCODE='P0002';
  END IF;

  -- Este RPC pertenece solo a Gente de Vuelo. No puede borrar, ni en cascada,
  -- un alumno, instructor, piloto, invitado o usuario con legajo AeroSuite.
  IF EXISTS (SELECT 1 FROM public.aerosuite_institution_members m WHERE m.user_id=p_user)
   OR EXISTS (SELECT 1 FROM public.aerosuite_pilot_credentials c WHERE c.user_id=p_user)
   OR EXISTS (SELECT 1 FROM public.aerosuite_pilot_authorizations a WHERE a.user_id=p_user)
   OR EXISTS (SELECT 1 FROM public.aerosuite_role_declarations d WHERE d.user_id=p_user)
   OR EXISTS (SELECT 1 FROM public.aerosuite_member_profiles p WHERE p.user_id=p_user)
   OR EXISTS (
     SELECT 1 FROM public.aerosuite_institution_invitations i
     WHERE lower(btrim(i.email))=lower(btrim(v_target_email))
   )
  THEN
    RAISE EXCEPTION
      'Esta cuenta está vinculada a AeroSuite. No se puede eliminar desde el panel de comunidad.'
      USING ERRCODE='42501';
  END IF;

  -- La rutina heredada conserva sus protecciones contra borrar
  -- la propia cuenta administradora, otros administradores y cuentas especiales.
  RETURN public.gdv_admin_delete_member_integral_core(p_user);
END
$function$;
