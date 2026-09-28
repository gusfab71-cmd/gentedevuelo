-- Additive community schema. Existing source tables remain intact.
create schema if not exists gdv_private;
revoke all on schema gdv_private from public, anon, authenticated;
grant usage on schema gdv_private to anon, authenticated;
create table public.gdv_categories (slug text primary key, name text not null, color text not null, welcome text not null, rules text not null, position integer not null);
create table public.gdv_members (user_id uuid primary key references auth.users(id), restricted boolean not null default false, suspended_until timestamptz, reason text, updated_at timestamptz not null default now());
create table public.gdv_topics (
 id uuid primary key default gen_random_uuid(), author_id uuid references public.profiles(id), category text not null references public.gdv_categories(slug),
 title text not null check(length(title) between 3 and 160), summary text not null default '' check(length(summary)<=400), content text not null check(length(content) between 1 and 40000),
 source_url text check(source_url is null or source_url ~ '^https?://'), tags text[] not null default '{}',
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 state text not null default 'open' check(state in ('open','resolved','closed','archived')), pinned boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), legacy_key text unique, travel jsonb
);
create table public.gdv_comments (
 id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.gdv_topics(id), author_id uuid references public.profiles(id),
 parent_id uuid references public.gdv_comments(id), content text not null check(length(content) between 1 and 10000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')), deleted boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), legacy_key text unique
);
create table public.gdv_media (id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.gdv_topics(id), owner_id uuid references auth.users(id), path text, legacy_url text, kind text not null check(kind in ('image','video','pdf')), created_at timestamptz not null default now(), check((path is null)<>(legacy_url is null)));
create table public.gdv_reactions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), topic_id uuid references public.gdv_topics(id), comment_id uuid references public.gdv_comments(id), kind text not null check(kind in ('useful','award')), created_at timestamptz not null default now(), check((topic_id is null)<>(comment_id is null)));
create unique index gdv_reaction_topic on public.gdv_reactions(user_id,topic_id,kind) where topic_id is not null;
create unique index gdv_reaction_comment on public.gdv_reactions(user_id,comment_id,kind) where comment_id is not null;
create table public.gdv_saved (user_id uuid not null references auth.users(id),topic_id uuid not null references public.gdv_topics(id),primary key(user_id,topic_id));
create table public.gdv_follows (user_id uuid not null references auth.users(id),topic_id uuid not null references public.gdv_topics(id),primary key(user_id,topic_id));
create table public.gdv_reports (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), topic_id uuid not null references public.gdv_topics(id), comment_id uuid references public.gdv_comments(id), reason text not null check(length(reason) between 3 and 1000), status text not null default 'pending' check(status in ('pending','resolved')),created_at timestamptz not null default now());
create table public.gdv_notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), topic_id uuid references public.gdv_topics(id), message text not null, read boolean not null default false,created_at timestamptz not null default now());
create table public.gdv_audit (id bigint generated always as identity primary key, actor uuid, entity text not null, record_id uuid, old_data jsonb, new_data jsonb, created_at timestamptz not null default now());
create index gdv_topics_feed on public.gdv_topics(status,created_at desc);
create index gdv_topics_category on public.gdv_topics(category,created_at desc);
create index gdv_topics_author on public.gdv_topics(author_id);
create index gdv_comments_topic on public.gdv_comments(topic_id,created_at);
create index gdv_comments_parent on public.gdv_comments(parent_id);
create index gdv_comments_author on public.gdv_comments(author_id);
create index gdv_media_topic on public.gdv_media(topic_id);
create index gdv_media_owner on public.gdv_media(owner_id);
create index gdv_reactions_topic on public.gdv_reactions(topic_id);
create index gdv_reactions_comment on public.gdv_reactions(comment_id);
create index gdv_saved_topic on public.gdv_saved(topic_id);
create index gdv_follows_topic on public.gdv_follows(topic_id);
create index gdv_reports_topic on public.gdv_reports(topic_id);
create index gdv_reports_comment on public.gdv_reports(comment_id);
create index gdv_reports_user on public.gdv_reports(user_id);
create index gdv_notifications_user on public.gdv_notifications(user_id,created_at desc);
create index gdv_notifications_topic on public.gdv_notifications(topic_id);
create unique index profiles_username_unique on public.profiles(lower(username)) where username is not null and username<>'';

