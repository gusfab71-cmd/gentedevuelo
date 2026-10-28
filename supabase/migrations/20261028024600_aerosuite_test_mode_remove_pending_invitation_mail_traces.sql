
do $do$
declare v text;
begin
 select pg_get_functiondef('public.aerosuite_manage_staff_remove(uuid,uuid,text,text)'::regprocedure) into v;
 if position('return jsonb_build_object(''ok'',true,''role'',p_role,''email'',v_email,''kind'',p_kind,' in v)=0 then
  raise exception 'No se encuentra el cierre de la baja del director'; end if;
 v:=replace(v,
 'return jsonb_build_object(''ok'',true,''role'',p_role,''email'',v_email,''kind'',p_kind,',
 'if exists(select 1 from public.aerosuite_institutions where id=p_institution_id and is_test) then
   delete from public.aerosuite_institution_invitations i
     where i.institution_id=p_institution_id and i.role=p_role
       and lower(btrim(i.email))=lower(btrim(v_email));
   delete from public.aerosuite_institution_audit a
     where a.institution_id=p_institution_id
       and (lower(btrim(a.before_data->>''email''))=lower(btrim(v_email))
         or lower(btrim(a.after_data->>''email''))=lower(btrim(v_email)));
  end if;
  return jsonb_build_object(''ok'',true,''role'',p_role,''email'',v_email,''kind'',p_kind,');
 execute v;
 select pg_get_functiondef('public.aerosuite_superadmin_manage_registration(uuid,uuid,text,text)'::regprocedure) into v;
 if position('return jsonb_build_object(''ok'',true,''kind'',p_kind,''role'',p_role,' in v)=0 then
   raise exception 'No se encuentra el cierre de la baja central';end if;
 v:=replace(v,
 'return jsonb_build_object(''ok'',true,''kind'',p_kind,''role'',p_role,',
 'if exists(select 1 from public.aerosuite_institutions where id=p_institution_id and is_test) then
    delete from public.aerosuite_institution_invitations i
      where i.institution_id=p_institution_id and i.role=p_role
       and lower(btrim(i.email))=lower(btrim(v_mail));
    delete from public.aerosuite_institution_audit a
      where a.institution_id=p_institution_id
       and (lower(btrim(a.before_data->>''email''))=lower(btrim(v_mail))
         or lower(btrim(a.after_data->>''email''))=lower(btrim(v_mail)));
  end if;
  return jsonb_build_object(''ok'',true,''kind'',p_kind,''role'',p_role,');
 execute v;
end;
$do$;
