create or replace function gdv_private.guard_content() returns trigger language plpgsql security definer set search_path='' as $$
 declare n integer; changed boolean; blocked boolean; parent public.gdv_comments; topic public.gdv_topics;
 begin
 if auth.uid() is null then raise exception 'Cuenta requerida'; end if;
 if not gdv_private.can_participate() then raise exception 'Cuenta sin verificar o suspendida'; end if;
 if tg_op='INSERT' then
   new.author_id:=auth.uid(); new.created_at:=now(); new.updated_at:=now();
   select coalesce(restricted,false) into blocked from public.gdv_members where user_id=auth.uid();
   if tg_table_name='gdv_topics' then
     select count(*) into n from public.gdv_topics where author_id=auth.uid() and status='approved';
     new.status:=case when gdv_private.is_admin() or n>=3 and not coalesce(blocked,false) then 'approved' else 'pending' end;
     new.pinned:=false;new.state:='open';new.legacy_key:=null;
   else
     select * into topic from public.gdv_topics where id=new.topic_id;
     if topic.status<>'approved' or topic.state in ('closed','archived') then raise exception 'Tema cerrado o no aprobado';end if;
     if new.parent_id is not null then
       select * into parent from public.gdv_comments where id=new.parent_id;
       if parent.id is null or parent.topic_id<>new.topic_id or parent.status<>'approved' then raise exception 'Respuesta de destino no válida';end if;
     end if;
     select count(*) into n from public.gdv_comments where author_id=auth.uid() and status='approved';
     new.status:=case when gdv_private.is_admin() or n>=5 and not coalesce(blocked,false) then 'approved' else 'pending' end;
     new.deleted:=false;new.legacy_key:=null;
   end if;
 else
   if new.id<>old.id or new.author_id is distinct from old.author_id or new.created_at<>old.created_at or new.legacy_key is distinct from old.legacy_key then raise exception 'Identidad inmutable';end if;
   if tg_table_name='gdv_comments' then if new.topic_id<>old.topic_id or new.parent_id is distinct from old.parent_id then raise exception 'Destino inmutable';end if;end if;
   if not gdv_private.is_admin() then
     if old.author_id<>auth.uid() then raise exception 'No autorizado';end if;
     if new.status<>old.status then raise exception 'Estado reservado a moderación';end if;
     if tg_table_name='gdv_topics' then if new.pinned<>old.pinned or new.state not in ('open','resolved') then raise exception 'Estado reservado a moderación';end if;end if;
     if tg_table_name='gdv_comments' then if new.deleted<>old.deleted then new.content:='Comentario eliminado por su autor';end if;end if;
     changed:=new.content is distinct from old.content;
     if tg_table_name='gdv_topics' then
       changed:=changed or new.title is distinct from old.title or new.summary is distinct from old.summary or new.category is distinct from old.category or new.source_url is distinct from old.source_url or new.tags is distinct from old.tags or new.travel is distinct from old.travel;
       if old.state in ('closed','archived') then raise exception 'Este tema está cerrado por moderación'; end if;
     end if;
     if changed then
       select coalesce(restricted,false) into blocked from public.gdv_members where user_id=auth.uid();
       if tg_table_name='gdv_topics' then select count(*) into n from public.gdv_topics where author_id=auth.uid() and status='approved';
       else select count(*) into n from public.gdv_comments where author_id=auth.uid() and status='approved';end if;
       if coalesce(blocked,false) or n < (case when tg_table_name='gdv_topics' then 3 else 5 end) then new.status:='pending';end if;
     end if;
   end if;
   if tg_table_name='gdv_comments' then if new.deleted then new.content:='Comentario eliminado por su autor'; new.status:=old.status; end if; end if;
   new.updated_at:=now();
   insert into public.gdv_audit(actor,entity,record_id,old_data,new_data) values(auth.uid(),tg_table_name,new.id,to_jsonb(old),to_jsonb(new));
 end if;
 return new;
 end $$;

-- Validate at the server as well as in the editor.
create or replace function gdv_private.validate_topic() returns trigger language plpgsql set search_path='' as $$
begin
 if length(btrim(new.title))<3 or length(btrim(new.content))<1 then raise exception 'Completá el título y el contenido'; end if;
 if cardinality(new.tags)>12 then raise exception 'Máximo 12 etiquetas';end if;
 if new.category='noticias' and coalesce(new.source_url,'')='' then raise exception 'Las noticias necesitan una fuente';end if;
 return new;
end $$;
revoke all on function gdv_private.validate_topic() from public,anon,authenticated;
create trigger gdv_topic_validation before insert or update on public.gdv_topics for each row execute function gdv_private.validate_topic();

-- Serialize attachments per topic and require moderation for restricted/new authors.
create or replace function gdv_private.guard_media() returns trigger language plpgsql security definer set search_path='' as $$
declare topic public.gdv_topics; n integer; blocked boolean;
begin
 if not gdv_private.can_participate() then raise exception 'Cuenta activa requerida';end if;
 select * into topic from public.gdv_topics where id=new.topic_id for update;
 if topic.author_id is distinct from auth.uid() or new.owner_id is distinct from auth.uid() then raise exception 'No autorizado';end if;
 if topic.state in ('closed','archived') then raise exception 'Tema cerrado';end if;
 if (select count(*) from public.gdv_media where topic_id=new.topic_id)>=6 then raise exception 'Máximo 6 archivos por publicación';end if;
 if new.legacy_url is not null or new.path not like auth.uid()::text||'/%' then raise exception 'Archivo no válido';end if;
 select count(*) into n from public.gdv_topics where author_id=auth.uid() and status='approved';
 select coalesce(restricted,false) into blocked from public.gdv_members where user_id=auth.uid();
 if not gdv_private.is_admin() and (n<3 or coalesce(blocked,false)) and topic.status='approved' then
   -- guard_content rejects user-set moderation status; keeping the topic unchanged here
   -- avoids bypassing it. A new attachment therefore requires a pending topic.
   raise exception 'Editá el contenido y enviá el tema a revisión antes de agregar archivos';
 end if;
 return new;
