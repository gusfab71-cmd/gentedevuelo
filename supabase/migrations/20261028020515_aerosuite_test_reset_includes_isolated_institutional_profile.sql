
do $do$
declare v text;
begin
 select pg_get_functiondef('private.aerosuite_purge_isolated_test_identity(uuid,uuid)'::regprocedure) into v;
 if position('or exists(select 1 from public.aerosuite_member_profiles mp where mp.user_id=p_user_id)' in v)=0
 then raise exception 'No se encontró la comprobación esperada'; end if;
 v:=replace(v,
 '  or exists(select 1 from public.aerosuite_member_profiles mp where mp.user_id=p_user_id)
  or exists(select 1 from public.aerosuite_role_declarations rd where rd.user_id=p_user_id)
  or exists(select 1 from public.aerosuite_member_documents md where md.user_id=p_user_id)',
 '');
 v:=replace(v,
 '''aerosuite_institution_invitations'',''aerosuite_institution_members'',''aerosuite_institution_audit''))',
 '''aerosuite_institution_invitations'',''aerosuite_institution_members'',''aerosuite_institution_audit'',''aerosuite_member_profiles'',''aerosuite_role_declarations'',''aerosuite_member_documents''))');
 v:=replace(v,
 'delete from public.profiles where id=p_user_id;',
 'delete from public.aerosuite_member_documents where user_id=p_user_id;
  delete from public.aerosuite_role_declarations where user_id=p_user_id;
  delete from public.aerosuite_member_profiles where user_id=p_user_id;
  delete from public.profiles where id=p_user_id;');
 execute v;
end;
$do$;
