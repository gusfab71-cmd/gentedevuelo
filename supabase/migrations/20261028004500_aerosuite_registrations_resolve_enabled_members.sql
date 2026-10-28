
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.aerosuite_superadmin_registrations()'::regprocedure) into v_def;
  if position('''invitacion''::text, i.id, i.created_at' in v_def)=0 then
    raise exception 'No se encontró la estructura prevista del padrón';
  end if;
  execute replace(v_def,
  '''invitacion''::text, i.id, i.created_at',
  'case when m.user_id is not null then ''integrante''::text else ''invitacion''::text end, coalesce(m.user_id,i.id), i.created_at');
end $$;
