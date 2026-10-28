-- AeroSuite · habilitacion de Secretaria opcional (mismos datos/operaciones que Direccion).
-- Direccion conserva el control sobre alta y baja del rol Secretaria.
-- No se insertan, borran o actualizan datos de personas en esta migracion.
alter table public.aerosuite_institution_members drop constraint aerosuite_institution_members_role_check;
alter table public.aerosuite_institution_members add constraint aerosuite_institution_members_role_check
 check (role in ('administrador','secretaria','instructor','alumno','operaciones','tesoreria'));
alter table public.aerosuite_institution_invitations drop constraint aerosuite_institution_invitations_role_check;
alter table public.aerosuite_institution_invitations add constraint aerosuite_institution_invitations_role_check
 check (role in ('administrador','secretaria','instructor','alumno','operaciones','tesoreria'));
-- Actualizar aerosuite_accept_invitation_role
CREATE OR REPLACE FUNCTION public.aerosuite_accept_invitation_role(p_institution_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid := auth.uid();
 v_mail text;
 v_invitation public.aerosuite_institution_invitations%rowtype;
begin
 if v_user is null or p_institution_id is null or p_role not in ('administrador','secretaria','instructor','alumno') then
  raise exception 'Invitación incompleta o inválida.' using errcode='42501';
 end if;
 select lower(btrim(u.email)) into v_mail from auth.users u
 where u.id=v_user and u.email_confirmed_at is not null;
 if v_mail is null then
  raise exception 'Debés verificar tu correo antes de activar AeroSuite.' using errcode='42501';
 end if;
 select inv.* into v_invitation
 from public.aerosuite_institution_invitations inv
 join public.aerosuite_institutions org on org.id=inv.institution_id
 where inv.institution_id=p_institution_id and inv.role=p_role
   and lower(btrim(inv.email))=v_mail
   and inv.accepted_at is null and inv.revoked_at is null and inv.expires_at>now()
   and private.aerosuite_access_mode(org.status,org.trial_ends_at,org.license_ends_at,now())
       in ('trial','grace','active')
 order by inv.created_at desc limit 1 for update of inv;
 if v_invitation.id is null then
  raise exception 'No hay una invitación vigente para este correo, institución y rol. Comprobá que usaste el correo y enlace recibidos.' using errcode='42501';
 end if;
 insert into public.aerosuite_institution_members(institution_id,user_id,role,assigned_by)
 values(v_invitation.institution_id,v_user,v_invitation.role,v_invitation.created_by)
 on conflict (institution_id,user_id,role) do nothing;
 update public.aerosuite_institution_invitations
 set accepted_at=now(),accepted_by=v_user where id=v_invitation.id;
 return jsonb_build_object('ok',true,'institution_id',v_invitation.institution_id,'role',v_invitation.role);
end;
$function$
;

-- Actualizar aerosuite_director_people
CREATE OR REPLACE FUNCTION public.aerosuite_director_people(p_institution_id uuid)
 RETURNS TABLE(kind text, person_id uuid, email text, role text, situation text, registered_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid();
begin
 if v_user is null or p_institution_id is null then
  raise exception 'Iniciá sesión con una institución válida.' using errcode='42501';
 end if;
 if not exists(select 1 from public.aerosuite_superadmins sa where sa.user_id=v_user)
    and not exists(
      select 1 from public.aerosuite_institution_members manager
      where manager.institution_id=p_institution_id
        and manager.user_id=v_user and manager.role in ('administrador','secretaria')
    ) then
   raise exception 'Solo Dirección, Secretaría o Superadministración pueden consultar los integrantes.' using errcode='42501';
 end if;
 return query
 select 'integrante'::text,m.user_id,u.email::text,m.role,'activo'::text,m.assigned_at
 from public.aerosuite_institution_members m join auth.users u on u.id=m.user_id
 where m.institution_id=p_institution_id and m.role in ('secretaria','instructor','alumno')
 union all
 select 'invitacion'::text,inv.id,inv.email,inv.role,
   case when inv.expires_at<=now() then 'vencida'::text else 'pendiente'::text end,inv.created_at
 from public.aerosuite_institution_invitations inv
 where inv.institution_id=p_institution_id
  and inv.role in ('secretaria','instructor','alumno')
  and inv.accepted_at is null and inv.revoked_at is null
 order by 4,3,1
 limit 1000;
end;
$function$
;

-- Actualizar aerosuite_director_remove_person
CREATE OR REPLACE FUNCTION public.aerosuite_director_remove_person(p_institution_id uuid, p_person_id uuid, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_manager uuid:=auth.uid();
 v_role text; v_email text; v_changed integer; v_org record; v_mode text;
begin
 if v_manager is null or p_institution_id is null or p_person_id is null
  or p_kind not in ('integrante','invitacion') then
  raise exception 'Solicitud inválida.' using errcode='42501';
 end if;
 select org.status,org.trial_ends_at,org.license_ends_at
 into v_org from public.aerosuite_institutions org where org.id=p_institution_id;
 if not found then raise exception 'Institución no encontrada.' using errcode='42501'; end if;
 v_mode:=private.aerosuite_access_mode(v_org.status,v_org.trial_ends_at,v_org.license_ends_at,now());
 if v_mode not in ('trial','grace','active') then
  raise exception 'La institución está en modo consulta o suspendida; no permite modificaciones.' using errcode='42501';
 end if;
 if not exists (
  select 1 from public.aerosuite_institution_members m
  where m.institution_id=p_institution_id and m.user_id=v_manager and m.role in ('administrador','secretaria')
 ) then
  raise exception 'Solo Dirección o Secretaría pueden dar de baja instructores y alumnos.' using errcode='42501';
 end if;
 if p_kind='integrante' then
   select m.role,u.email into v_role,v_email
   from public.aerosuite_institution_members m
   join auth.users u on u.id=m.user_id
   where m.institution_id=p_institution_id and m.user_id=p_person_id
      and m.role in ('instructor','alumno')
   for update of m;
   if v_role is null then raise exception 'El instructor o alumno ya no pertenece a esta institución.' using errcode='42501'; end if;
   delete from public.aerosuite_institution_members m
   where m.institution_id=p_institution_id and m.user_id=p_person_id and m.role=v_role;
   get diagnostics v_changed=row_count;
   if v_changed<>1 then raise exception 'No se pudo desvincular el integrante.'; end if;
   update public.aerosuite_institution_invitations inv set revoked_at=now()
     where inv.institution_id=p_institution_id and inv.role=v_role
       and lower(btrim(inv.email))=lower(btrim(v_email)) and inv.revoked_at is null;
 else
   select inv.role,inv.email into v_role,v_email
   from public.aerosuite_institution_invitations inv
   where inv.id=p_person_id and inv.institution_id=p_institution_id
      and inv.role in ('instructor','alumno')
      and inv.accepted_at is null and inv.revoked_at is null
   for update;
   if v_role is null then raise exception 'La invitación ya fue aceptada, cancelada o no existe.' using errcode='42501'; end if;
   update public.aerosuite_institution_invitations inv set revoked_at=now()
   where inv.id=p_person_id and inv.institution_id=p_institution_id
      and inv.accepted_at is null and inv.revoked_at is null;
   get diagnostics v_changed=row_count;
   if v_changed<>1 then raise exception 'No se pudo cancelar la invitación.'; end if;
 end if;
 insert into public.aerosuite_institution_audit
 (institution_id,operation,changed_by,before_data,after_data)
 values(p_institution_id,case when p_kind='integrante' then 'MEMBER_UNLINK' else 'INVITATION_REVOKE' end,
 v_manager,jsonb_build_object('role',v_role,'email',v_email),
 jsonb_build_object('role',v_role,'email',v_email,'removed',true,'kind',p_kind));
 return jsonb_build_object('ok',true,'kind',p_kind,'role',v_role,'email',v_email);
end;
$function$
;

-- Actualizar aerosuite_manage_staff_remove
CREATE OR REPLACE FUNCTION public.aerosuite_manage_staff_remove(p_institution_id uuid, p_person_id uuid, p_kind text, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_super boolean;
 v_mode text; v_role text; v_email text; v_org record; v_changed int;
   v_candidate uuid; v_purged boolean:=false;
begin
 if v_actor is null or p_institution_id is null or p_person_id is null
  or p_kind not in ('integrante','invitacion') or p_role not in ('secretaria','instructor','alumno') then
  raise exception 'Solicitud de baja inválida.' using errcode='42501';
 end if;
 select exists(select 1 from public.aerosuite_superadmins sa where sa.user_id=v_actor) into v_super;
 if not v_super and not exists(
  select 1 from public.aerosuite_institution_members m
  where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria')
 ) then
  raise exception 'No podés dar de baja personal de otra institución.' using errcode='42501';
 end if;
 if p_role='secretaria' and not v_super and not exists(
  select 1 from public.aerosuite_institution_members m
  where m.institution_id=p_institution_id and m.user_id=v_actor and m.role='administrador'
 ) then
  raise exception 'Solo Dirección puede dar de baja el acceso de Secretaría.' using errcode='42501';
 end if;
 select org.status,org.trial_ends_at,org.license_ends_at into v_org
 from public.aerosuite_institutions org where org.id=p_institution_id;
 if not found then raise exception 'La institución no existe.' using errcode='42501'; end if;
 v_mode:=private.aerosuite_access_mode(v_org.status,v_org.trial_ends_at,v_org.license_ends_at,now());
 if not v_super and v_mode not in ('trial','grace','active') then
  raise exception 'En modo consulta o suspendida solo el Superadministrador puede realizar bajas de seguridad.' using errcode='42501';
 end if;
 if p_kind='integrante' then
  select m.role,u.email into v_role,v_email
  from public.aerosuite_institution_members m
  join auth.users u on u.id=m.user_id
  where m.institution_id=p_institution_id and m.user_id=p_person_id and m.role=p_role
  for update of m;
  if v_role is null then
   raise exception 'No existe este instructor o alumno en la institución indicada.' using errcode='42501';
  end if;
  delete from public.aerosuite_institution_members m
  where m.institution_id=p_institution_id and m.user_id=p_person_id and m.role=p_role;
  get diagnostics v_changed=row_count;
  if v_changed<>1 then raise exception 'No se pudo desvincular el rol solicitado.'; end if;
  update public.aerosuite_institution_invitations inv set revoked_at=now()
  where inv.institution_id=p_institution_id and inv.role=p_role and inv.revoked_at is null
  and lower(btrim(inv.email))=lower(btrim(v_email));
 else
  select inv.role,inv.email into v_role,v_email
  from public.aerosuite_institution_invitations inv
  where inv.id=p_person_id and inv.institution_id=p_institution_id
  and inv.role=p_role and inv.accepted_at is null and inv.revoked_at is null
  for update;
  if v_role is null then
   raise exception 'La invitación ya fue aceptada, revocada o no pertenece a esta escuela.' using errcode='42501';
  end if;
  update public.aerosuite_institution_invitations inv set revoked_at=now()
  where inv.id=p_person_id and inv.institution_id=p_institution_id
  and inv.role=p_role and inv.accepted_at is null and inv.revoked_at is null;
  get diagnostics v_changed=row_count;
  if v_changed<>1 then raise exception 'No se pudo cancelar la invitación.'; end if;
 end if;
 insert into public.aerosuite_institution_audit
 (institution_id,operation,changed_by,before_data,after_data)
 values(p_institution_id,
  case when p_kind='integrante' then 'MEMBER_UNLINK' else 'INVITATION_REVOKE' end,
  v_actor,
  jsonb_build_object('role',p_role,'email',v_email),
  jsonb_build_object('role',p_role,'email',v_email,'removed',true,
                     'kind',p_kind,'performed_by',case when v_super then 'superadmin' else 'director' end));
 if exists(select 1 from public.aerosuite_institutions org
       where org.id=p_institution_id and org.is_test) then
    select u.id into v_candidate from auth.users u
     where lower(btrim(u.email))=lower(btrim(v_email))
     order by u.created_at desc limit 1;
    if v_candidate is not null and v_candidate<>v_actor
      and not exists(select 1 from public.aerosuite_institution_members m
       where m.institution_id=p_institution_id and m.user_id=v_candidate)
      and not exists(select 1 from public.aerosuite_institution_invitations i
       where i.institution_id=p_institution_id and lower(btrim(i.email))=lower(btrim(v_email))
        and i.role<>p_role and i.accepted_at is null and i.revoked_at is null)
      then
      v_purged:=private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate);
      if v_purged then
       delete from public.aerosuite_institution_invitations x
         where x.institution_id=p_institution_id and lower(btrim(x.email))=lower(btrim(v_email))
         and x.role=p_role;
      end if;
    end if;
  end if;
  if exists(select 1 from public.aerosuite_institutions where id=p_institution_id and is_test) then
   delete from public.aerosuite_institution_invitations i
     where i.institution_id=p_institution_id and i.role=p_role
       and lower(btrim(i.email))=lower(btrim(v_email));
   delete from public.aerosuite_institution_audit a
     where a.institution_id=p_institution_id
       and (lower(btrim(a.before_data->>'email'))=lower(btrim(v_email))
         or lower(btrim(a.after_data->>'email'))=lower(btrim(v_email)));
  end if;
  return jsonb_build_object('ok',true,'role',p_role,'email',v_email,'kind',p_kind,
    'removed_test_account',v_purged);
end;
$function$
;

-- Actualizar aerosuite_my_institution_access_v2
CREATE OR REPLACE FUNCTION public.aerosuite_my_institution_access_v2()
 RETURNS TABLE(institution_id uuid, institution_name text, institution_kind text, plan text, license_status text, my_role text, expires_at timestamp with time zone, can_access boolean, can_write boolean, access_mode text, grace_ends_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select
 org.id,org.name,org.kind,
 case when m.role in ('administrador','secretaria') then org.plan else null::text end,
 case when m.role in ('administrador','secretaria') then org.status else null::text end,
 m.role,
 case when m.role in ('administrador','secretaria') then
   case when org.status='trial' then org.trial_ends_at else org.license_ends_at end
   else null::timestamptz end,
 ent.mode<>'blocked',
 ent.mode in ('trial','grace','active'),
 case when m.role in ('administrador','secretaria') then ent.mode
      when ent.mode in ('trial','grace','active') then 'active'
      else ent.mode end,
 case when m.role in ('administrador','secretaria') and org.status='trial'
      then org.trial_ends_at+interval '15 days'
      else null::timestamptz end
 from public.aerosuite_institution_members m
 join public.aerosuite_institutions org on org.id=m.institution_id
 cross join lateral (select private.aerosuite_access_mode(
   org.status,org.trial_ends_at,org.license_ends_at,now()
 ) as mode) ent
 where m.user_id=(select auth.uid())
 order by org.name,m.role;
$function$
;

-- Actualizar aerosuite_record_my_registration
CREATE OR REPLACE FUNCTION public.aerosuite_record_my_registration(p_institution_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select auth.uid()); v_email text; v_id uuid; v_registered timestamptz;
begin
 if v_user is null or p_institution_id is null
   or p_role not in ('administrador','secretaria','instructor','alumno','operaciones','tesoreria')
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
$function$
;
