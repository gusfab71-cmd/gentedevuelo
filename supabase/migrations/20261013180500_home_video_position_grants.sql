-- Fix 2026-10-13: columnas nuevas para arrastrar el video de la portada.
-- La tabla utiliza GRANT UPDATE por columna; al agregarlas no heredaron permisos.
-- Solo se agregan estas tres columnas para authenticated, nunca para anon.
-- La politica RLS existente restringe UPDATE a miembros de public.site_admins.
GRANT UPDATE (pos_x_pct, pos_y_pct, width_px)
ON TABLE public.gdv_home_video
TO authenticated;