create function gdv_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.site_admins where user_id=auth.uid()); $$;
create function gdv_private.can_participate() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) and not exists(select 1 from public.gdv_members where user_id=auth.uid() and suspended_until>now()); $$;
create function gdv_private.guard_content() returns trigger language plpgsql security definer set search_path='' as $$
 declare n integer; blocked boolean; parent public.gdv_comments; topic public.gdv_topics;
 begin
 if auth.uid() is null then raise exception 'Cuenta requerida'; end if;
 if not gdv_private.can_participate() then raise exception 'Cuenta sin verificar o suspendida'; end if;
 if tg_op='INSERT' then
   new.author_id:=auth.uid(); new.created_at:=now(); new.updated_at:=now();
   select coalesce(restricted,false) into blocked from public.gdv_members where user_id=auth.uid();
   if tg_table_name='gdv_topics' then
     select count(*) into n from public.gdv_topics where author_id=auth.uid() and status='approved';
     new.status:=case when n>=3 and not coalesce(blocked,false) then 'approved' else 'pending' end;
     new.pinned:=false;new.state:='open';new.legacy_key:=null;
   else
     select * into topic from public.gdv_topics where id=new.topic_id;
     if topic.status<>'approved' or topic.state in ('closed','archived') then raise exception 'Tema cerrado o no aprobado';end if;
     if new.parent_id is not null then
       select * into parent from public.gdv_comments where id=new.parent_id;
       if parent.id is null or parent.topic_id<>new.topic_id or parent.status<>'approved' then raise exception 'Respuesta de destino no válida';end if;
     end if;
     select count(*) into n from public.gdv_comments where author_id=auth.uid() and status='approved';
     new.status:=case when n>=5 and not coalesce(blocked,false) then 'approved' else 'pending' end;
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
     if new.content<>old.content then new.status:='pending';end if;
   end if;
   if tg_table_name='gdv_comments' then if new.deleted then new.content:='Comentario eliminado por su autor'; new.status:=old.status; end if; end if;
   new.updated_at:=now();
   insert into public.gdv_audit(actor,entity,record_id,old_data,new_data) values(auth.uid(),tg_table_name,new.id,to_jsonb(old),to_jsonb(new));
 end if;
 return new;
 end $$;
create function gdv_private.notify_content() returns trigger language plpgsql security definer set search_path='' as $$
 declare target_topic uuid;
 begin
 if auth.uid() is null then return new;end if;
 if tg_table_name='gdv_topics' then target_topic:=new.id;else target_topic:=new.topic_id;end if;
 if tg_table_name='gdv_comments' and new.status='approved' and (tg_op='INSERT' or old.status<>'approved') then
   insert into public.gdv_notifications(user_id,topic_id,message)
   select distinct recipient,new.topic_id,'Nueva respuesta en un tema que seguís'
   from (select author_id recipient from public.gdv_topics where id=new.topic_id union select user_id from public.gdv_follows where topic_id=new.topic_id union select author_id from public.gdv_comments where id=new.parent_id) recipients
   where recipient is not null and recipient<>new.author_id;
 end if;
 if tg_op='UPDATE' and new.status<>old.status then
   insert into public.gdv_notifications(user_id,topic_id,message) values(new.author_id,target_topic,'Tu aporte cambió de estado: '||new.status);
 end if;return new;
 end $$;
create function gdv_private.guard_reaction() returns trigger language plpgsql security definer set search_path='' as $$
 declare owner uuid; visible boolean;
 begin
 if not gdv_private.can_participate() or new.user_id<>auth.uid() then raise exception 'Cuenta activa requerida';end if;
 if new.topic_id is not null then select author_id,status='approved' into owner,visible from public.gdv_topics where id=new.topic_id;
 else select c.author_id,c.status='approved' and t.status='approved' into owner,visible from public.gdv_comments c join public.gdv_topics t on t.id=c.topic_id where c.id=new.comment_id;end if;
 if not coalesce(visible,false) or owner=auth.uid() then raise exception 'No se puede valorar este aporte';end if;
 return new;end $$;
revoke all on all functions in schema gdv_private from public,anon,authenticated;
grant execute on function gdv_private.is_admin(),gdv_private.can_participate() to anon,authenticated;

