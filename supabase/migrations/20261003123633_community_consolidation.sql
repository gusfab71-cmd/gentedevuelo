create table public.gdv_moderators(user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
alter table public.gdv_moderators enable row level security;
revoke all on public.gdv_moderators from anon,authenticated;
grant select,insert,delete on public.gdv_moderators to authenticated;
create policy moderators_read on public.gdv_moderators for select to authenticated using(user_id=(select auth.uid()) or gdv_private.is_admin());
create policy moderators_add on public.gdv_moderators for insert to authenticated with check(gdv_private.is_admin());
create policy moderators_remove on public.gdv_moderators for delete to authenticated using(gdv_private.is_admin());
create function gdv_private.is_staff() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and (gdv_private.is_admin() or exists(select 1 from public.gdv_moderators where user_id=auth.uid()));$$;
revoke all on function gdv_private.is_staff() from public;
grant execute on function gdv_private.is_staff() to anon,authenticated;
alter table public.gdv_topics add column moderation_reason text not null default '', add column is_commercial boolean not null default false;
alter table public.gdv_comments add column moderation_reason text not null default '';
alter table public.gdv_reports add column resolution text not null default '';

alter policy topics_read on public.gdv_topics using(status='approved' or author_id=(select auth.uid()) or gdv_private.is_staff());
alter policy topics_edit on public.gdv_topics using(author_id=(select auth.uid()) or gdv_private.is_staff()) with check(author_id=(select auth.uid()) or gdv_private.is_staff());
alter policy comments_read on public.gdv_comments using((status='approved' and exists(select 1 from public.gdv_topics t where t.id=topic_id and t.status='approved')) or author_id=(select auth.uid()) or gdv_private.is_staff());
alter policy comments_edit on public.gdv_comments using(author_id=(select auth.uid()) or gdv_private.is_staff()) with check(author_id=(select auth.uid()) or gdv_private.is_staff());
alter policy reports_read on public.gdv_reports using(user_id=(select auth.uid()) or gdv_private.is_staff());
alter policy reports_review on public.gdv_reports using(gdv_private.is_staff()) with check(gdv_private.is_staff());
alter policy audit_admin on public.gdv_audit using(gdv_private.is_staff());
alter policy members_read on public.gdv_members using(user_id=(select auth.uid()) or gdv_private.is_staff());
alter policy contact_read on public.gdv_contact using(user_id=(select auth.uid()) or gdv_private.is_staff());

create unique index gdv_reports_one_pending_per_user on public.gdv_reports(user_id,topic_id,coalesce(comment_id,'00000000-0000-0000-0000-000000000000'::uuid)) where status='pending';
create function gdv_private.guard_report() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Cuenta requerida';end if;
 if tg_op='INSERT' then
  if new.user_id is distinct from auth.uid() or not gdv_private.can_participate() then raise exception 'Cuenta activa requerida';end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.gdv_reports where user_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Límite de diez reportes por hora';end if;
  if not exists(select 1 from public.gdv_topics where id=new.topic_id and status='approved') then raise exception 'Publicación no disponible';end if;
  if new.comment_id is not null and not exists(select 1 from public.gdv_comments where id=new.comment_id and topic_id=new.topic_id and status='approved') then raise exception 'Comentario no válido';end if;
  new.status:='pending';new.created_at:=now();new.resolution:='';
 else
  if not gdv_private.is_staff() then raise exception 'Solo moderación';end if;
  if new.id<>old.id or new.user_id<>old.user_id or new.topic_id<>old.topic_id or new.comment_id is distinct from old.comment_id or new.reason<>old.reason or new.created_at<>old.created_at then raise exception 'Reporte inmutable';end if;
  if length(btrim(new.resolution))<5 then raise exception 'Indicá el motivo';end if;
  insert into public.gdv_audit(actor,entity,record_id,old_data,new_data) values(auth.uid(),'gdv_reports',new.id,to_jsonb(old),to_jsonb(new));
  insert into public.gdv_notifications(user_id,topic_id,message) values(new.user_id,new.topic_id,'Tu reporte fue revisado. Motivo: '||new.resolution||'. Podés solicitar revisión desde Contacto.');
 end if;return new;
end $$;
revoke all on function gdv_private.guard_report() from public,anon,authenticated;
create trigger gdv_report_guard before insert or update on public.gdv_reports for each row execute function gdv_private.guard_report();

create table public.gdv_warnings(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),actor uuid not null references auth.users(id),message text not null check(length(btrim(message)) between 5 and 1000),created_at timestamptz not null default now());
alter table public.gdv_warnings enable row level security;
revoke all on public.gdv_warnings from anon,authenticated;
grant select,insert on public.gdv_warnings to authenticated;
create policy warnings_read on public.gdv_warnings for select to authenticated using(user_id=(select auth.uid()) or gdv_private.is_staff());
create policy warnings_send on public.gdv_warnings for insert to authenticated with check(actor=(select auth.uid()) and gdv_private.is_staff());
create function gdv_private.deliver_warning() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not gdv_private.is_staff() or new.actor is distinct from auth.uid() then raise exception 'Solo moderación';end if;
 new.created_at:=now();
 insert into public.gdv_notifications(user_id,message) values(new.user_id,'Aviso privado de moderación: '||new.message||'. Podés solicitar revisión desde Contacto.');
 insert into public.gdv_audit(actor,entity,record_id,new_data) values(auth.uid(),'gdv_warnings',new.id,to_jsonb(new));return new;
