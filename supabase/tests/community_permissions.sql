begin;
create temporary table test_ids(k text primary key,id uuid);
insert into test_ids values ('member',gen_random_uuid()),('moderator',gen_random_uuid()),('topic',gen_random_uuid()),('comment',gen_random_uuid());
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) select id,'test-'||id||'@example.invalid',now(),jsonb_build_object('username','test_'||left(replace(id::text,'-',''),12)) from test_ids where k in ('member','moderator');
insert into public.gdv_moderators(user_id) select id from test_ids where k='moderator';
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from test_ids where k='member'),'role','authenticated')::text,true);
grant select on test_ids to authenticated;
set local role authenticated;
insert into public.gdv_topics(id,author_id,category,title,content) select t.id,u.id,'otros','Prueba transaccional','Contenido de prueba' from test_ids t,test_ids u where t.k='topic' and u.k='member';
do $$begin
 if (select status from public.gdv_topics where id=(select id from test_ids where k='topic'))<>'pending' then raise exception 'FAIL: first post must be pending';end if;
 if (select count(*) from public.gdv_moderators)>0 then raise exception 'FAIL: leaked roles';end if;
 begin
  update public.gdv_topics set status='approved' where id=(select id from test_ids where k='topic');
  raise exception 'FAIL: member approved own topic';
 exception when raise_exception then if sqlerrm like 'FAIL:%' then raise;end if;end;
 begin
  insert into public.gdv_moderators(user_id) select id from test_ids where k='member';
  raise exception 'FAIL: member escalated role';
 exception when insufficient_privilege then null;when raise_exception then if sqlerrm like 'FAIL:%' then raise;end if;end;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from test_ids where k='moderator'),'role','authenticated')::text,true);
set local role authenticated;
update public.gdv_topics set status='approved',moderation_reason='Aporte conforme a normativa' where id=(select id from test_ids where k='topic');
do $$begin
 if (select status from public.gdv_topics where id=(select id from test_ids where k='topic'))<>'approved' then raise exception 'FAIL: moderator approval';end if;
 if not exists(select 1 from public.gdv_audit where record_id=(select id from test_ids where k='topic')) then raise exception 'FAIL: audit missing';end if;
 begin
  insert into public.gdv_members(user_id,restricted,reason) select id,true,'Prueba de permisos' from test_ids where k='member';
  raise exception 'FAIL: moderator applied admin-only sanction';
 exception when insufficient_privilege then null;when raise_exception then if sqlerrm like 'FAIL:%' then raise;end if;end;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from test_ids where k='member'),'role','authenticated')::text,true);
set local role authenticated;
insert into public.gdv_comments(id,author_id,topic_id,content) select c.id,u.id,t.id,'Respuesta de prueba' from test_ids c,test_ids u,test_ids t where c.k='comment' and u.k='member' and t.k='topic';
insert into public.gdv_reports(user_id,topic_id,reason) select u.id,t.id,'Prueba de denuncia' from test_ids u,test_ids t where u.k='member' and t.k='topic';
do $$begin
 if (select status from public.gdv_comments where id=(select id from test_ids where k='comment'))<>'pending' then raise exception 'FAIL: first comment moderation';end if;
 if (select status from public.gdv_topics where id=(select id from test_ids where k='topic'))<>'approved' then raise exception 'FAIL: report hid content';end if;
 begin
  insert into public.gdv_reports(user_id,topic_id,reason) select u.id,t.id,'Prueba duplicada' from test_ids u,test_ids t where u.k='member' and t.k='topic';
  raise exception 'FAIL: duplicate report';
 exception when unique_violation then null;end;
 if exists(select 1 from public.gdv_audit) then raise exception 'FAIL: audit visible to member';end if;
end$$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$begin
 if exists(select 1 from public.gdv_comments where status<>'approved') then raise exception 'FAIL: pending comments visible to anon';end if;
end$$;
reset role;
select 'PASS: moderation, role escalation, audit privacy, reports, first contributions' as result;
rollback;
