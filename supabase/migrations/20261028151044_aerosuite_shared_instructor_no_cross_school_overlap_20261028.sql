-- Evitar confirmación de un mismo instructor en dos instituciones a la misma hora.
-- Se conserva el aislamiento de datos: el error no revela datos de la otra institución.
CREATE OR REPLACE FUNCTION public.aerosuite_booking_action(p_institution_id uuid, p_action text, p_booking_id uuid DEFAULT NULL::uuid, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_student_id uuid DEFAULT NULL::uuid, p_instructor_id uuid DEFAULT NULL::uuid, p_aircraft text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_role text;v_mode text;v_booking public.aerosuite_flight_bookings%rowtype;v_id uuid;v_student uuid;v_instructor uuid;v_before jsonb;
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
     update public.aerosuite_flight_bookings set aircraft=upper(left(btrim(coalesce(p_aircraft,'')),60)),
       updated_by=v_actor,updated_at=now() where id=v_id;
   elsif p_action='cancel' then
     if v_booking.status not in ('pending','confirmed') or not (v_role in ('administrador','secretaria') or (v_role='alumno' and v_booking.student_id=v_actor and v_booking.status='pending'))
     then raise exception 'No podés cancelar esta reserva.' using errcode='42501';end if;
     if exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=v_booking.id) then raise exception 'El vuelo ya tiene un informe presentado. Debés resolverlo desde Administración, sin cancelar el registro de manera silenciosa.' using errcode='22023';end if;
     if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Indicá el motivo de cancelación.' using errcode='22023';end if;
     update public.aerosuite_flight_bookings set status='cancelled',cancellation_reason=left(btrim(p_reason),250),updated_by=v_actor,updated_at=now() where id=v_id;
   else
     if not exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=v_booking.id and r.status='approved') then raise exception 'No se puede cerrar un vuelo sin informe de instrucción validado.' using errcode='22023';end if;
     if v_role not in ('administrador','secretaria') or v_booking.status<>'confirmed' then raise exception 'Solo Administración puede cerrar vuelos confirmados.' using errcode='42501';end if;
     update public.aerosuite_flight_bookings set status='completed',updated_by=v_actor,updated_at=now() where id=v_id;
   end if;
   insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,before_data,after_data)
    select p_institution_id,v_id,v_actor,p_action,v_before,to_jsonb(b) from public.aerosuite_flight_bookings b where b.id=v_id;
 end if;
 return jsonb_build_object('ok',true,'booking_id',v_id,'action',p_action);
end;$function$
;
