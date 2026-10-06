-- Gestión de consultas privadas: respuesta del administrador y eliminación.
alter table public.gdv_contact
  add column if not exists admin_reply text,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references auth.users(id);

alter table public.gdv_contact
  drop constraint if exists gdv_contact_admin_reply_length;
alter table public.gdv_contact
  add constraint gdv_contact_admin_reply_length
  check (admin_reply is null or length(btrim(admin_reply)) between 1 and 4000);

drop policy if exists contact_staff_update on public.gdv_contact;
create policy contact_staff_update on public.gdv_contact
  for update to authenticated
  using (gdv_private.is_staff())
  with check (gdv_private.is_staff());

drop policy if exists contact_staff_delete on public.gdv_contact;
create policy contact_staff_delete on public.gdv_contact
  for delete to authenticated
  using (gdv_private.is_staff());

create or replace function gdv_private.deliver_contact_reply()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.admin_reply is distinct from old.admin_reply and new.admin_reply is not null then
    if not gdv_private.is_staff() then raise exception 'Solo moderación puede responder consultas'; end if;
    new.replied_by := auth.uid();
    new.replied_at := now();
    insert into public.gdv_notifications(user_id,message)
    values (new.user_id,'Respuesta de la administración a tu consulta "' || new.subject || '": ' || new.admin_reply);
  end if;
  return new;
end
$$;

revoke all on function gdv_private.deliver_contact_reply() from public,anon,authenticated;
drop trigger if exists gdv_contact_reply_delivery on public.gdv_contact;
create trigger gdv_contact_reply_delivery
before update of admin_reply on public.gdv_contact
for each row execute function gdv_private.deliver_contact_reply();
