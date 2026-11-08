
do $do$
declare v text;
begin
 select pg_get_functiondef('public.aerosuite_delete_institution(uuid,text)'::regprocedure) into v;
 if position('v_members integer := 0;' in v)=0 or
    position('delete from public.aerosuite_institution_invitations where institution_id=p_institution_id;' in v)=0
 then raise exception 'Unexpected schema for institution deletion';end if;
 v:=replace(v,'v_members integer := 0;','v_members integer := 0; v_purged integer := 0; v_kept integer := 0; v_candidate uuid;');
 v:=replace(v,
  'delete from public.aerosuite_institution_invitations where institution_id=p_institution_id;',
  'if v_row.is_test then
    for v_candidate in
      select distinct u.id from auth.users u
      where exists(select 1 from public.aerosuite_institution_invitations inv
        where inv.institution_id=p_institution_id and lower(btrim(inv.email))=lower(btrim(u.email)))
        or exists(select 1 from public.aerosuite_institution_members m
         where m.institution_id=p_institution_id and m.user_id=u.id)
    loop
     if private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate)
        then v_purged:=v_purged+1; else v_kept:=v_kept+1; end if;
    end loop;
  end if;
  delete from public.aerosuite_institution_invitations where institution_id=p_institution_id;');
 v:=replace(v,
  '''removed_invitations'',v_invites,''removed_members'',v_members)',
  '''removed_invitations'',v_invites,''removed_members'',v_members,
   ''removed_test_accounts'',v_purged,''protected_accounts'',v_kept)');
 execute v;
 select pg_get_functiondef('public.aerosuite_manage_staff_remove(uuid,uuid,text,text)'::regprocedure) into v;
 if position('v_mode text; v_role text; v_email text; v_org record; v_changed int;' in v)=0 then
   raise exception 'Unexpected schema for director staff unlink';end if;
 v:=replace(v,'v_mode text; v_role text; v_email text; v_org record; v_changed int;',
  'v_mode text; v_role text; v_email text; v_org record; v_changed int;
   v_candidate uuid; v_purged boolean:=false;');
 v:=replace(v,
  'return jsonb_build_object(''ok'',true,''role'',p_role,''email'',v_email,''kind'',p_kind);',
  'if exists(select 1 from public.aerosuite_institutions org
       where org.id=p_institution_id and org.is_test) then
    select u.id into v_candidate from auth.users u
     where lower(btrim(u.email))=lower(btrim(v_email))
     order by u.created_at desc limit 1;
    if v_candidate is not null then
      v_purged:=private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate);
    end if;
  end if;
  return jsonb_build_object(''ok'',true,''role'',p_role,''email'',v_email,''kind'',p_kind,
    ''removed_test_account'',v_purged);');
 execute v;
 select pg_get_functiondef('public.aerosuite_superadmin_manage_registration(uuid,uuid,text,text)'::regprocedure) into v;
 if position('v_actor uuid:=(select auth.uid()); v_mail text; v_changed integer;' in v)=0 then
   raise exception 'Unexpected schema for central registration management';end if;
 v:=replace(v,'v_actor uuid:=(select auth.uid()); v_mail text; v_changed integer;',
  'v_actor uuid:=(select auth.uid()); v_mail text; v_changed integer;
   v_candidate uuid; v_purged boolean:=false;');
 v:=replace(v,
   'return jsonb_build_object(''ok'',true,''kind'',p_kind,''role'',p_role);',
   'if exists(select 1 from public.aerosuite_institutions org
       where org.id=p_institution_id and org.is_test) then
    select u.id into v_candidate from auth.users u
     where lower(btrim(u.email))=lower(btrim(v_mail))
     order by u.created_at desc limit 1;
    if v_candidate is not null and v_candidate<>v_actor then
      v_purged:=private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate);
    end if;
  end if;
  return jsonb_build_object(''ok'',true,''kind'',p_kind,''role'',p_role,
   ''removed_test_account'',v_purged);');
 execute v;
end;
$do$;
