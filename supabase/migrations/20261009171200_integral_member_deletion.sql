CREATE OR REPLACE FUNCTION public.gdv_admin_delete_member(p_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  topic_ids uuid[] := array[]::uuid[];
  comment_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null or not exists (
    select 1 from public.site_admins where user_id = auth.uid()
  ) then
    raise exception 'Acceso restringido';
  end if;
  if p_user is null then
    raise exception 'Integrante inválido';
  end if;
  if p_user = auth.uid() then
    raise exception 'No podés eliminar tu propia cuenta administradora';
  end if;
  if exists (select 1 from public.site_admins where user_id = p_user) then
    raise exception 'No se puede eliminar otra cuenta administradora desde Integrantes';
  end if;
  if exists (select 1 from public.gdv_special_users where user_id = p_user) then
    raise exception 'Esta es una cuenta especial protegida';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'La cuenta ya no existe';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 72026));

  select coalesce(array_agg(t.id), array[]::uuid[])
    into topic_ids from public.gdv_topics t where t.author_id = p_user;

  -- Also remove nested replies to that person's comments: their parent thread is removed.
  with recursive branch as (
    select c.id from public.gdv_comments c
     where c.author_id = p_user or c.topic_id = any(topic_ids)
    union
    select c.id from public.gdv_comments c
      join branch b on c.parent_id = b.id
  )
  select coalesce(array_agg(distinct id), array[]::uuid[])
    into comment_ids from branch;

  -- Discard outdated notifications or moderation tasks associated with removed material.
  delete from public.gdv_whatsapp_moderation_queue q
   where (q.source_table = 'gdv_topics' and q.source_id = any(array(select unnest(topic_ids)::text)))
      or (q.source_table = 'gdv_comments' and q.source_id = any(array(select unnest(comment_ids)::text)));
  delete from public.gdv_email_outbox e
   where e.user_id = p_user
      or (e.source_table = 'gdv_topics' and e.source_id = any(array(select unnest(topic_ids)::text)))
      or (e.source_table = 'gdv_comments' and e.source_id = any(array(select unnest(comment_ids)::text)));

  -- Remove every relation to topics and threaded comments before the actual rows.
  delete from public.gdv_reactions
   where user_id = p_user or topic_id = any(topic_ids) or comment_id = any(comment_ids);
  delete from public.gdv_reports
   where user_id = p_user or topic_id = any(topic_ids) or comment_id = any(comment_ids);
  delete from public.gdv_follows where user_id = p_user or topic_id = any(topic_ids);
  delete from public.gdv_saved where user_id = p_user or topic_id = any(topic_ids);
  delete from public.gdv_notifications where user_id = p_user or topic_id = any(topic_ids);

  -- Deletion triggers schedule Cloudflare R2 files for safe, reference-checked removal.
  delete from public.gdv_media where owner_id = p_user or topic_id = any(topic_ids);
  delete from public.gdv_comments where id = any(comment_ids);
  delete from public.gdv_topics where id = any(topic_ids);

  -- Legacy forum, gallery, hangar, journeys, commerce and events.
  delete from public.forum_respuestas
   where user_id = p_user or publicacion_id in
     (select id from public.publicaciones where autor_id = p_user);
  delete from public.publicaciones where autor_id = p_user;
  delete from public.forum_posts where user_id = p_user;
  delete from public.galeria where user_id = p_user;
  delete from public.clasificados where user_id = p_user;
  delete from public.travesias where user_id = p_user;
  delete from public.actividades where user_id = p_user;
  delete from public.aportes_adjuntos where user_id = p_user;
  delete from public.aportes_destacados
   where user_id = p_user or origen_profile_id = p_user;
  delete from public."Licencias" where user_id = p_user;
  delete from public.gdv_chat_messages where author_id = p_user;
  delete from public.shimoda_comentarios where user_id = p_user;
  delete from public.robert_chat_logs where user_id = p_user;

  -- Private data and other account-linked records.
  update public.gdv_contact set replied_by = null where replied_by = p_user;
  delete from public.gdv_contact where user_id = p_user;
  delete from public.gdv_warnings where actor = p_user or user_id = p_user;
  delete from public.gdv_members where user_id = p_user;
  delete from public.gdv_moderators where user_id = p_user;
  delete from public.gdv_member_presence where user_id = p_user;
  delete from public.gdv_email_preferences where user_id = p_user;
  delete from gdv_private.mention_deliveries where user_id = p_user;
  delete from gdv_private.username_changes where user_id = p_user;

  -- The avatar is queued for Cloudflare cleanup by the profile DELETE trigger.
  delete from public.profiles where id = p_user;
  delete from auth.users where id = p_user;
  return true;
end;
$function$

revoke all on function public.gdv_admin_delete_member(uuid) from public, anon;
grant execute on function public.gdv_admin_delete_member(uuid) to authenticated;
