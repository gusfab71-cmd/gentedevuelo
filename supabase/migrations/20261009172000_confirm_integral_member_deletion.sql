-- The legacy UI promises to keep posts. Fail closed until the interface supports full deletion.
alter function public.gdv_admin_delete_member(uuid) rename to gdv_admin_delete_member_integral_core;
revoke all on function public.gdv_admin_delete_member_integral_core(uuid) from public, anon, authenticated;
create function public.gdv_admin_delete_member(p_user uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 raise exception 'Actualizá Gente de Vuelo para eliminar un integrante y sus contenidos. Esta versión antigua está bloqueada para proteger los datos.';
end;
$$;
revoke all on function public.gdv_admin_delete_member(uuid) from public, anon;
grant execute on function public.gdv_admin_delete_member(uuid) to authenticated;
create function public.gdv_admin_delete_member(p_user uuid, p_confirmation text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if p_confirmation is distinct from 'ELIMINAR CUENTA Y CONTENIDO' then
   raise exception 'Falta confirmar la eliminación completa';
 end if;
 return public.gdv_admin_delete_member_integral_core(p_user);
end;
$$;
revoke all on function public.gdv_admin_delete_member(uuid,text) from public, anon;
grant execute on function public.gdv_admin_delete_member(uuid,text) to authenticated;
