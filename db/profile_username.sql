create function gdv_private.guard_profile_username() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' or new.username is distinct from old.username then
  if new.username is null or new.username='' then new.username:='piloto_'||left(replace(new.id::text,'-',''),12); end if;
  if new.username !~ '^[A-Za-z0-9_-]{3,25}$' then raise exception 'El usuario debe tener de 3 a 25 letras, números, guiones o guiones bajos';end if;
  if lower(new.username) in ('admin','administrador','moderador','shimoda','gentedevuelo','soporte') then raise exception 'Nombre reservado';end if;
 end if;
 return new;
end $$;
revoke all on function gdv_private.guard_profile_username() from public,anon,authenticated;
create trigger gdv_profile_username before insert or update on public.profiles for each row execute function gdv_private.guard_profile_username();
