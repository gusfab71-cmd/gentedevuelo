-- Additional null-license permission hardening for reads and writes.
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_institution_maintenance_get(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_mode text;v_record public.aerosuite_institution_maintenance%rowtype;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_role,v_mode from public.aerosuite_institutions i
 join public.aerosuite_institution_members m on m.institution_id=i.id
 where i.id=p_institution_id and m.user_id=auth.uid()
 and m.role in('administrador','secretaria','instructor');
 if auth.uid() is null or v_role is null or (v_mode is null or v_mode='blocked') then
  raise exception 'Sin acceso al mantenimiento institucional.' using errcode='42501';
 end if;
 select * into v_record from public.aerosuite_institution_maintenance
 where institution_id=p_institution_id;
 if not found then
  return jsonb_build_object('payload',null,'revision',0,'updated_at',null,
   'can_write',v_role in('administrador','secretaria') and v_mode in('trial','grace','active'));
 end if;
 return jsonb_build_object('payload',v_record.payload,'revision',v_record.revision,
  'updated_at',v_record.updated_at,'can_write',
  v_role in('administrador','secretaria') and v_mode in('trial','grace','active'));
end $function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_institution_maintenance_save(p_institution_id uuid, p_payload jsonb, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_mode text;v_revision bigint;v_new bigint;v_count int;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_role,v_mode from public.aerosuite_institutions i
 join public.aerosuite_institution_members m on m.institution_id=i.id
 where i.id=p_institution_id and m.user_id=auth.uid()
 and m.role in('administrador','secretaria');
 if auth.uid() is null or v_role is null or (v_mode is null or v_mode not in('trial','grace','active')) then
  raise exception 'Solo Dirección/Secretaría con licencia activa puede guardar mantenimiento.' using errcode='42501';
 end if;
 if p_expected_revision is null or p_expected_revision<0 or jsonb_typeof(p_payload)<>'object'
 or octet_length(p_payload::text)>5000000 then
  raise exception 'Datos de mantenimiento inválidos o demasiado extensos.' using errcode='22023';
 end if;
 if not (p_payload ? 'ac') or jsonb_typeof(p_payload->'ac')<>'array'
 or jsonb_array_length(p_payload->'ac')>50 then
  raise exception 'La nómina del módulo de mantenimiento no es válida.' using errcode='22023';
 end if;
 if exists(
  select 1 from jsonb_array_elements(p_payload->'ac') a
  where not exists(
   select 1 from public.aerosuite_aircraft_registry f
   where f.institution_id=p_institution_id
   and upper(btrim(f.registration))=upper(btrim(a->>'reg'))
  )
 ) then
  raise exception 'Todas las matrículas de mantenimiento deben existir en la flota institucional.' using errcode='22023';
 end if;
 -- Instalar una fila sin datos si aún no existía. FOR UPDATE serializa escritores.
 insert into public.aerosuite_institution_maintenance(institution_id)
 values(p_institution_id) on conflict(institution_id) do nothing;
 select revision into v_revision from public.aerosuite_institution_maintenance
 where institution_id=p_institution_id for update;
 if v_revision<>p_expected_revision then
  raise exception 'Los datos de mantenimiento cambiaron en otra sesión. Recargá antes de guardar.' using errcode='40001';
 end if;
 v_new:=v_revision+1;
 update public.aerosuite_institution_maintenance
 set payload=p_payload,revision=v_new,updated_by=auth.uid(),updated_at=now()
 where institution_id=p_institution_id;
 insert into public.aerosuite_institution_maintenance_audit(institution_id,from_revision,to_revision,actor_id)
 values(p_institution_id,v_revision,v_new,auth.uid());
 return jsonb_build_object('ok',true,'revision',v_new,'saved_at',now());
end $function$
;
