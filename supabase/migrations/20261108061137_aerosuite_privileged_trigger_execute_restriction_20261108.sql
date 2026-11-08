-- Los trigger functions SECURITY DEFINER no son endpoints públicos.
-- Al eliminar EXECUTE de PUBLIC/anon/authenticated se cierra la exposición RPC
-- sin cambiar los triggers existentes ni los permisos de las tablas de origen.
REVOKE ALL ON FUNCTION public.aerosuite_revoke_changed_pilot_license() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gdv_queue_replaced_home_media() FROM PUBLIC,anon,authenticated;