-- Every exposed table uses RLS and minimal privileges.
do $$ declare t text; begin foreach t in array array['gdv_categories','gdv_members','gdv_topics','gdv_comments','gdv_media','gdv_reactions','gdv_saved','gdv_follows','gdv_reports','gdv_notifications','gdv_audit'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon,authenticated',t); end loop;end $$;
grant select on public.gdv_categories,public.gdv_topics,public.gdv_comments,public.gdv_media,public.gdv_reactions to anon,authenticated;
grant insert,update on public.gdv_topics,public.gdv_comments to authenticated;
grant insert,delete on public.gdv_media,public.gdv_reactions to authenticated;
grant select,insert,delete on public.gdv_saved,public.gdv_follows to authenticated;
grant select,insert,update on public.gdv_reports,public.gdv_members to authenticated;
grant select,update on public.gdv_notifications to authenticated;
grant select on public.gdv_audit to authenticated;
create policy categories_public on public.gdv_categories for select using(true);
create policy topics_read on public.gdv_topics for select using(status='approved' or author_id=(select auth.uid()) or gdv_private.is_admin());
create policy topics_create on public.gdv_topics for insert to authenticated with check(author_id=(select auth.uid()) and gdv_private.can_participate());
create policy topics_edit on public.gdv_topics for update to authenticated using(author_id=(select auth.uid()) or gdv_private.is_admin()) with check(author_id=(select auth.uid()) or gdv_private.is_admin());
create policy comments_read on public.gdv_comments for select using((status='approved' and exists(select 1 from public.gdv_topics t where t.id=topic_id and t.status='approved')) or author_id=(select auth.uid()) or gdv_private.is_admin());
create policy comments_create on public.gdv_comments for insert to authenticated with check(author_id=(select auth.uid()) and gdv_private.can_participate());
create policy comments_edit on public.gdv_comments for update to authenticated using(author_id=(select auth.uid()) or gdv_private.is_admin()) with check(author_id=(select auth.uid()) or gdv_private.is_admin());
create policy media_read on public.gdv_media for select using(exists(select 1 from public.gdv_topics t where t.id=topic_id));
create policy media_insert on public.gdv_media for insert to authenticated with check(owner_id=(select auth.uid()) and legacy_url is null and path like (auth.uid()::text||'/%') and gdv_private.can_participate() and exists(select 1 from public.gdv_topics t where t.id=topic_id and t.author_id=auth.uid()));
create policy media_delete on public.gdv_media for delete to authenticated using(owner_id=(select auth.uid()));
create policy reactions_read on public.gdv_reactions for select using((topic_id is not null and exists(select 1 from public.gdv_topics t where t.id=topic_id and t.status='approved')) or (comment_id is not null and exists(select 1 from public.gdv_comments c where c.id=comment_id and c.status='approved')));
create policy reactions_insert on public.gdv_reactions for insert to authenticated with check(user_id=(select auth.uid()) and gdv_private.can_participate());
create policy reactions_delete on public.gdv_reactions for delete to authenticated using(user_id=(select auth.uid()));
create policy saved_own on public.gdv_saved for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and gdv_private.can_participate());
create policy follows_own on public.gdv_follows for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and gdv_private.can_participate());
create policy reports_read on public.gdv_reports for select to authenticated using(user_id=(select auth.uid()) or gdv_private.is_admin());
create policy reports_insert on public.gdv_reports for insert to authenticated with check(user_id=(select auth.uid()) and status='pending' and gdv_private.can_participate());
create policy reports_review on public.gdv_reports for update to authenticated using(gdv_private.is_admin()) with check(gdv_private.is_admin());
create policy members_read on public.gdv_members for select to authenticated using(user_id=(select auth.uid()) or gdv_private.is_admin());
create policy members_admin on public.gdv_members for all to authenticated using(gdv_private.is_admin()) with check(gdv_private.is_admin());
create policy notifications_read on public.gdv_notifications for select to authenticated using(user_id=(select auth.uid()));
revoke update on public.gdv_notifications from authenticated; grant update(read) on public.gdv_notifications to authenticated;
create policy notifications_update on public.gdv_notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy audit_admin on public.gdv_audit for select to authenticated using(gdv_private.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('community-media','community-media',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','application/pdf']);
create policy community_upload on storage.objects for insert to authenticated with check(bucket_id='community-media' and (storage.foldername(name))[1]=(select auth.uid())::text and gdv_private.can_participate());
create policy community_media_read on storage.objects for select to anon,authenticated using(bucket_id='community-media' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.gdv_media m where m.path=name)));
create policy community_media_delete on storage.objects for delete to authenticated using(bucket_id='community-media' and (storage.foldername(name))[1]=(select auth.uid())::text);

