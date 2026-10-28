
-- Solo la cuenta de Superadministración puede consultar el padrón institucional.
-- La identidad de Auth se usa exclusivamente del lado del servidor, nunca en el cliente.
create or replace function public.aerosuite_superadmin_registrations()
returns table(
 institution_id uuid, institution_name text, role text, email text,
 kind text, person_id uuid, invitation_at timestamptz,
 account_created_at timestamptz, email_verified_at timestamptz,
 accepted_at timestamptz, last_sent_at timestamptz,
 expires_at timestamptz, revoked_at timestamptz, registration_status text
)
language plpgsql stable security definer set search_path to ''
as $function$
begin
 if (select auth.uid()) is null or not exists(
   select 1 from public.aerosuite_superadmins s where s.user_id=(select auth.uid())
 ) then
   raise exception 'Acceso exclusivo para Superadministrador AeroSuite.' using errcode='42501';
 end if;
 return query
 select i.institution_id, org.name::text, i.role::text, i.email::text,
   'invitacion'::text, i.id, i.created_at, u.created_at, u.email_confirmed_at,
   i.accepted_at, i.last_sent_at, i.expires_at, i.revoked_at,
   (case
    when i.revoked_at is not null then 'revocada'
    when i.accepted_at is not null and m.user_id is not null then 'habilitada'
    when i.accepted_at is not null then 'desvinculada'
    when i.expires_at <= now() then 'vencida'
    when u.id is not null and u.email_confirmed_at is not null then 'cuenta_verificada'
    when u.id is not null then 'cuenta_creada'
    when i.last_sent_at is not null then 'invitacion_enviada'
    else 'invitacion_creada'
   end)::text
 from public.aerosuite_institution_invitations i
 join public.aerosuite_institutions org on org.id=i.institution_id
 left join lateral (
   select a.id, a.created_at,a.email_confirmed_at
   from auth.users a
   where lower(btrim(a.email))=lower(btrim(i.email)) and a.deleted_at is null
   order by a.created_at desc limit 1
 ) u on true
 left join public.aerosuite_institution_members m
   on m.institution_id=i.institution_id and m.role=i.role and m.user_id=i.accepted_by
 union all
 select m.institution_id,org.name::text,m.role::text,u.email::text,
   'integrante'::text,m.user_id,m.assigned_at,u.created_at,u.email_confirmed_at,
   m.assigned_at,null::timestamptz,null::timestamptz,null::timestamptz,
   'habilitada'::text
 from public.aerosuite_institution_members m
 join public.aerosuite_institutions org on org.id=m.institution_id
 join auth.users u on u.id=m.user_id
 where u.deleted_at is null
   and not exists(
     select 1 from public.aerosuite_institution_invitations i
     where i.institution_id=m.institution_id and i.role=m.role
       and i.accepted_by=m.user_id and i.accepted_at is not null
   )
 order by 2,3,4,7 desc
 limit 5000;
end;
$function$;
revoke all on function public.aerosuite_superadmin_registrations() from public,anon;
grant execute on function public.aerosuite_superadmin_registrations() to authenticated;

-- Administrar únicamente la vinculación institucional, nunca eliminar auth.users.
create or replace function public.aerosuite_superadmin_manage_registration(
 p_institution_id uuid,p_person_id uuid,p_kind text,p_role text
)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_actor uuid:=(select auth.uid()); v_mail text; v_changed integer;
begin
 if v_actor is null or not exists(select 1 from public.aerosuite_superadmins s where s.user_id=v_actor)
 then raise exception 'Acceso exclusivo para Superadministrador AeroSuite.' using errcode='42501'; end if;
 if p_institution_id is null or p_person_id is null
    or p_role not in ('administrador','instructor','alumno','operaciones','tesoreria')
    or p_kind not in ('integrante','invitacion') then
   raise exception 'Datos de registro inválidos.' using errcode='22023';
 end if;
 if p_kind='invitacion' then
   select i.email into v_mail from public.aerosuite_institution_invitations i
   where i.id=p_person_id and i.institution_id=p_institution_id
     and i.role=p_role and i.accepted_at is null and i.revoked_at is null
   for update;
   if v_mail is null then raise exception 'La invitación ya no está pendiente.' using errcode='22023'; end if;
   update public.aerosuite_institution_invitations i set revoked_at=now()
     where i.id=p_person_id and i.accepted_at is null and i.revoked_at is null;
   get diagnostics v_changed=row_count;
 else
   if p_person_id=v_actor then
     raise exception 'No podés desvincular tu propio acceso desde este panel.' using errcode='42501';
   end if;
   select u.email into v_mail from public.aerosuite_institution_members m
   join auth.users u on u.id=m.user_id
   where m.user_id=p_person_id and m.institution_id=p_institution_id and m.role=p_role
   for update of m;
   if v_mail is null then raise exception 'La cuenta ya no está vinculada.' using errcode='22023'; end if;
   delete from public.aerosuite_institution_members m where m.user_id=p_person_id
     and m.institution_id=p_institution_id and m.role=p_role;
   get diagnostics v_changed=row_count;
   update public.aerosuite_institution_invitations i set revoked_at=now()
     where i.institution_id=p_institution_id and i.role=p_role
       and lower(btrim(i.email))=lower(btrim(v_mail)) and i.revoked_at is null;
 end if;
 if v_changed<>1 then raise exception 'No se pudo confirmar el cambio.'; end if;
 insert into public.aerosuite_institution_audit
  (institution_id,operation,changed_by,before_data,after_data)
 values(p_institution_id,case when p_kind='integrante' then 'MEMBER_UNLINK' else 'INVITATION_REVOKE' end,
   v_actor,jsonb_build_object('role',p_role,'email',v_mail),
   jsonb_build_object('role',p_role,'email',v_mail,'kind',p_kind,'removed',true,'performed_by','superadmin'));
 return jsonb_build_object('ok',true,'kind',p_kind,'role',p_role);
end;
$function$;
revoke all on function public.aerosuite_superadmin_manage_registration(uuid,uuid,text,text) from public,anon;
grant execute on function public.aerosuite_superadmin_manage_registration(uuid,uuid,text,text) to authenticated;
