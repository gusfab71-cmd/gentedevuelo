-- Temporal: publicar de inmediato temas y respuestas de cuentas habilitadas.
-- Se conservan revisión de publicaciones comerciales, cuentas restringidas,
-- controles de registro, límites de uso, RLS y moderación posterior.
-- Para volver al esquema anterior, restaurar el guard_content anterior.
CREATE OR REPLACE FUNCTION gdv_private.guard_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n integer;
  changed boolean;
  blocked boolean;
  parent public.gdv_comments;
  topic public.gdv_topics;
begin
  if auth.uid() is null then
    raise exception 'Cuenta requerida';
  end if;

  if not gdv_private.can_participate() then
    raise exception 'Cuenta sin verificar o suspendida';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));

  if tg_op='INSERT' then
    if tg_table_name='gdv_topics'
       and (select count(*) from public.gdv_topics where author_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then
      raise exception 'Máximo diez publicaciones por hora';
    end if;

    if tg_table_name='gdv_comments'
       and (select count(*) from public.gdv_comments where author_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then
      raise exception 'Esperá un minuto antes de comentar nuevamente';
    end if;

    new.moderation_reason:='';
    new.author_id:=auth.uid();
    new.created_at:=now();
    new.updated_at:=now();

    select coalesce(restricted,false)
      into blocked
      from public.gdv_members
     where user_id=auth.uid();

    if tg_table_name='gdv_topics' then
      select count(*) into n
        from public.gdv_topics
       where author_id=auth.uid() and status='approved';

      new.status:=case
        when not new.is_commercial
         and (gdv_private.is_staff() or not coalesce(blocked,false))
        then 'approved'
        else 'pending'
      end;

      new.pinned:=false;
      new.state:='open';
      new.legacy_key:=null;
    else
      select * into topic
        from public.gdv_topics
       where id=new.topic_id;

      if topic.status<>'approved' or topic.state in ('closed','archived') then
        raise exception 'Tema cerrado o no aprobado';
      end if;

      if new.parent_id is not null then
        select * into parent
          from public.gdv_comments
         where id=new.parent_id;

        if parent.id is null or parent.topic_id<>new.topic_id or parent.status<>'approved' then
          raise exception 'Respuesta de destino no válida';
        end if;
      end if;

      select count(*) into n
        from public.gdv_comments
       where author_id=auth.uid() and status='approved';

      new.status:=case
        when gdv_private.is_staff() or not coalesce(blocked,false)
        then 'approved'
        else 'pending'
      end;

      new.deleted:=false;
      new.legacy_key:=null;
    end if;
  else
    if new.id<>old.id
       or new.author_id is distinct from old.author_id
       or new.created_at<>old.created_at
       or new.legacy_key is distinct from old.legacy_key then
      raise exception 'Identidad inmutable';
    end if;

    if tg_table_name='gdv_comments' then
      if new.topic_id<>old.topic_id or new.parent_id is distinct from old.parent_id then
        raise exception 'Destino inmutable';
      end if;
    end if;

    /*
      Aprobar o rechazar contenido no requiere motivo.
      El motivo sigue siendo obligatorio para otras medidas de moderación
      sobre temas: cierre/estado, cambio de temática o fijado.
    */
    if gdv_private.is_staff()
       and tg_table_name='gdv_topics'
       and (
         to_jsonb(new)->>'state' is distinct from to_jsonb(old)->>'state'
         or to_jsonb(new)->>'category' is distinct from to_jsonb(old)->>'category'
         or to_jsonb(new)->>'pinned' is distinct from to_jsonb(old)->>'pinned'
       )
       and length(btrim(new.moderation_reason))<5 then
      raise exception 'Indicá el motivo de moderación';
    end if;

    if not gdv_private.is_staff() then
      if new.moderation_reason<>old.moderation_reason then
        raise exception 'Motivo reservado a moderación';
      end if;

      if old.author_id<>auth.uid() then
        raise exception 'No autorizado';
      end if;

      if new.status<>old.status then
        raise exception 'Estado reservado a moderación';
      end if;

      if tg_table_name='gdv_topics' then
        if new.pinned<>old.pinned or new.state not in ('open','resolved') then
          raise exception 'Estado reservado a moderación';
        end if;
      end if;

      if tg_table_name='gdv_comments' then
        if new.deleted<>old.deleted then
          new.content:='Comentario eliminado por su autor';
        end if;
      end if;

      changed:=new.content is distinct from old.content;

      if tg_table_name='gdv_topics' then
        changed:=changed
          or new.title is distinct from old.title
          or new.summary is distinct from old.summary
          or new.category is distinct from old.category
          or new.source_url is distinct from old.source_url
          or new.tags is distinct from old.tags
          or new.travel is distinct from old.travel
          or new.is_commercial<>old.is_commercial;

        if old.state in ('closed','archived') then
          raise exception 'Este tema está cerrado por moderación';
        end if;
      end if;

      if changed then
        select coalesce(restricted,false)
          into blocked
          from public.gdv_members
         where user_id=auth.uid();

        if tg_table_name='gdv_topics' then
          select count(*) into n
            from public.gdv_topics
           where author_id=auth.uid() and status='approved';
        else
          select count(*) into n
            from public.gdv_comments
           where author_id=auth.uid() and status='approved';
        end if;

        if (tg_table_name='gdv_topics' and (to_jsonb(new)->>'is_commercial')::boolean)
           or coalesce(blocked,false)
            then
          new.status:='pending';
        end if;
      end if;
    end if;

    if tg_table_name='gdv_comments' then
      if new.deleted then
        new.content:='Comentario eliminado por su autor';
        new.status:=old.status;
      end if;
    end if;

    new.updated_at:=now();

    insert into public.gdv_audit(actor,entity,record_id,old_data,new_data)
    values(auth.uid(),tg_table_name,new.id,to_jsonb(old),to_jsonb(new));
  end if;

  return new;
end
$function$
;
