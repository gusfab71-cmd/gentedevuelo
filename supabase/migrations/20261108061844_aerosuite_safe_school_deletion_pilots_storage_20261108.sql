-- Baja institucional segura: no borrar Laboratorio, ni dejar Storage huérfano.
-- Purgar verificaciones de pilotos de la misma institución dentro de la transacción,
-- preservando verificaciones de otros centros y otras identidades.
-- No borra archivos desde SQL, no elude permisos del Superadministrador.
CREATE OR REPLACE FUNCTION public.aerosuite_delete_institution(p_institution_id uuid, p_confirm_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_admin uuid := (select auth.uid());
 v_row public.aerosuite_institutions%rowtype;
 v_invites integer := 0;
 v_members integer := 0;
 v_pilot_authorizations integer := 0; v_purged integer := 0; v_kept integer := 0; v_candidate uuid;
begin
 if v_admin is null or not exists(
   select 1 from public.aerosuite_superadmins a where a.user_id=v_admin
 ) then
   raise exception 'Solo el Superadministrador puede eliminar instituciones.' using errcode='42501';
 end if;
 if p_institution_id is null or nullif(btrim(coalesce(p_confirm_name,'')),'') is null then
   raise exception 'Debés confirmar el nombre exacto de la institución.' using errcode='22023';
 end if;
 select * into v_row from public.aerosuite_institutions
   where id=p_institution_id for update;
 if not found then
   raise exception 'La institución ya no existe.' using errcode='P0002';
 end if;
 if p_confirm_name<>v_row.name then
   raise exception 'El nombre de confirmación no coincide con la institución.' using errcode='22023';
 end if;
 -- El Centro de Testeo Permanente es indeleble, aun para el Superadministrador.
 IF EXISTS(SELECT 1 FROM public.aerosuite_permanent_test_lab l
     WHERE l.institution_id=p_institution_id) THEN
    RAISE EXCEPTION 'No puede eliminarse el Laboratorio AeroSuite permanente.' USING errcode='42501';
 END IF;
 -- Storage no está vinculado por FK a instituciones. Impedir archivos huérfanos:
 -- primero deben eliminarse por Storage API con autorización y verificación.
 IF EXISTS(SELECT 1 FROM storage.objects obj
     WHERE obj.bucket_id='aerosuite-academia-institucional'
       AND (storage.foldername(obj.name))[1]=p_institution_id::text) THEN
    RAISE EXCEPTION 'Hay archivos institucionales. Realizá y verificá su eliminación autorizada desde Storage antes de eliminar la institución.' USING errcode='22023';
 END IF;
 select count(*) into v_invites from public.aerosuite_institution_invitations where institution_id=p_institution_id;
 select count(*) into v_members from public.aerosuite_institution_members where institution_id=p_institution_id;
 insert into private.aerosuite_institution_deletions(
 institution_id,institution_name,deleted_by,removed_invitations,removed_members)
 values(p_institution_id,v_row.name,v_admin,v_invites,v_members);
 if v_row.is_test then
    for v_candidate in
      select distinct u.id from auth.users u
      where exists(select 1 from public.aerosuite_institution_invitations inv
        where inv.institution_id=p_institution_id and lower(btrim(inv.email))=lower(btrim(u.email)))
        or exists(select 1 from public.aerosuite_institution_members m
         where m.institution_id=p_institution_id and m.user_id=u.id)
    loop
     if private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate)
        then v_purged:=v_purged+1; else v_kept:=v_kept+1; end if;
    end loop;
  end if;
  -- Las verificaciones del piloto tienen FK RESTRICT: limpiarlas dentro de la
 -- misma transacción, nunca antes de superar permisos, confirmación y control de archivos.
 DELETE FROM public.aerosuite_pilot_authorizations
 WHERE institution_id=p_institution_id;
 GET DIAGNOSTICS v_pilot_authorizations=ROW_COUNT;
 delete from public.aerosuite_institution_invitations where institution_id=p_institution_id;
 delete from public.aerosuite_institution_members where institution_id=p_institution_id;
 delete from public.aerosuite_institution_audit where institution_id=p_institution_id;
 delete from public.aerosuite_institutions where id=p_institution_id;
 if not found then raise exception 'No se pudo eliminar la institución.';end if;
 return jsonb_build_object('ok',true,'deleted_id',p_institution_id,
  'deleted_name',v_row.name,'removed_invitations',v_invites,'removed_members',v_members,
   'removed_test_accounts',v_purged,'protected_accounts',v_kept,
   'removed_pilot_authorizations',v_pilot_authorizations);
exception
 when foreign_key_violation then
  raise exception 'La institución tiene información adicional vinculada y no puede eliminarse automáticamente. Contactá soporte antes de continuar.'
    using errcode='23503';
end;
$function$;
