create or replace function gdv_private.guard_content() returns trigger language plpgsql security definer set search_path='' as $$
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
   new.updated_at:=now();
   insert into public.gdv_audit(actor,entity,record_id,old_data,new_data) values(auth.uid(),tg_table_name,new.id,to_jsonb(old),to_jsonb(new));
 end if;
 return new;
 end $$;
