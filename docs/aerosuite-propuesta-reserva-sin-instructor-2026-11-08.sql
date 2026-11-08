-- PROPUESTA DE HARDENING. NO APLICADA A SUPABASE NI A PRODUCCIÓN.
-- Hallazgo: el wrapper comparaba la licencia de p_student_id mientras que
-- el endpoint delegado reserva a auth.uid() cuando el actor es Alumno/Piloto.
-- Riesgo observado por análisis estático: solicitudes pendientes sin instructor
-- de alumno no verificado, si suministra el UUID de un piloto verificado.
-- La confirmación final revalida la licencia del titular y sigue bloqueando.
-- Aplicar solo tras validar en base aislada y aprobar una migración oficial.
-- SQL obtenido de la definición efectiva, conservando contrato y funcionalidad.
-- La revisión se limita a seleccionar el titular efectivo y a denegar rol Alumno.
-- No alterar datos ni crear cuentas reales durante las pruebas.

CREATE OR REPLACE FUNCTION public.aerosuite_reserve_with_instructor(p_institution_id uuid, p_slot_id uuid, p_student_id uuid, p_with_instructor boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_role text;v_subject uuid;
 v_slot public.aerosuite_availability_slots%rowtype;
 v_result jsonb;v_booking_id uuid;
begin
 if v_actor is null or p_with_instructor is null then
  raise exception 'Sesión y modalidad de vuelo requeridas.' using errcode='42501';end if;
 select * into v_slot from public.aerosuite_availability_slots s
 where s.id=p_slot_id and s.institution_id=p_institution_id and s.retired_at is null;
 if not found then raise exception 'Horario no encontrado o retirado.' using errcode='22023';end if;
 if v_slot.activity<>'flight' and p_with_instructor=false then
  raise exception 'La opción sin instructor solo corresponde a vuelos prácticos.' using errcode='22023';end if;
 if v_slot.activity='flight' and not p_with_instructor then
  -- La identidad cuya licencia se valida debe coincidir exactamente con
  -- la persona que aerosuite_availability_reserve termina reservando.
  select m.role into v_role from public.aerosuite_institution_members m
   where m.institution_id=p_institution_id and m.user_id=v_actor
   and m.role in('administrador','secretaria','alumno','piloto') limit 1;
  if v_role not in ('administrador','secretaria','piloto') or v_role is null then
   raise exception 'Solo un piloto verificado, o Dirección y Secretaría por ese piloto, pueden solicitar vuelos sin instructor.' using errcode='42501';
  end if;
  v_subject:=case when v_role in('administrador','secretaria') then p_student_id else v_actor end;
  if v_subject is null then
   raise exception 'Seleccioná un piloto verificado de esta institución.' using errcode='42501';
  end if;
  if not exists(select 1 from public.aerosuite_pilot_authorizations pa
   join public.aerosuite_role_declarations d on d.user_id=pa.user_id and d.role='pilot'
   join public.aerosuite_institution_members mm on mm.institution_id=pa.institution_id and mm.user_id=pa.user_id and mm.role='piloto'
   where pa.institution_id=p_institution_id
   and pa.user_id=v_subject and pa.status='verified'
   and upper(coalesce(d.license_type,'')) ~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)')
  then raise exception 'Solo un Piloto PPA verificado por esta escuela puede reservar sin instructor. Completá tu ficha y solicitá la validación de Secretaría.' using errcode='42501';end if;
 end if;
 v_result:=public.aerosuite_availability_reserve(p_institution_id,p_slot_id,p_student_id);
 v_booking_id:=nullif(v_result->>'booking_id','')::uuid;
 if v_slot.activity='flight' then
  if v_booking_id is null then raise exception 'No se creó el vuelo.' using errcode='22023';end if;
  update public.aerosuite_flight_bookings set with_instructor=p_with_instructor,
   updated_at=now(),updated_by=v_actor where id=v_booking_id and institution_id=p_institution_id;
  insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,after_data)
  values(p_institution_id,v_booking_id,v_actor,'instructor_mode_selected',
   jsonb_build_object('with_instructor',p_with_instructor,'requires_school_authorization',not p_with_instructor));
 end if;
 return v_result||jsonb_build_object('with_instructor',p_with_instructor,
  'requires_school_authorization',v_slot.activity='flight' and not p_with_instructor);
end $function$

-- Mantener principio de privilegio mínimo al implementar la migración.
REVOKE ALL ON FUNCTION public.aerosuite_reserve_with_instructor(uuid,uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aerosuite_reserve_with_instructor(uuid,uuid,uuid,boolean) TO authenticated;
