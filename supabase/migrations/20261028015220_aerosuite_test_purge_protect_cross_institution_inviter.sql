
do $body$
declare v text;
begin
 select pg_get_functiondef('private.aerosuite_purge_isolated_test_identity(uuid,uuid)'::regprocedure) into v;
 v:=replace(v,
 'or exists(select 1 from public.aerosuite_member_documents md where md.user_id=p_user_id)',
 'or exists(select 1 from public.aerosuite_member_documents md where md.user_id=p_user_id)
  or exists(select 1 from public.aerosuite_institution_invitations inv
     where inv.institution_id<>p_institution_id
       and (inv.created_by=p_user_id or inv.accepted_by=p_user_id or inv.registered_by=p_user_id))
  or exists(select 1 from public.aerosuite_institution_members im
     where im.institution_id<>p_institution_id and im.assigned_by=p_user_id)');
 execute v;
end;
$body$;
