
do $do$
declare v text;
begin
 select pg_get_functiondef('public.aerosuite_manage_staff_remove(uuid,uuid,text,text)'::regprocedure) into v;
 if position('if v_candidate is not null then' in v)=0 then raise exception 'No hook in staff remove';end if;
 v:=replace(v,
 'if v_candidate is not null then
      v_purged:=private.aerosuite_purge_isolated_test_identity',
 'if v_candidate is not null and v_candidate<>v_actor
      and not exists(select 1 from public.aerosuite_institution_members m
       where m.institution_id=p_institution_id and m.user_id=v_candidate)
      and not exists(select 1 from public.aerosuite_institution_invitations i
       where i.institution_id=p_institution_id and lower(btrim(i.email))=lower(btrim(v_email))
        and i.role<>p_role and i.accepted_at is null and i.revoked_at is null)
      then
      v_purged:=private.aerosuite_purge_isolated_test_identity');
 execute v;
 select pg_get_functiondef('public.aerosuite_superadmin_manage_registration(uuid,uuid,text,text)'::regprocedure) into v;
 if position('if v_candidate is not null and v_candidate<>v_actor then' in v)=0 then
    raise exception 'No hook in central management';end if;
 v:=replace(v,
 'if v_candidate is not null and v_candidate<>v_actor then',
 'if v_candidate is not null and v_candidate<>v_actor
      and not exists(select 1 from public.aerosuite_institution_members m
       where m.institution_id=p_institution_id and m.user_id=v_candidate)
      and not exists(select 1 from public.aerosuite_institution_invitations i
       where i.institution_id=p_institution_id and lower(btrim(i.email))=lower(btrim(v_mail))
         and i.role<>p_role and i.accepted_at is null and i.revoked_at is null)
    then');
 execute v;
end;
$do$;
