-- Permitir a usuarios autenticados ejecutar DELETE sobre sus propias notificaciones.
-- La política RLS notifications_delete limita el borrado a user_id = auth.uid().
grant delete on table public.gdv_notifications to authenticated;
revoke delete on table public.gdv_notifications from anon;