insert into public.gdv_categories values
('instruccion','Vuelo e instrucción','#38BDF8','Un espacio para estudiantes, pilotos e instructores.','No promover maniobras inseguras. Las ofertas comerciales corresponden a servicios aeronáuticos.',0),
('civil','Aviación civil y aeronaves','#2563EB','Compartimos modelos, aeródromos, aeroclubes y actividad civil.','Citar las prestaciones. Reparaciones en Técnica y mantenimiento; ventas en AeroTrade.',1),
('planeadores','Planeadores','#14B8A6','Bienvenidos al vuelo a vela: modelos, técnicas, clubes y encuentros.','Separar experiencias de documentación técnica y evitar recomendaciones peligrosas.',2),
('stol','STOL, experimentales y ultralivianos','#F97316','Aeronaves, construcción, proyectos y experiencias.','Identificar proyectos no certificados. No presentar modificaciones personales como procedimientos aprobados.',3),
('aeromodelismo','Aeromodelismo','#8B5CF6','Modelos, construcción, motorización y encuentros.','Describir modelo y sistema. Respetar zonas habilitadas. Ventas en AeroTrade.',4),
('travesias','Travesías y destinos','#22C55E','Compartí rutas, escalas, relatos, fotos y videos.','Indicar fecha, origen, destino, escalas y aeronave. Verificar información actual y proteger datos sensibles.',5),
('meteorologia','Meteorología y seguridad operacional','#64748B','Meteorología, prevención y factores humanos.','Indicar fecha y hora de informes, citar fuentes oficiales y tratar incidentes con finalidad educativa.',6),
('tecnica','Técnica y mantenimiento','#EAB308','Motores, aviónica, estructuras y mantenimiento.','Indicar aeronave o componente y citar manuales. No sustituye la intervención profesional.',7),
('historia','Historia de la aviación','#B45309','Protagonistas, acontecimientos y documentos aeronáuticos.','Citar fuentes, diferenciar hechos y testimonios, y respetar derechos de autor.',8),
('noticias','Noticias aeronáuticas','#4F46E5','Actualidad, eventos y novedades del sector.','Fecha y fuente obligatorias. Sin títulos sensacionalistas; rumores identificados como información en verificación.',9),
('simulacion','Simulación de vuelo','#C026D3','Software, equipos, cabinas y experiencias.','Indicar software y equipo. No equiparar automáticamente simulación con instrucción real.',10),
('militar','Aviación militar','#5F7A3A','Aeronaves, unidades, tecnología e historia militar.','Solo información pública. Nada sensible. Debates centrados en aviación.',11),
('otros','Otros','#6B7280','Temas aeronáuticos que no encuentran otra categoría.','Comprobar primero las demás temáticas. Moderación puede mover el tema.',12);

insert into public.gdv_topics(author_id,category,title,summary,content,status,created_at,legacy_key)
select autor_id,case when lower(titulo) like '%historia%' or lower(titulo) like '%aviadores argentinos%' then 'historia' when lower(titulo) like '%aerodin%' then 'instruccion' else 'otros' end,
 titulo,left(contenido,250),contenido,case when aprobado then 'approved' else 'pending' end,coalesce(created_at,now()),'publicaciones:'||id from public.publicaciones;
insert into public.gdv_comments(topic_id,author_id,content,status,created_at,legacy_key)
select t.id,r.user_id,r.contenido,case r.estado when 'aprobado' then 'approved' when 'rechazado' then 'rejected' else 'pending' end,r.created_at,'forum_respuestas:'||r.id
from public.forum_respuestas r join public.gdv_topics t on t.legacy_key='publicaciones:'||r.publicacion_id;
insert into public.gdv_topics(author_id,category,title,summary,content,status,created_at,legacy_key,travel)
select user_id,'travesias',titulo,left(coalesce(relato,salida||' → '||destino),250),coalesce(nullif(relato,''),salida||' → '||destino),case when visible then 'approved' else 'pending' end,created_at,'travesias:'||id,
jsonb_build_object('fecha',fecha,'salida',salida,'destino',destino,'escalas',escalas,'aeronave',aeronave) from public.travesias;
insert into public.gdv_media(topic_id,owner_id,legacy_url,kind)
select t.id,v.user_id,u.url,'image' from public.travesias v join public.gdv_topics t on t.legacy_key='travesias:'||v.id cross join lateral unnest(v.fotos) u(url) where u.url ~ '^https?://';
insert into public.gdv_media(topic_id,owner_id,legacy_url,kind)
select t.id,v.user_id,u.url,'video' from public.travesias v join public.gdv_topics t on t.legacy_key='travesias:'||v.id cross join lateral unnest(v.videos) u(url) where u.url ~ '^https?://';
insert into public.gdv_topics(author_id,category,title,summary,content,status,created_at,legacy_key)
select user_id,'otros','Archivo multimedia de la comunidad','Archivo conservado desde la galería.','Archivo conservado desde la galería original.',case when visible then 'approved' else 'pending' end,created_at,'galeria:'||id from public.galeria;
insert into public.gdv_media(topic_id,owner_id,legacy_url,kind)
select t.id,g.user_id,g.archivo,case when g.archivo ~* '\.(mp4|webm|mov)([?].*)?$' then 'video' else 'image' end from public.galeria g join public.gdv_topics t on t.legacy_key='galeria:'||g.id where g.archivo ~ '^https?://';
create trigger gdv_topics_guard before insert or update on public.gdv_topics for each row execute function gdv_private.guard_content();
create trigger gdv_comments_guard before insert or update on public.gdv_comments for each row execute function gdv_private.guard_content();
create trigger gdv_topics_notify after insert or update on public.gdv_topics for each row execute function gdv_private.notify_content();
create trigger gdv_comments_notify after insert or update on public.gdv_comments for each row execute function gdv_private.notify_content();
create trigger gdv_reactions_guard before insert on public.gdv_reactions for each row execute function gdv_private.guard_reaction();
