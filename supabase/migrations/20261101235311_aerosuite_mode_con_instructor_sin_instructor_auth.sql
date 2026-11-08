CREATE OR REPLACE FUNCTION public.aerosuite_booking_action(p_institution_id uuid, p_action text, p_booking_id uuid DEFAULT NULL::uuid, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_student_id uuid DEFAULT NULL::uuid, p_instructor_id uuid DEFAULT NULL::uuid, p_aircraft text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_role text;v_mode text;v_booking public.aerosuite_flight_bookings%rowtype;v_id uuid;v_student uuid;v_instructor uuid;v_before jsonb;v_report public.aerosuite_flight_reports%rowtype;v_report_voided boolean:=false;
begin
 select m.role,private.aerosuite_access_mode(org.status,org.trial_ends_at,org.license_ends_at,now())
 into v_role,v_mode from public.aerosuite_institution_members m
 join public.aerosuite_institutions org on org.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in ('administrador','secretaria','instructor','alumno') limit 1;
 if v_actor is null or v_role is null then raise exception 'No autorizado para esta institución.' using errcode='42501';end if;
 if v_mode not in ('trial','grace','active') then raise exception 'La institución está en modo consulta.' using errcode='42501';end if;
 if p_action not in ('request','confirm','assign_aircraft','cancel','finish') then raise exception 'Acción inválida.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 if p_action='request' then
   raise exception 'Las reservas deben seleccionarse entre los horarios publicados por la escuela.' using errcode='42501';
   if p_starts_at is null or p_starts_at < now()-interval '30 minutes' or p_starts_at>now()+interval '90 days'
   then raise exception 'Elegí un turno futuro dentro de los próximos 90 días.' using errcode='22023';end if;
   v_student:=case when v_role in ('administrador','secretaria') then coalesce(p_student_id,v_actor) else v_actor end;
   if not exists(select 1 from public.aerosuite_institution_members m where m.institution_id=p_institution_id and m.user_id=v_student and m.role='alumno')
   then raise exception 'El alumno no está registrado en esta institución.' using errcode='42501';end if;
   if exists(select 1 from public.aerosuite_flight_bookings b where b.institution_id=p_institution_id and b.status<>'cancelled' and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') && tstzrange(p_starts_at,p_starts_at+interval '90 minutes','[)'))
   then raise exception 'El horario ya tiene una reserva. Elegí otro turno.' using errcode='23505';end if;
   insert into public.aerosuite_flight_bookings(institution_id,student_id,starts_at,created_by,updated_by)
   values(p_institution_id,v_student,p_starts_at,v_actor,v_actor) returning id into v_id;
   insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,after_data) values(p_institution_id,v_id,v_actor,'requested',jsonb_build_object('student_id',v_student,'starts_at',p_starts_at));
 else
   select * into v_booking from public.aerosuite_flight_bookings where id=p_booking_id and institution_id=p_institution_id for update;
   if not found then raise exception 'No existe esa reserva en tu institución.' using errcode='P0002';end if;
   v_before:=to_jsonb(v_booking); v_id:=v_booking.id;
   if p_action='confirm' then
     if v_booking.status<>'pending' or v_role not in ('administrador','secretaria','instructor') then raise exception 'No podés confirmar esta reserva.' using errcode='42501';end if;
     if not v_booking.with_instructor then
      raise exception 'Esta solicitud es sin instructor a bordo. Solo Secretaría o Dirección pueden autorizarla después de verificar la habilitación y registrar la referencia documental.' using errcode='42501';
     end if;
     IF v_role='instructor' AND v_booking.instructor_id IS NOT NULL
        AND v_booking.instructor_id<>v_actor THEN
       RAISE EXCEPTION 'Este turno ya está preasignado a otro Instructor.' USING errcode='42501';
     END IF;
     v_instructor:=case when v_role='instructor' then v_actor else p_instructor_id end;
     if v_instructor is null or not exists(select 1 from public.aerosuite_institution_members m where m.institution_id=p_institution_id and m.user_id=v_instructor and m.role='instructor')
     then raise exception 'Seleccioná un instructor habilitado en esta escuela.' using errcode='22023';end if;
     -- El instructor puede trabajar en varias instituciones, pero no puede tener
     -- dos vuelos superpuestos. Serializar confirmaciones concurrentes entre escuelas.
     perform pg_advisory_xact_lock(hashtextextended('aerosuite_instructor_' || v_instructor::text,0));
     if exists(select 1 from public.aerosuite_flight_bookings b where b.id<>v_booking.id
       and b.instructor_id=v_instructor and b.status in ('confirmed','completed')
       and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') && tstzrange(v_booking.starts_at,v_booking.starts_at+interval '90 minutes','[)'))
     then raise exception 'El instructor ya tiene un turno confirmado en ese horario.' using errcode='23505';end if;
     if v_role in ('administrador','secretaria') and nullif(btrim(coalesce(p_aircraft,'')),'') is not null
       and exists(select 1 from public.aerosuite_aircraft_registry a where a.institution_id=p_institution_id)
       and not exists(select 1 from public.aerosuite_aircraft_registry a where a.institution_id=p_institution_id
            and a.registration=upper(btrim(p_aircraft)) and a.availability='available')
     then raise exception 'La aeronave no figura disponible en la flota de esta escuela.' using errcode='22023';end if;
     if nullif(btrim(coalesce(p_aircraft,'')),'') is not null and exists(
      select 1 from public.aerosuite_flight_bookings other_booking
      where other_booking.institution_id=p_institution_id
        and other_booking.id<>v_booking.id
        and other_booking.status in('pending','confirmed','completed')
        and upper(btrim(coalesce(other_booking.aircraft,'')))=upper(btrim(p_aircraft))
        and tstzrange(other_booking.starts_at,other_booking.starts_at+interval '90 minutes','[)') &&
            tstzrange(v_booking.starts_at,v_booking.starts_at+interval '90 minutes','[)')
     ) then
      raise exception 'La aeronave ya está asignada a otro turno superpuesto.' using errcode='23505';
     end if;
     update public.aerosuite_flight_bookings set status='confirmed',instructor_id=v_instructor,
       aircraft=case when v_role in ('administrador','secretaria') then left(btrim(coalesce(p_aircraft,'')),60) else aircraft end,
       updated_by=v_actor,updated_at=now() where id=v_id;
   elsif p_action='assign_aircraft' then
     if v_role not in ('administrador','secretaria') or v_booking.status<>'confirmed'
     then raise exception 'Solo Administración puede asignar aeronaves a vuelos confirmados.' using errcode='42501';end if;
     if nullif(btrim(coalesce(p_aircraft,'')),'') is not null
       and exists(select 1 from public.aerosuite_aircraft_registry a where a.institution_id=p_institution_id)
       and not exists(select 1 from public.aerosuite_aircraft_registry a where a.institution_id=p_institution_id
         and a.registration=upper(btrim(p_aircraft)) and a.availability='available')
     then raise exception 'La aeronave no figura disponible en la flota de esta escuela.' using errcode='22023';end if;
     if nullif(btrim(coalesce(p_aircraft,'')),'') is not null and exists(
      select 1 from public.aerosuite_flight_bookings other_booking
      where other_booking.institution_id=p_institution_id
        and other_booking.id<>v_booking.id
        and other_booking.status in('pending','confirmed','completed')
        and upper(btrim(coalesce(other_booking.aircraft,'')))=upper(btrim(p_aircraft))
        and tstzrange(other_booking.starts_at,other_booking.starts_at+interval '90 minutes','[)') &&
            tstzrange(v_booking.starts_at,v_booking.starts_at+interval '90 minutes','[)')
     ) then
      raise exception 'La aeronave ya está asignada a otro turno superpuesto.' using errcode='23505';
     end if;
     update public.aerosuite_flight_bookings set aircraft=upper(left(btrim(coalesce(p_aircraft,'')),60)),
       updated_by=v_actor,updated_at=now() where id=v_id;
   elsif p_action='cancel' then
     if v_booking.status not in ('pending','confirmed') or v_role not in ('administrador','secretaria')
     then raise exception 'No podés cancelar esta reserva.' using errcode='42501';end if;
     if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Indicá el motivo de cancelación.' using errcode='22023';end if;
     if v_booking.starts_at<=now() then
       raise exception 'El horario ya comenzó o pasó. No se puede cancelar desde la turnera; requiere revisión administrativa.' using errcode='22023';
     end if;
     -- Una reserva con informe debe revisarse, no cancelarse desde la turnera.
     if exists(select 1 from public.aerosuite_flight_reports r
               where r.booking_id=v_booking.id and r.institution_id=p_institution_id) then
       raise exception 'Esta reserva tiene un informe de instrucción. No se puede cancelar desde la turnera; resolvé la revisión con Dirección o Secretaría.' using errcode='22023';
     end if;
     update public.aerosuite_flight_bookings set status='cancelled',cancellation_reason=left(btrim(p_reason),250),updated_by=v_actor,updated_at=now() where id=v_id;
   else
     if not exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=v_booking.id and r.status='approved') then raise exception 'No se puede cerrar un vuelo sin informe de instrucción validado.' using errcode='22023';end if;
     if v_role not in ('administrador','secretaria') or v_booking.status<>'confirmed' then raise exception 'Solo Administración puede cerrar vuelos confirmados.' using errcode='42501';end if;
     update public.aerosuite_flight_bookings set status='completed',updated_by=v_actor,updated_at=now() where id=v_id;
   end if;
   insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,before_data,after_data)
    select p_institution_id,v_id,v_actor,p_action,v_before,to_jsonb(b)||
      case when v_report_voided then jsonb_build_object('report_voided',true,'report_id',v_report.id,'report_previous_status',v_report.status) else '{}'::jsonb end
    from public.aerosuite_flight_bookings b where b.id=v_id;
 end if;
 return jsonb_build_object('ok',true,'booking_id',v_id,'action',p_action,'report_voided',v_report_voided);
