-- Respuesta atómica a consultas privadas y entrega por Notificaciones.
create or replace function public.gdv_reply_contact(p_contact_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_contact public.gdv_contact;
  v_reply text := btrim(coalesce(p_reply,''));
begin
  if not gdv_private.is_staff() then
    raise exception 'Solo moderación puede responder consultas';
  end if;

  if length(v_reply) < 1 or length(v_reply) > 4000 then
    raise exception 'La respuesta debe tener entre 1 y 4000 caracteres';
  end if;

  select *
  into v_contact
  from public.gdv_contact
  where id = p_contact_id
  for update;

  if not found then
    raise exception 'Consulta inexistente';
  end if;

  update public.gdv_contact
  set admin_reply = v_reply,
      replied_by = auth.uid(),
      replied_at = now()
  where id = p_contact_id;

  insert into public.gdv_notifications(user_id,message)
  values (
    v_contact.user_id,
    'Respuesta de la administración a tu consulta "' || v_contact.subject || '": ' || v_reply
  );
end
$$;

revoke all on function public.gdv_reply_contact(uuid,text) from public,anon;
grant execute on function public.gdv_reply_contact(uuid,text) to authenticated;

drop trigger if exists gdv_contact_reply_delivery on public.gdv_contact;
