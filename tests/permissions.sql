-- These checks leave no account, content or notification changes behind.
begin;
do $$declare admin_id uuid; member_id uuid;begin
 select user_id into admin_id from public.site_admins limit 1;
 select id into member_id from auth.users where email_confirmed_at is not null and id<>admin_id limit 1;
 if admin_id is null or member_id is null then raise exception 'These tests require one admin and one confirmed member';end if;
 perform set_config('gdv.test_admin',admin_id::text,true);
 perform set_config('gdv.test_member',member_id::text,true);
 insert into public.profiles(id,username,bio) values(member_id,'test_'||left(replace(member_id::text,'-',''),12),'') on conflict(id) do nothing;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('gdv.test_admin'),true);
do $$
declare tid uuid; uid uuid:=current_setting('gdv.test_member')::uuid; status_text text; denied boolean;
begin
 insert into public.gdv_topics(category,title,content) values('otros','Prueba temporal de permisos','Contenido de prueba con rollback') returning id into tid;
 if (select status from public.gdv_topics where id=tid)<>'approved' then raise exception 'Administrator insert failed';end if;
 perform set_config('gdv.test_topic',tid::text,true);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 denied:=false;
 begin update public.gdv_topics set title='Cambio ajeno' where id=tid returning status into status_text; if status_text is not null then raise exception 'Foreign update allowed';end if; exception when insufficient_privilege then denied:=true;end;
 insert into public.gdv_topics(category,title,content) values('otros','Aporte temporal de prueba','Contenido de prueba con rollback') returning id into tid;
 if (select status from public.gdv_topics where id=tid)<>'pending' then raise exception 'New user bypassed moderation';end if;
 perform set_config('gdv.test_pending',tid::text,true);
 denied:=false;begin update public.gdv_topics set status='approved' where id=tid;exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Self approval allowed';end if;
 perform set_config('request.jwt.claim.sub',current_setting('gdv.test_admin'),true);
 update public.gdv_topics set status='approved' where id=tid;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 update public.gdv_topics set title='Título modificado solamente' where id=tid;
 if (select status from public.gdv_topics where id=tid)<>'pending' then raise exception 'Title edit bypassed moderation';end if;
 perform set_config('request.jwt.claim.sub',current_setting('gdv.test_admin'),true);
 update public.gdv_topics set status='approved',state='closed' where id=tid;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 denied:=false;begin update public.gdv_topics set state='open' where id=tid;exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Author reopened moderator-closed topic';end if;
 perform set_config('request.jwt.claim.sub',current_setting('gdv.test_admin'),true);
 insert into public.gdv_members(user_id,restricted,suspended_until,reason) values(uid,true,now()+interval '7 days','Prueba temporal revertida') on conflict(user_id) do update set suspended_until=excluded.suspended_until,reason=excluded.reason;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 denied:=false;begin insert into public.gdv_topics(category,title,content) values('otros','No permitido','Cuenta suspendida');exception when raise_exception or insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Suspended member published';end if;
 insert into public.gdv_contact(user_id,subject,message) values(uid,'Revisión de medida','Solicitud temporal de revisión, revertida');
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 if exists(select 1 from public.gdv_topics where status<>'approved') then raise exception 'Anonymous sees unapproved content';end if;
 if has_table_privilege('anon','public.gdv_audit','SELECT') then raise exception 'Anonymous can read audit';end if;
end $$;
rollback;