end;$function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_preassign_pending_instructor(p_institution_id uuid, p_booking_id uuid, p_instructor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=auth.uid();v_role text;v_mode text;
v_booking public.aerosuite_flight_bookings%rowtype;v_before jsonb;
BEGIN
 IF v_actor IS NULL OR p_instructor_id IS NULL THEN
  RAISE EXCEPTION 'Se requiere una sesión y un Instructor seleccionado.' USING errcode='42501';
 END IF;
 SELECT m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 INTO v_role,v_mode FROM public.aerosuite_institution_members m
 JOIN public.aerosuite_institutions i ON i.id=m.institution_id
 WHERE m.institution_id=p_institution_id AND m.user_id=v_actor
 AND m.role IN ('administrador','secretaria') LIMIT 1;
 IF v_role IS NULL OR v_mode NOT IN ('active','trial','grace') THEN
  RAISE EXCEPTION 'Solo Dirección y Secretaría habilitadas pueden asignar Instructor.' USING errcode='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.aerosuite_institution_members m
  WHERE m.institution_id=p_institution_id AND m.user_id=p_instructor_id AND m.role='instructor')
 THEN RAISE EXCEPTION 'El Instructor no pertenece a esta institución.' USING errcode='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 SELECT * INTO v_booking FROM public.aerosuite_flight_bookings
 WHERE id=p_booking_id AND institution_id=p_institution_id FOR UPDATE;
 IF NOT FOUND OR v_booking.status<>'pending' OR v_booking.starts_at<=now() OR NOT v_booking.with_instructor THEN
  RAISE EXCEPTION 'Solo pueden asignarse Instructores a turnos futuros pendientes.' USING errcode='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('aerosuite_instructor_' || p_instructor_id::text,0));
 IF EXISTS (SELECT 1 FROM public.aerosuite_flight_bookings b
  WHERE b.id<>v_booking.id AND b.instructor_id=p_instructor_id AND b.status IN ('confirmed','completed')
  AND tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)')
    && tstzrange(v_booking.starts_at,v_booking.starts_at+interval '90 minutes','[)')
 ) THEN
  RAISE EXCEPTION 'El Instructor ya tiene un turno confirmado en ese horario.' USING errcode='23505';
 END IF;
 IF v_booking.instructor_id=p_instructor_id THEN
  RETURN jsonb_build_object('ok',true,'changed',false,'booking_id',v_booking.id);
 END IF;
 v_before:=to_jsonb(v_booking);
 UPDATE public.aerosuite_flight_bookings
 SET instructor_id=p_instructor_id,updated_by=v_actor,updated_at=now() WHERE id=v_booking.id;
 INSERT INTO public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,before_data,after_data)
 SELECT p_institution_id,v_booking.id,v_actor,'instructor_preassigned',v_before,
   to_jsonb(b)||jsonb_build_object('pending_instructor_confirmation',true)
 FROM public.aerosuite_flight_bookings b WHERE b.id=v_booking.id;
 RETURN jsonb_build_object('ok',true,'changed',true,'booking_id',v_booking.id,'new_status','pending');
