create or replace function public.gdv_admin_delete_content(p_kind text, p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $function$
declare
  old_row jsonb;
  media_paths text[] := array[]::text[];
begin
  if auth.uid() is null or not gdv_private.is_staff() then
    raise exception 'Solo moderación';
  end if;

  if p_kind = 'topic' then
    select to_jsonb(t) into old_row
    from public.gdv_topics t
    where t.id = p_id;

    if old_row is null then
      raise exception 'Publicación no encontrada';
    end if;

    select coalesce(array_agg(m.path) filter (where m.path is not null and m.path <> ''), array[]::text[])
      into media_paths
    from public.gdv_media m
    where m.topic_id = p_id;

    insert into public.gdv_audit(actor, entity, record_id, old_data, new_data)
    values (auth.uid(), 'gdv_topics_delete', p_id, old_row, jsonb_build_object('deleted', true));

    delete from public.gdv_reactions
     where topic_id = p_id
        or comment_id in (select id from public.gdv_comments where topic_id = p_id);

    delete from public.gdv_reports where topic_id = p_id;
    delete from public.gdv_follows where topic_id = p_id;
    delete from public.gdv_saved where topic_id = p_id;
    delete from public.gdv_notifications where topic_id = p_id;
    delete from public.gdv_media where topic_id = p_id;
    delete from public.gdv_comments where topic_id = p_id;
    delete from public.gdv_topics where id = p_id;

    return media_paths;

  elsif p_kind = 'comment' then
    select to_jsonb(c) into old_row
    from public.gdv_comments c
    where c.id = p_id;

    if old_row is null then
      raise exception 'Comentario no encontrado';
    end if;

    insert into public.gdv_audit(actor, entity, record_id, old_data, new_data)
    values (auth.uid(), 'gdv_comments_delete', p_id, old_row, jsonb_build_object('deleted', true));

    with recursive branch as (
      select id from public.gdv_comments where id = p_id
      union all
      select c.id
      from public.gdv_comments c
      join branch b on c.parent_id = b.id
    )
    delete from public.gdv_reactions
    where comment_id in (select id from branch);

    with recursive branch as (
      select id from public.gdv_comments where id = p_id
      union all
      select c.id
      from public.gdv_comments c
      join branch b on c.parent_id = b.id
    )
    delete from public.gdv_reports
    where comment_id in (select id from branch);

    with recursive branch as (
      select id from public.gdv_comments where id = p_id
      union all
      select c.id
      from public.gdv_comments c
      join branch b on c.parent_id = b.id
    )
    delete from public.gdv_comments
    where id in (select id from branch);

    return media_paths;
  else
    raise exception 'Tipo de contenido no válido';
  end if;
end
$function$;

revoke all on function public.gdv_admin_delete_content(text, uuid) from public, anon;
grant execute on function public.gdv_admin_delete_content(text, uuid) to authenticated;
