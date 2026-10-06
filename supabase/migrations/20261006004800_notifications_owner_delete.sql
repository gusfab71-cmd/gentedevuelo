-- Permitir que cada usuario elimine sus propias notificaciones.
drop policy if exists notifications_delete on public.gdv_notifications;
create policy notifications_delete on public.gdv_notifications
  for delete to authenticated
  using (user_id=(select auth.uid()));
