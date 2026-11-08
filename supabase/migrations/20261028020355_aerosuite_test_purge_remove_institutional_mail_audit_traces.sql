
do $do$
declare ddl text;
begin
 select pg_get_functiondef('private.aerosuite_purge_isolated_test_identity(uuid,uuid)'::regprocedure) into ddl;
 if position('delete from public.profiles where id=p_user_id;' in ddl)=0
 then raise exception 'Expected helper not found';end if;
 ddl:=replace(ddl,'delete from public.profiles where id=p_user_id;',
 'delete from public.aerosuite_institution_audit a
    where a.institution_id=p_institution_id
      and (lower(btrim(a.before_data->>''email''))=lower(btrim(v_user.email))
        or lower(btrim(a.after_data->>''email''))=lower(btrim(v_user.email)));
  delete from public.profiles where id=p_user_id;');
 execute ddl;
end;
$do$;
