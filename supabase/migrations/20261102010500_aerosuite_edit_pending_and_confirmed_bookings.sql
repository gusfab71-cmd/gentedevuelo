-- Modificar el instructor de un vuelo pendiente o confirmado sin alterar su reserva ni su estado.
-- Las reprogramaciones mantienen un flujo separado, con autorización del alumno.
create or replace function public.aerosuite_booking_change_instructor(
 p_institution_id uuid,
 p_booking_id uuid,
 p_instructor_id uuid,
 p_reason text
) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare
 v_actor uuid:=auth.uid();
 v_mode text;
 v_booking public.aerosuite_flight_bookings%rowtype;
 v_reason text:=btrim(coalesce(p_reason,''));
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode
 from public.aerosuite_institution_members m
 join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección y Secretaría pueden modificar instructores.' using errcode='42501';end if;
 if p_instructor_id is null or length(v_reason) not between 5 and 250 then
  raise exception 'Elegí un instructor y registrá un motivo de 5 a 250 caracteres.' using errcode='22023';end if;
 if not exists(select 1 from public.aerosuite_institution_members m
    where m.institution_id=p_institution_id and m.user_id=p_instructor_id and m.role='instructor') then
  raise exception 'El instructor no está habilitado en esta institución.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_booking from public.aerosuite_flight_bookings b
 where b.institution_id=p_institution_id and b.id=p_booking_id for update;
 if not found or v_booking.status not in('pending','confirmed') or v_booking.starts_at<=now() then
  raise exception 'Solo se modifican reservas futuras pendientes o confirmadas.' using errcode='22023';end if;
 if exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=p_booking_id)
 or exists(select 1 from public.aerosuite_flight_checkouts c where c.booking_id=p_booking_id) then
  raise exception 'Hay un informe o movimiento de cobro. Requiere revisión administrativa.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('aerosuite_instructor_'||p_instructor_id::text,0));
 if exists(select 1 from public.aerosuite_flight_bookings b
    where b.id<>v_booking.id and b.instructor_id=p_instructor_id
    and b.status in('confirmed','completed')
    and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
        tstzrange(v_booking.starts_at,v_booking.starts_at+interval '90 minutes','[)')) then
  raise exception 'El instructor tiene otro vuelo confirmado en ese horario.' using errcode='23505';end if;
 if v_booking.instructor_id=p_instructor_id then
  return jsonb_build_object('ok',true,'changed',false,'booking_id',v_booking.id,'status',v_booking.status);
 end if;
 update public.aerosuite_flight_bookings set instructor_id=p_instructor_id,
  updated_by=v_actor,updated_at=now() where id=v_booking.id;
 insert into public.aerosuite_flight_booking_audit(
   institution_id,booking_id,actor_id,event,before_data,after_data)
 select p_institution_id,v_booking.id,v_actor,'instructor_modified',to_jsonb(v_booking),
  to_jsonb(b)||jsonb_build_object('change_reason',v_reason)
 from public.aerosuite_flight_bookings b where b.id=v_booking.id;
 return jsonb_build_object('ok',true,'changed',true,
  'booking_id',v_booking.id,'status',v_booking.status,'instructor_id',p_instructor_id);
end $fn$;
revoke all on function public.aerosuite_booking_change_instructor(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.aerosuite_booking_change_instructor(uuid,uuid,uuid,text) to authenticated;

-- En una misma transacción: reasignar a otro cupo publicado y, opcionalmente,
-- preasignar instructor, con la autorización y el motivo del cambio.
create or replace function public.aerosuite_published_reprogram_with_instructor(
 p_institution_id uuid,
 p_reservation_id uuid,
 p_target_slot_id uuid,
 p_student_authorized boolean,
 p_channel text,
 p_reason text,
 p_instructor_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_actor uuid:=auth.uid();
 v_mode text;
 v_move jsonb;
 v_booking_id uuid;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode
 from public.aerosuite_institution_members m
 join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección y Secretaría pueden reprogramar.' using errcode='42501';end if;
 v_move:=public.aerosuite_availability_reprogram(
  p_institution_id,p_reservation_id,p_target_slot_id,
  p_student_authorized,p_channel,p_reason);
 v_booking_id:=nullif(v_move->>'booking_id','')::uuid;
 if p_instructor_id is not null and v_booking_id is not null then
  perform public.aerosuite_preassign_pending_instructor(p_institution_id,v_booking_id,p_instructor_id);
 end if;
 return v_move||jsonb_build_object('instructor_preassigned',p_instructor_id is not null and v_booking_id is not null);
end $fn$;
revoke all on function public.aerosuite_published_reprogram_with_instructor(uuid,uuid,uuid,boolean,text,text,uuid) from public,anon;
grant execute on function public.aerosuite_published_reprogram_with_instructor(uuid,uuid,uuid,boolean,text,text,uuid) to authenticated;
