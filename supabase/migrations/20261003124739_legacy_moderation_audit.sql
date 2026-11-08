create function gdv_private.audit_legacy_moderation() returns trigger language plpgsql security definer set search_path='' as $$
declare before_data jsonb:=to_jsonb(old); after_data jsonb:=to_jsonb(new); owner_id uuid; changed boolean;
begin
 if auth.uid() is null or not gdv_private.is_admin() then return new;end if;
 select exists(select 1 from unnest(array['estado','estado_publicacion','aprobado','publicado','visible','destacado']) k where before_data->k is distinct from after_data->k) into changed;
 if not changed then return new;end if;
 if length(btrim(new.moderation_reason))<5 then raise exception 'Indicá un motivo de al menos cinco caracteres';end if;
 insert into public.gdv_audit(actor,entity,old_data,new_data) values(auth.uid(),tg_table_name,before_data,after_data);
 owner_id:=coalesce(after_data->>'user_id',after_data->>'autor_id')::uuid;
 if owner_id is not null then insert into public.gdv_notifications(user_id,message) values(owner_id,'Moderación revisó tu contenido en '||tg_table_name||'. Motivo: '||new.moderation_reason||'. Podés solicitar revisión desde Contacto.');end if;
 return new;
end$$;
revoke all on function gdv_private.audit_legacy_moderation() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['publicaciones','forum_respuestas','aportes_destacados','actividades','galeria','travesias','clasificados','shimoda_comentarios','shimoda_publicaciones'] loop
 execute format('alter table public.%I add column moderation_reason text not null default %L',t,'');
 execute format('create trigger gdv_audit_moderation before update on public.%I for each row execute function gdv_private.audit_legacy_moderation()',t);
 end loop;
end$$;
