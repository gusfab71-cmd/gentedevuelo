-- Reparación mínima: la Edge Function del Superadministrador consulta
-- gdv_special_users para proteger esas cuentas de suspensión.
-- La tabla existe pero service_role no tenía SELECT, causando HTTP 503.
-- Sin permiso a anon/authenticated; sin lectura pública ni cambios a registros.
GRANT SELECT ON TABLE public.gdv_special_users TO service_role;