end $$;
revoke all on function gdv_private.deliver_warning() from public,anon,authenticated;
create trigger gdv_warning_delivery before insert on public.gdv_warnings for each row execute function gdv_private.deliver_warning();

update public.gdv_categories c set color=v.color,position=v.position from (values
 ('historia','#FFFFF0',1),('instruccion','#FFFFFF',2),('militar','#E34444',3),('civil','#87CEEB',4),('planeadores','#C71585',5),('travesias','#26734D',6),('meteorologia','#FF1493',7),('stol','#FF8C00',8),('tecnica','#555B63',9),('noticias','#EE8888',10),('aeromodelismo','#FFD700',11),('simulacion','#FFB52E',12),('otros','#A0A0A0',13)
) v(slug,color,position) where c.slug=v.slug;

CREATE OR REPLACE FUNCTION gdv_private.guard_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 declare n integer; changed boolean; blocked boolean; parent public.gdv_comments; topic public.gdv_topics;
 begin
 if auth.uid() is null then raise exception 'Cuenta requerida'; end if;
 if not gdv_private.can_participate() then raise exception 'Cuenta sin verificar o suspendida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 if tg_op='INSERT' then
 if tg_table_name='gdv_topics' and (select count(*) from public.gdv_topics where author_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Máximo diez publicaciones por hora';end if;
 if tg_table_name='gdv_comments' and (select count(*) from public.gdv_comments where author_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'Esperá un minuto antes de comentar nuevamente';end if;
   new.moderation_reason:=''; new.author_id:=auth.uid(); new.created_at:=now(); new.updated_at:=now();
   select coalesce(restricted,false) into blocked from public.gdv_members where user_id=auth.uid();
   if tg_table_name='gdv_topics' then
     select count(*) into n from public.gdv_topics where author_id=auth.uid() and status='approved';
     new.status:=case when not new.is_commercial and (gdv_private.is_staff() or n>=3 and not coalesce(blocked,false)) then 'approved' else 'pending' end;
     new.pinned:=false;new.state:='open';new.legacy_key:=null;
   else
     select * into topic from public.gdv_topics where id=new.topic_id;
     if topic.status<>'approved' or topic.state in ('closed','archived') then raise exception 'Tema cerrado o no aprobado';end if;
     if new.parent_id is not null then
       select * into parent from public.gdv_comments where id=new.parent_id;
       if parent.id is null or parent.topic_id<>new.topic_id or parent.status<>'approved' then raise exception 'Respuesta de destino no válida';end if;
     end if;
     select count(*) into n from public.gdv_comments where author_id=auth.uid() and status='approved';
     new.status:=case when gdv_private.is_staff() or n>=5 and not coalesce(blocked,false) then 'approved' else 'pending' end;
     new.deleted:=false;new.legacy_key:=null;
   end if;
 else
   if new.id<>old.id or new.author_id is distinct from old.author_id or new.created_at<>old.created_at or new.legacy_key is distinct from old.legacy_key then raise exception 'Identidad inmutable';end if;
   if tg_table_name='gdv_comments' then if new.topic_id<>old.topic_id or new.parent_id is distinct from old.parent_id then raise exception 'Destino inmutable';end if;end if;
   if gdv_private.is_staff() and (new.status<>old.status or (tg_table_name='gdv_topics' and (to_jsonb(new)->>'state' is distinct from to_jsonb(old)->>'state' or to_jsonb(new)->>'category' is distinct from to_jsonb(old)->>'category' or to_jsonb(new)->>'pinned' is distinct from to_jsonb(old)->>'pinned'))) and length(btrim(new.moderation_reason))<5 then raise exception 'Indicá el motivo de moderación';end if;
   if not gdv_private.is_staff() then
     if new.moderation_reason<>old.moderation_reason then raise exception 'Motivo reservado a moderación';end if;
     if old.author_id<>auth.uid() then raise exception 'No autorizado';end if;
     if new.status<>old.status then raise exception 'Estado reservado a moderación';end if;
     if tg_table_name='gdv_topics' then if new.pinned<>old.pinned or new.state not in ('open','resolved') then raise exception 'Estado reservado a moderación';end if;end if;
     if tg_table_name='gdv_comments' then if new.deleted<>old.deleted then new.content:='Comentario eliminado por su autor';end if;end if;
     changed:=new.content is distinct from old.content;
     if tg_table_name='gdv_topics' then
       changed:=changed or new.title is distinct from old.title or new.summary is distinct from old.summary or new.category is distinct from old.category or new.source_url is distinct from old.source_url or new.tags is distinct from old.tags or new.travel is distinct from old.travel or new.is_commercial<>old.is_commercial;
       if old.state in ('closed','archived') then raise exception 'Este tema está cerrado por moderación'; end if;
     end if;
     if changed then
       select coalesce(restricted,false) into blocked from public.gdv_members where user_id=auth.uid();
       if tg_table_name='gdv_topics' then select count(*) into n from public.gdv_topics where author_id=auth.uid() and status='approved';
       else select count(*) into n from public.gdv_comments where author_id=auth.uid() and status='approved';end if;
       if (tg_table_name='gdv_topics' and (to_jsonb(new)->>'is_commercial')::boolean) or coalesce(blocked,false) or n < (case when tg_table_name='gdv_topics' then 3 else 5 end) then new.status:='pending';end if;
     end if;
   end if;
   if tg_table_name='gdv_comments' then if new.deleted then new.content:='Comentario eliminado por su autor'; new.status:=old.status; end if; end if;
   new.updated_at:=now();
   insert into public.gdv_audit(actor,entity,record_id,old_data,new_data) values(auth.uid(),tg_table_name,new.id,to_jsonb(old),to_jsonb(new));
 end if;
 return new;
 end $function$
;
CREATE OR REPLACE FUNCTION gdv_private.notify_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if tg_op='UPDATE' and new.author_id is not null and (new.status<>old.status or (tg_table_name='gdv_topics' and (to_jsonb(new)->>'state' is distinct from to_jsonb(old)->>'state' or to_jsonb(new)->>'category' is distinct from to_jsonb(old)->>'category'))) then
   insert into public.gdv_notifications(user_id,topic_id,message) values(new.author_id,target_topic,'Tu aporte fue revisado. Estado: '||new.status||'. Motivo: '||coalesce(nullif(new.moderation_reason,''),'Revisión previa según la normativa de la comunidad')||'. Podés solicitar revisión desde Contacto.');
 end if;return new;
 end $function$
;
