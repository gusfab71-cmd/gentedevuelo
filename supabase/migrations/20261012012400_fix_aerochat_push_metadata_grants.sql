-- Corrección de avisos push de AeroChat (octubre 2026).
-- La función gdv-aerochat-push necesita verificar la autoría y el destino
-- de mensajes sin poder leer sus contenidos privados.
-- Mantener las políticas RLS y el bloqueo de SELECT(content) del service_role.
grant select (id, sender_id, recipient_id, created_at)
  on table public.gdv_private_messages to service_role;

grant select (id, author_id, created_at)
  on table public.gdv_chat_messages to service_role;
