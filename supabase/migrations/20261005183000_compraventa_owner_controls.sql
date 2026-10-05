create or replace function public.toggle_clasificado_pausa(p_id bigint)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_tipo text;
  v_estado_publicacion text;
  v_estado_operacion text;
  v_nuevo_estado text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;

  select user_id, tipo, estado_publicacion, estado_operacion
    into v_user_id, v_tipo, v_estado_publicacion, v_estado_operacion
  from public.clasificados
  where id = p_id;

  if not found or v_user_id is distinct from auth.uid() then
    raise exception 'No tienes permiso para modificar este aviso';
  end if;

  if v_tipo <> 'venta' then
    raise exception 'Solo se pueden pausar publicaciones de venta';
  end if;

  if v_estado_publicacion <> 'aprobado' then
    raise exception 'Solo se pueden pausar publicaciones aprobadas';
  end if;

  v_nuevo_estado := case
    when v_estado_operacion = 'pausado' then 'disponible'
    else 'pausado'
  end;

  update public.clasificados
  set estado_operacion = v_nuevo_estado,
      updated_at = now()
  where id = p_id
    and user_id = auth.uid();

  return v_nuevo_estado;
end;
$$;

revoke all on function public.toggle_clasificado_pausa(bigint) from public;
grant execute on function public.toggle_clasificado_pausa(bigint) to authenticated;