END $function$
;


create or replace function public.aerosuite_reserve_with_instructor(
 p_institution_id uuid,p_slot_id uuid,p_student_id uuid,p_with_instructor boolean
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid();v_slot public.aerosuite_availability_slots%rowtype;
 v_result jsonb;v_booking_id uuid;
begin
 if v_actor is null or p_with_instructor is null then
  raise exception 'Sesión y modalidad de vuelo requeridas.' using errcode='42501';end if;
 select * into v_slot from public.aerosuite_availability_slots s
 where s.id=p_slot_id and s.institution_id=p_institution_id and s.retired_at is null;
 if not found then raise exception 'Horario no encontrado o retirado.' using errcode='22023';end if;
 if v_slot.activity<>'flight' and p_with_instructor=false then
  raise exception 'La opción sin instructor solo corresponde a vuelos prácticos.' using errcode='22023';end if;
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
end $fn$;
revoke all on function public.aerosuite_reserve_with_instructor(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.aerosuite_reserve_with_instructor(uuid,uuid,uuid,boolean) to authenticated;

create or replace function public.aerosuite_confirm_without_instructor(
 p_institution_id uuid,p_booking_id uuid,p_authorization_reference text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid();v_mode text;
 v_booking public.aerosuite_flight_bookings%rowtype;
 v_slot public.aerosuite_availability_slots%rowtype;
 v_ref text:=btrim(coalesce(p_authorization_reference,''));
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección o Secretaría pueden autorizar vuelos sin instructor.' using errcode='42501';end if;
 if length(v_ref) not between 8 and 250 then
  raise exception 'Indicá una referencia verificable de autorización (8 a 250 caracteres).' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_booking from public.aerosuite_flight_bookings
 where id=p_booking_id and institution_id=p_institution_id for update;
 if not found or v_booking.with_instructor or v_booking.status<>'pending' or v_booking.starts_at<=now()
 then raise exception 'Solo se pueden autorizar solicitudes futuras pendientes sin instructor.' using errcode='22023';end if;
 if exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=v_booking.id)
 or exists(select 1 from public.aerosuite_flight_checkouts c where c.booking_id=v_booking.id)
 then raise exception 'El vuelo ya tiene informe o movimiento de caja.' using errcode='22023';end if;
 select s.* into v_slot from public.aerosuite_activity_reservations r
 join public.aerosuite_availability_slots s on s.id=r.slot_id
 where r.institution_id=p_institution_id and r.booking_id=v_booking.id and r.status='pending'
 and s.activity='flight' and s.published_at is not null and s.retired_at is null
 for update of s;
 if not found then raise exception 'No hay horario de vuelo publicado para esta reserva.' using errcode='22023';end if;
 if not exists(select 1 from public.aerosuite_aircraft_registry a
 where a.institution_id=p_institution_id and a.registration=upper(v_slot.resource_label)
 and a.availability='available' and a.archived_at is null)
 then raise exception 'La aeronave seleccionada no está disponible.' using errcode='22023';end if;
 if exists(select 1 from public.aerosuite_flight_bookings b
 where b.institution_id=p_institution_id and b.id<>v_booking.id
 and b.status in('pending','confirmed','completed')
 and upper(coalesce(b.aircraft,''))=upper(v_slot.resource_label)
 and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
     tstzrange(v_booking.starts_at,v_booking.starts_at+interval '90 minutes','[)'))
 then raise exception 'La aeronave tiene otra reserva superpuesta.' using errcode='23505';end if;
 update public.aerosuite_flight_bookings set status='confirmed',
  instructor_id=null,aircraft=upper(v_slot.resource_label),
  updated_by=v_actor,updated_at=now() where id=v_booking.id;
 insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,before_data,after_data)
 select p_institution_id,v_booking.id,v_actor,'solo_flight_authorized',to_jsonb(v_booking),
 to_jsonb(b)||jsonb_build_object('authorization_reference',v_ref,'verified_by_school',true)
 from public.aerosuite_flight_bookings b where b.id=v_booking.id;
 return jsonb_build_object('ok',true,'booking_id',v_booking.id,'status','confirmed',
  'with_instructor',false);
end $fn$;
revoke all on function public.aerosuite_confirm_without_instructor(uuid,uuid,text) from public,anon;
grant execute on function public.aerosuite_confirm_without_instructor(uuid,uuid,text) to authenticated;
