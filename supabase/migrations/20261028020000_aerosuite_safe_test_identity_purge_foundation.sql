
alter table public.aerosuite_institutions
 add column if not exists is_test boolean not null default false;
comment on column public.aerosuite_institutions.is_test is
 'Opt-in: permite limpieza automática de cuentas de Auth creadas exclusivamente por invitaciones de esta institución. Nunca borra miembros GdV ni cuentas compartidas.';

create or replace function private.aerosuite_purge_isolated_test_identity(p_institution_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path to ''
as $fn$
declare v_user auth.users%rowtype; v_profile public.profiles%rowtype; v_ref record; v_count boolean;
begin
 if p_user_id is null or not exists(
   select 1 from public.aerosuite_institutions org
   where org.id=p_institution_id and org.is_test
 ) then return false; end if;
 select * into v_user from auth.users where id=p_user_id for update;
 if not found then return false; end if;
 select * into v_profile from public.profiles where id=p_user_id;
 if not found or v_profile.gdv_community_member is distinct from false
  or v_profile.username is null
  or v_profile.username !~* '^piloto[_-][a-f0-9]{8,}$'
 then return false; end if;
 -- Solo identidades que Auth creó durante una invitación de ESTA institución.
 if not exists(select 1 from public.aerosuite_institution_invitations i
  where i.institution_id=p_institution_id
    and lower(btrim(i.email))=lower(btrim(v_user.email))
    and v_user.created_at between i.created_at-interval '2 minutes' and i.created_at+interval '10 minutes'
 ) then return false; end if;
 -- Nunca borrar administradores, cuentas usadas en otra escuela o con perfil AeroSuite independiente.
 if exists(select 1 from public.site_admins x where x.user_id=p_user_id)
  or exists(select 1 from public.aerosuite_superadmins x where x.user_id=p_user_id)
  or exists(select 1 from public.aerosuite_institution_members m where m.user_id=p_user_id and m.institution_id<>p_institution_id)
  or exists(select 1 from public.aerosuite_institution_invitations i
       where lower(btrim(i.email))=lower(btrim(v_user.email)) and i.institution_id<>p_institution_id)
  or exists(select 1 from public.aerosuite_member_profiles mp where mp.user_id=p_user_id)
  or exists(select 1 from public.aerosuite_role_declarations rd where rd.user_id=p_user_id)
  or exists(select 1 from public.aerosuite_member_documents md where md.user_id=p_user_id)
 then return false; end if;
 -- Protección adicional: cualquier registro real que referencie Auth o el perfil GdV
 -- impide el borrado. No se limpian datos de terceros mediante cascada.
 for v_ref in
  select n.nspname as sch, t.relname as tbl, att.attname as col
  from pg_constraint fk
  join pg_class t on t.oid=fk.conrelid
  join pg_namespace n on n.oid=t.relnamespace
  join lateral unnest(fk.conkey) with ordinality keycols(attnum,ord) on true
  join pg_attribute att on att.attrelid=fk.conrelid and att.attnum=keycols.attnum
  where fk.contype='f' and fk.confrelid in ('auth.users'::regclass,'public.profiles'::regclass)
    and n.nspname in ('public','private','gdv_private')
    and not (n.nspname='public' and t.relname in
       ('aerosuite_institution_invitations','aerosuite_institution_members'))
  group by n.nspname,t.relname,att.attname
 loop
  execute format('select exists(select 1 from %I.%I where %I=$1)',v_ref.sch,v_ref.tbl,v_ref.col)
    into v_count using p_user_id;
  if v_count then return false; end if;
 end loop;
 -- Las relaciones de la institución se eliminan antes de borrar Auth.
 delete from public.aerosuite_institution_members where institution_id=p_institution_id and user_id=p_user_id;
 -- Si existe un registro activo o invitación de la misma escuela, la eliminación de Auth
 -- revoca sus vínculos de identidad, pero las invitaciones se borran por los flujos existentes.
 update public.aerosuite_institution_invitations
    set accepted_by=null, registered_by=null
    where institution_id=p_institution_id and (accepted_by=p_user_id or registered_by=p_user_id);
 delete from public.profiles where id=p_user_id;
 delete from auth.users where id=p_user_id;
 return true;
exception when foreign_key_violation then
 -- Un vínculo no contemplado protege automáticamente la identidad; la transacción interna revierte.
 return false;
end;
$fn$;
revoke all on function private.aerosuite_purge_isolated_test_identity(uuid,uuid) from public,anon,authenticated;
