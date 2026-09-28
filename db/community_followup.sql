-- Preserve relative gallery objects and privately route administration contact.
insert into public.gdv_media(topic_id,owner_id,legacy_url,kind)
select t.id,g.user_id,'https://lmoifzyhqmccvmgitlcp.supabase.co/storage/v1/object/public/hangar-fotos/'||g.archivo,
case when g.archivo ~* '\.(mp4|webm|mov)$' then 'video' else 'image' end
from public.galeria g join public.gdv_topics t on t.legacy_key='galeria:'||g.id where g.archivo is not null and g.archivo !~ '^https?://' and not exists(select 1 from public.gdv_media m where m.topic_id=t.id);
create table public.gdv_contact(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),subject text not null check(length(subject) between 3 and 120),message text not null check(length(message) between 10 and 4000),created_at timestamptz not null default now());
alter table public.gdv_contact enable row level security;
revoke all on public.gdv_contact from anon,authenticated;
grant select,insert on public.gdv_contact to authenticated;
create policy contact_send on public.gdv_contact for insert to authenticated with check(user_id=(select auth.uid()) and gdv_private.can_participate());
create policy contact_read on public.gdv_contact for select to authenticated using(user_id=(select auth.uid()) or gdv_private.is_admin());
create index gdv_contact_user on public.gdv_contact(user_id);
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