end $$;
revoke all on function gdv_private.guard_media() from public,anon,authenticated;
create trigger gdv_media_guard before insert on public.gdv_media for each row execute function gdv_private.guard_media();

-- Restrict moderation changes and record a reason in the private audit trail.
create or replace function gdv_private.audit_member() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not gdv_private.is_admin() then raise exception 'Solo administración';end if;
 if new.user_id=auth.uid() then raise exception 'No podés aplicar una sanción a tu propia cuenta';end if;
 if coalesce(length(btrim(new.reason)),0)<5 then raise exception 'Indicá el motivo de la medida';end if;
 new.updated_at:=now();
 insert into public.gdv_audit(actor,entity,record_id,old_data,new_data) values(auth.uid(),'gdv_members',new.user_id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 insert into public.gdv_notifications(user_id,message) values(new.user_id,'Administración actualizó tu cuenta. Motivo: '||new.reason||case when new.suspended_until>now() then '. Suspensión hasta '||to_char(new.suspended_until at time zone 'America/Argentina/Buenos_Aires','DD/MM/YYYY HH24:MI') when new.restricted then '. Tus aportes requieren aprobación previa.' else '. Cuenta habilitada.' end||' Podés solicitar revisión desde Contacto.');
 return new;
end $$;
revoke all on function gdv_private.audit_member() from public,anon,authenticated;
create trigger gdv_member_audit before insert or update on public.gdv_members for each row execute function gdv_private.audit_member();

-- Categories are public to read, but only administrators may change their presentation.
grant update(name,color,welcome,rules) on public.gdv_categories to authenticated;
create policy categories_admin_update on public.gdv_categories for update to authenticated using(gdv_private.is_admin()) with check(gdv_private.is_admin());
alter table public.gdv_categories add constraint gdv_category_color check(color ~ '^#[0-9A-Fa-f]{6}$');

-- Username history is private. A client cannot forge or reset the 90-day window.
create table gdv_private.username_changes(user_id uuid not null references auth.users(id),old_username text,new_username text not null,changed_at timestamptz not null default now());
create index username_changes_user on gdv_private.username_changes(user_id,changed_at desc);
alter table gdv_private.username_changes enable row level security;
revoke all on gdv_private.username_changes from public,anon,authenticated;
create or replace function gdv_private.guard_profile_username() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.username is distinct from old.username then
  if new.username is null or new.username='' then new.username:='piloto_'||left(replace(new.id::text,'-',''),12);end if;
  if new.username !~ '^[A-Za-z0-9_-]{3,25}$' then raise exception 'El usuario debe tener de 3 a 25 letras, números, guiones o guiones bajos';end if;
  if lower(new.username) in ('admin','administrador','moderador','shimoda','gentedevuelo','soporte') then raise exception 'Nombre reservado';end if;
  if tg_op='UPDATE' then
    if auth.uid() is null or new.id is distinct from auth.uid() then raise exception 'Solo el titular puede cambiar su usuario';end if;
    if exists(select 1 from gdv_private.username_changes where user_id=new.id and changed_at>now()-interval '90 days') then raise exception 'Podés cambiar el usuario una vez cada 90 días';end if;
    insert into gdv_private.username_changes(user_id,old_username,new_username) values(new.id,old.username,new.username);
  end if;
 end if;
 return new;
end $$;
revoke all on function gdv_private.guard_profile_username() from public,anon,authenticated;

-- Notification of mentions only after approval, with deduplication across edits.
create table gdv_private.mention_deliveries(entity text not null,record_id uuid not null,user_id uuid not null references auth.users(id),primary key(entity,record_id,user_id));
alter table gdv_private.mention_deliveries enable row level security;
revoke all on gdv_private.mention_deliveries from public,anon,authenticated;
create or replace function gdv_private.notify_mentions() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; tid uuid;
begin
 if auth.uid() is null or new.status<>'approved' then return new;end if;
 if tg_table_name='gdv_comments' then
  if new.deleted then return new;end if;
  tid:=new.topic_id;
 else tid:=new.id;end if;
 for recipient in
  select distinct p.id from regexp_matches(new.content,'(^|[^A-Za-z0-9_])@([A-Za-z0-9_-]{3,25})(?=$|[^A-Za-z0-9_-])','g') m
  join public.profiles p on lower(p.username)=lower(m[2]) where p.id<>new.author_id
 loop
  insert into gdv_private.mention_deliveries(entity,record_id,user_id) values(tg_table_name,new.id,recipient) on conflict do nothing;
  if found then insert into public.gdv_notifications(user_id,topic_id,message) values(recipient,tid,'Te mencionaron en una conversación');end if;
 end loop;
 return new;
end $$;
revoke all on function gdv_private.notify_mentions() from public,anon,authenticated;
create trigger gdv_topics_mentions after insert or update on public.gdv_topics for each row execute function gdv_private.notify_mentions();
create trigger gdv_comments_mentions after insert or update on public.gdv_comments for each row execute function gdv_private.notify_mentions();

-- Suspended members retain a private way to appeal; participation stays blocked.
create or replace function gdv_private.can_contact() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null);
$$;
revoke all on function gdv_private.can_contact() from public,anon,authenticated;
grant execute on function gdv_private.can_contact() to authenticated;
drop policy contact_send on public.gdv_contact;
create policy contact_send on public.gdv_contact for insert to authenticated with check(user_id=(select auth.uid()) and gdv_private.can_contact());
