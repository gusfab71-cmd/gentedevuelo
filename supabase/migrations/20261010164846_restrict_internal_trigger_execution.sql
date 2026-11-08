-- Endurecimiento de funciones internas. No cambia Auth, reglas de contraseña,
-- permisos de usuarios sobre tablas ni moderación.
-- PostgreSQL ejecuta los triggers según sus definiciones: el permiso EXECUTE
-- de un cliente de la Data API no es necesario para dispararlos.

REVOKE ALL ON FUNCTION public.gdv_queue_removed_r2_photos()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION gdv_private.stamp_presence()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION gdv_private.touch_member_presence()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION gdv_private.validate_google_onboarding()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.gdv_queue_removed_r2_photos() IS
  'Función exclusiva de triggers R2: sin acceso EXECUTE desde anon/authenticated';
