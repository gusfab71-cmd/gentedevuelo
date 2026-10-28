-- Lectura por institución bajo demanda: evita mezclar datos y cargar todos los usuarios de todas las escuelas.
drop function if exists public.aerosuite_superadmin_institution_roster();
create or replace function public.aerosuite_superadmin_institution_roster(p_institution_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_members jsonb;
begin
 if (select auth.uid()) is null or not exists(
  select 1 from public.aerosuite_superadmins sa where sa.user_id=(select auth.uid())
 ) then
  raise exception 'Solo el Superadministrador de AeroSuite puede consultar el padrón institucional.'
  using errcode='42501';
 end if;
 if p_institution_id is null or not exists(
  select 1 from public.aerosuite_institutions i where i.id=p_institution_id
 ) then
  raise exception 'Institución no encontrada.' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'user_id',r.user_id,
   'role',r.role,
   'profile_name',r.profile_name,
   'email',r.email,
   'assigned_at',r.assigned_at
 ) order by r.role,r.profile_name nulls last,r.email),'[]'::jsonb)
 into v_members
 from (
  select m.user_id,m.role,
   coalesce(
    nullif(btrim(concat_ws(' ',p.given_names,p.family_names)),''),
    nullif(btrim(g.full_name),''),
    case when g.username !~* '^piloto[_-][a-f0-9]{8,}$'
      then nullif(btrim(g.username),'') else null end
   )::text as profile_name,
   u.email::text,
   m.assigned_at
  from public.aerosuite_institution_members m
  join auth.users u on u.id=m.user_id and u.deleted_at is null
  left join public.aerosuite_member_profiles p on p.user_id=m.user_id
  left join public.profiles g on g.id=m.user_id
  where m.institution_id=p_institution_id
 ) r;
 return jsonb_build_object('institution_id',p_institution_id,'members',v_members);
end;
$function$;
revoke all on function public.aerosuite_superadmin_institution_roster(uuid) from public,anon;
grant execute on function public.aerosuite_superadmin_institution_roster(uuid) to authenticated;
