-- Padrón institucional: nombres de perfil y correos visibles exclusivamente al Superadministrador.
-- Una persona puede tener varios vínculos, pero los registros se devuelven por institución y rol.
create or replace function public.aerosuite_superadmin_institution_roster()
returns table (
  institution_id uuid,
  user_id uuid,
  role text,
  profile_name text,
  email text,
  assigned_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.aerosuite_superadmins sa where sa.user_id=(select auth.uid())
  ) then
    raise exception 'Solo el Superadministrador de AeroSuite puede consultar los perfiles institucionales.'
      using errcode='42501';
  end if;

  return query
    select m.institution_id,
           m.user_id,
           m.role::text,
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
    order by m.institution_id,m.role,profile_name nulls last,u.email
    limit 20000;
end;
$function$;
revoke all on function public.aerosuite_superadmin_institution_roster() from public, anon;
grant execute on function public.aerosuite_superadmin_institution_roster() to authenticated;
