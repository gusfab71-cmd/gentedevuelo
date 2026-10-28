
alter table public.aerosuite_institution_invitations
 add column if not exists registered_at timestamptz,
 add column if not exists registered_by uuid references auth.users(id) on delete set null;
comment on column public.aerosuite_institution_invitations.registered_at is
 'Momento real en que el invitado, ya autenticado y con correo verificado, accedió al flujo de alta de AeroSuite. No equivale a un usuario técnico creado por magiclink.';
create or replace function public.aerosuite_record_my_registration(p_institution_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid()); v_email text; v_id uuid; v_registered timestamptz;
begin
 if v_user is null or p_institution_id is null
   or p_role not in ('administrador','instructor','alumno','operaciones','tesoreria')
 then raise exception 'Datos de registro inválidos.' using errcode='42501'; end if;
 select lower(btrim(u.email)) into v_email from auth.users u
 where u.id=v_user and u.email_confirmed_at is not null and u.deleted_at is null;
 if v_email is null then raise exception 'Debés verificar tu correo antes de registrarte.' using errcode='42501'; end if;
 select i.id into v_id from public.aerosuite_institution_invitations i
 where i.institution_id=p_institution_id and i.role=p_role
   and lower(btrim(i.email))=v_email and i.revoked_at is null
   and (i.accepted_at is null or i.accepted_by=v_user)
 order by i.created_at desc limit 1 for update;
 if v_id is null then
   -- También se admite una vinculación ya realizada por la institución, sin invitación histórica.
   if exists(select 1 from public.aerosuite_institution_members m
    where m.institution_id=p_institution_id and m.user_id=v_user and m.role=p_role) then
     return jsonb_build_object('ok',true,'existing_membership',true);
   end if;
   raise exception 'No existe una invitación para este correo y rol.' using errcode='42501';
 end if;
 update public.aerosuite_institution_invitations i
 set registered_at=coalesce(i.registered_at,now()),registered_by=v_user
 where i.id=v_id returning registered_at into v_registered;
 return jsonb_build_object('ok',true,'registered_at',v_registered);
end;
$function$;
revoke all on function public.aerosuite_record_my_registration(uuid,text) from public,anon;
grant execute on function public.aerosuite_record_my_registration(uuid,text) to authenticated;

do $$
declare v_def text;
begin
 select pg_get_functiondef('public.aerosuite_superadmin_registrations()'::regprocedure) into v_def;
 if position('i.created_at, u.created_at, u.email_confirmed_at,' in v_def)=0
 or position('when u.id is not null and u.email_confirmed_at is not null' in v_def)=0
 then raise exception 'La vista de registros tiene estructura inesperada'; end if;
 v_def:=replace(v_def,
  'i.created_at, u.created_at, u.email_confirmed_at,',
  'i.created_at, coalesce(i.registered_at,i.accepted_at), case when coalesce(i.registered_at,i.accepted_at) is not null then u.email_confirmed_at else null end,');
 v_def:=replace(v_def,
  'when u.id is not null and u.email_confirmed_at is not null',
  'when i.registered_at is not null and u.email_confirmed_at is not null');
 v_def:=replace(v_def,'when u.id is not null then ''cuenta_creada''',
   'when i.registered_at is not null then ''cuenta_creada''');
 execute v_def;
end $$;
