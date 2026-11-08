
do $do$
declare v text;
begin
 select pg_get_functiondef('private.aerosuite_purge_isolated_test_identity(uuid,uuid)'::regprocedure) into v;
 if position('and not (n.nspname=''public'' and t.relname in' in v)=0 then
  raise exception 'Missing safe FK scan'; end if;
 v:=replace(v,
 '''aerosuite_institution_invitations'',''aerosuite_institution_members''))',
 '''aerosuite_institution_invitations'',''aerosuite_institution_members'',''aerosuite_institution_audit''))');
 v:=replace(v,
 'or exists(select 1 from public.aerosuite_institution_members im
     where im.institution_id<>p_institution_id and im.assigned_by=p_user_id)',
 'or exists(select 1 from public.aerosuite_institution_members im
     where im.institution_id<>p_institution_id and im.assigned_by=p_user_id)
  or exists(select 1 from public.aerosuite_institution_audit audit
     where audit.institution_id<>p_institution_id and audit.changed_by=p_user_id)');
 execute v;
 select pg_get_functiondef('public.aerosuite_manage_staff_remove(uuid,uuid,text,text)'::regprocedure) into v;
 if position('v_purged:=private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate);' in v)=0 then
  raise exception 'Missing director safe reset hook'; end if;
 v:=replace(v,
 'v_purged:=private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate);',
 'v_purged:=private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate);
      if v_purged then
       delete from public.aerosuite_institution_invitations x
         where x.institution_id=p_institution_id and lower(btrim(x.email))=lower(btrim(v_email))
         and x.role=p_role;
      end if;');
 execute v;
 select pg_get_functiondef('public.aerosuite_superadmin_manage_registration(uuid,uuid,text,text)'::regprocedure) into v;
 if position('v_purged:=private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate);' in v)=0 then
  raise exception 'Missing superadmin safe reset hook'; end if;
 v:=replace(v,
 'v_purged:=private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate);',
 'v_purged:=private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate);
      if v_purged then
       delete from public.aerosuite_institution_invitations x
         where x.institution_id=p_institution_id and lower(btrim(x.email))=lower(btrim(v_mail))
         and x.role=p_role;
      end if;');
 execute v;
end;
$do$;
