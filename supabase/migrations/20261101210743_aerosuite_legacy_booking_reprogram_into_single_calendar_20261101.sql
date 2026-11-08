-- Migrar una reserva antigua a un cupo publicado conservando el turno y la auditoría.
-- No se permite una reprogramación que deje el cupo publicado sin ocupar.
create or replace function public.aerosuite_legacy_booking_move_to_published(
 p_institution_id uuid,p_booking_id uuid,p_target_slot_id uuid,
 p_student_authorized boolean,p_authorization_channel text,p_reason text,
 p_instructor_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_actor uuid:=auth.uid(); v_mode text;
 v_booking public.aerosuite_flight_bookings%rowtype;
 v_slot public.aerosuite_availability_slots%rowtype;
 v_channel text:=lower(btrim(coalesce(p_authorization_channel,'')));
 v_reason text:=btrim(coalesce(p_reason,''));
 v_count int;v_reservation_id uuid;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m
 join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Secretaría o Dirección pueden reprogramar turnos.' using errcode='42501';end if;
 if p_student_authorized is distinct from true or
 v_channel not in('presencial','telefono','whatsapp','correo','otro')
 or length(v_reason) not between 5 and 250 then
  raise exception 'Registrá la autorización del alumno, su medio y un motivo de 5 a 250 caracteres.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_booking from public.aerosuite_flight_bookings b
 where b.id=p_booking_id and b.institution_id=p_institution_id for update;
 if not found or v_booking.status not in('pending','confirmed') or v_booking.starts_at<=now()
  or exists(select 1 from public.aerosuite_activity_reservations r where r.booking_id=p_booking_id)
  or exists(select 1 from public.aerosuite_flight_reports fr where fr.booking_id=p_booking_id)
  or exists(select 1 from public.aerosuite_flight_checkouts fc where fc.booking_id=p_booking_id)
 then raise exception 'La reserva anterior ya se realizó, tiene movimientos o está vinculada a la nueva agenda.' using errcode='22023';end if;
 select * into v_slot from public.aerosuite_availability_slots s
 where s.id=p_target_slot_id and s.institution_id=p_institution_id for update;
 if not found or v_slot.activity<>'flight' or v_slot.published_at is null
  or v_slot.starts_at<=now() or v_slot.starts_at>now()+interval '90 days'
  or v_booking.starts_at=v_slot.starts_at then
  raise exception 'Seleccioná otro turno de vuelo publicado y futuro.' using errcode='22023';end if;
 if not exists(select 1 from public.aerosuite_aircraft_registry a
  where a.institution_id=p_institution_id and a.registration=upper(v_slot.resource_label)
    and a.availability='available' and a.archived_at is null)
 then raise exception 'La aeronave seleccionada no está disponible en Flota.' using errcode='22023';end if;
 select count(*) into v_count from public.aerosuite_activity_reservations r
 where r.slot_id=v_slot.id and r.status in('pending','confirmed','completed');
 if v_count>=v_slot.capacity then raise exception 'El turno elegido ya no tiene cupos.' using errcode='23505';end if;
 if exists(select 1 from public.aerosuite_activity_reservations r
    join public.aerosuite_availability_slots s on s.id=r.slot_id
   where r.institution_id=p_institution_id and r.student_id=v_booking.student_id
    and r.status in('pending','confirmed')
    and tstzrange(s.starts_at,s.starts_at+s.duration_minutes*interval '1 minute','[)') &&
        tstzrange(v_slot.starts_at,v_slot.starts_at+v_slot.duration_minutes*interval '1 minute','[)')
 ) or exists(select 1 from public.aerosuite_flight_bookings b
   where b.institution_id=p_institution_id and b.id<>v_booking.id
    and b.student_id=v_booking.student_id and b.status in('pending','confirmed')
    and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
        tstzrange(v_slot.starts_at,v_slot.starts_at+interval '90 minutes','[)')
 ) then raise exception 'El alumno tiene otro turno a ese horario.' using errcode='23505';end if;
 if exists(select 1 from public.aerosuite_flight_bookings b
  where b.institution_id=p_institution_id and b.id<>v_booking.id and b.status in('pending','confirmed')
   and upper(coalesce(b.aircraft,''))=upper(v_slot.resource_label)
   and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
       tstzrange(v_slot.starts_at,v_slot.starts_at+interval '90 minutes','[)')
 ) then raise exception 'La aeronave ya está asignada a otro vuelo.' using errcode='23505';end if;
 if p_instructor_id is not null then
  if not exists(select 1 from public.aerosuite_institution_members m
   where m.institution_id=p_institution_id and m.user_id=p_instructor_id and m.role='instructor') then
   raise exception 'Instructor no habilitado en esta institución.' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('aerosuite_instructor_'||p_instructor_id::text,0));
  if exists(select 1 from public.aerosuite_flight_bookings b where b.id<>v_booking.id
   and b.instructor_id=p_instructor_id and b.status in('confirmed','completed')
   and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
       tstzrange(v_slot.starts_at,v_slot.starts_at+interval '90 minutes','[)')
  ) then raise exception 'El instructor ya tiene otro vuelo confirmado.' using errcode='23505';end if;
 end if;
 update public.aerosuite_flight_bookings set
  starts_at=v_slot.starts_at,status='pending',instructor_id=p_instructor_id,aircraft='',
  updated_at=now(),updated_by=v_actor where id=v_booking.id;
 insert into public.aerosuite_flight_booking_audit
  (institution_id,booking_id,actor_id,event,before_data,after_data)
 values(p_institution_id,v_booking.id,v_actor,'rescheduled',to_jsonb(v_booking),
  jsonb_build_object('new_slot_id',v_slot.id,'new_starts_at',v_slot.starts_at,
   'previous_starts_at',v_booking.starts_at,'authorization_channel',v_channel,
   'student_authorized',true,'reason',v_reason,'instructor_preassigned',p_instructor_id is not null));
 insert into public.aerosuite_activity_reservations
  (institution_id,slot_id,student_id,booking_id,status,created_by,updated_by)
 values(p_institution_id,v_slot.id,v_booking.student_id,v_booking.id,'pending',v_actor,v_actor)
 returning id into v_reservation_id;
 insert into public.aerosuite_activity_audit(institution_id,slot_id,reservation_id,actor_id,event,detail)
 values(p_institution_id,v_slot.id,v_reservation_id,v_actor,'legacy_moved',
  jsonb_build_object('original_booking_id',v_booking.id,'previous_starts_at',v_booking.starts_at,
   'reason',v_reason,'authorization_channel',v_channel,'student_authorized',true));
 return jsonb_build_object('ok',true,'booking_id',v_booking.id,
  'reservation_id',v_reservation_id,'new_starts_at',v_slot.starts_at,'status','pending');
end $fn$;
revoke all on function public.aerosuite_legacy_booking_move_to_published(uuid,uuid,uuid,boolean,text,text,uuid) from public,anon;
grant execute on function public.aerosuite_legacy_booking_move_to_published(uuid,uuid,uuid,boolean,text,text,uuid) to authenticated;