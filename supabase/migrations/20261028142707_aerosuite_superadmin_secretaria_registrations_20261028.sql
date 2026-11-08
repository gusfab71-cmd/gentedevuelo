-- Superadministración debe poder revocar invitados y miembros de Secretaría.
CREATE OR REPLACE FUNCTION public.aerosuite_superadmin_manage_registration(p_institution_id uuid, p_person_id uuid, p_kind text, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=(select auth.uid()); v_mail text; v_changed integer;
   v_candidate uuid; v_purged boolean:=false;
begin
 if v_actor is null or not exists(select 1 from public.aerosuite_superadmins s where s.user_id=v_actor)
 then raise exception 'Acceso exclusivo para Superadministrador AeroSuite.' using errcode='42501'; end if;
 if p_institution_id is null or p_person_id is null
    or p_role not in ('administrador','secretaria','instructor','alumno','operaciones','tesoreria')
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
 if exists(select 1 from public.aerosuite_institutions org
       where org.id=p_institution_id and org.is_test) then
    select u.id into v_candidate from auth.users u
     where lower(btrim(u.email))=lower(btrim(v_mail))
     order by u.created_at desc limit 1;
    if v_candidate is not null and v_candidate<>v_actor
      and not exists(select 1 from public.aerosuite_institution_members m
       where m.institution_id=p_institution_id and m.user_id=v_candidate)
      and not exists(select 1 from public.aerosuite_institution_invitations i
       where i.institution_id=p_institution_id and lower(btrim(i.email))=lower(btrim(v_mail))
         and i.role<>p_role and i.accepted_at is null and i.revoked_at is null)
    then
      v_purged:=private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate);
      if v_purged then
       delete from public.aerosuite_institution_invitations x
         where x.institution_id=p_institution_id and lower(btrim(x.email))=lower(btrim(v_mail))
         and x.role=p_role;
      end if;
    end if;
  end if;
  if exists(select 1 from public.aerosuite_institutions where id=p_institution_id and is_test) then
    delete from public.aerosuite_institution_invitations i
      where i.institution_id=p_institution_id and i.role=p_role
       and lower(btrim(i.email))=lower(btrim(v_mail));
    delete from public.aerosuite_institution_audit a
      where a.institution_id=p_institution_id
       and (lower(btrim(a.before_data->>'email'))=lower(btrim(v_mail))
         or lower(btrim(a.after_data->>'email'))=lower(btrim(v_mail)));
  end if;
  return jsonb_build_object('ok',true,'kind',p_kind,'role',p_role,
   'removed_test_account',v_purged);
end;
$function$
;
