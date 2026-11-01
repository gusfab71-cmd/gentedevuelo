-- Reprogramación de reservas publicadas con autorización del alumno, sin perder el vínculo con el cupo.
alter table public.aerosuite_activity_reservations drop constraint if exists aerosuite_slot_student_unique;
create unique index if not exists aerosuite_slot_student_active_unique
 on public.aerosuite_activity_reservations(slot_id,student_id)
 where status in('pending','confirmed','completed');

create or replace function public.aerosuite_availability_reprogram(
 p_institution_id uuid,p_reservation_id uuid,p_target_slot_id uuid,
 p_student_authorized boolean,p_channel text,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_actor uuid:=auth.uid();v_mode text;
 v_r public.aerosuite_activity_reservations%rowtype;
 v_old public.aerosuite_availability_slots%rowtype;
 v_new public.aerosuite_availability_slots%rowtype;
 v_b public.aerosuite_flight_bookings%rowtype;
 v_count integer;
 v_channel text:=lower(btrim(coalesce(p_channel,'')));
 v_reason text:=btrim(coalesce(p_reason,''));
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección o Secretaría pueden reprogramar.' using errcode='42501';end if;
 if p_student_authorized is distinct from true or
 v_channel not in('presencial','telefono','whatsapp','correo','otro') or
 length(v_reason) not between 5 and 250 then
  raise exception 'Registrá la autorización del alumno, el canal y un motivo de 5 a 250 caracteres.' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_r from public.aerosuite_activity_reservations
 where id=p_reservation_id and institution_id=p_institution_id for update;
 if not found or v_r.status not in('pending','confirmed') then
  raise exception 'Esta reserva no puede reprogramarse.' using errcode='22023';end if;
 select * into v_old from public.aerosuite_availability_slots where id=v_r.slot_id;
 select * into v_new from public.aerosuite_availability_slots
 where id=p_target_slot_id and institution_id=p_institution_id for update;
 if not found or v_new.published_at is null or v_new.starts_at<=now()
 or v_new.starts_at>now()+interval '90 days'
 or v_new.activity<>v_old.activity or v_new.id=v_old.id then
  raise exception 'Elegí otro turno publicado de la misma actividad.' using errcode='22023';end if;
 if v_old.starts_at<=now() then raise exception 'No se reprograman turnos ya iniciados.' using errcode='22023';end if;
 select count(*) into v_count from public.aerosuite_activity_reservations r
 where r.slot_id=v_new.id and r.status in('pending','confirmed','completed');
 if v_count>=v_new.capacity then raise exception 'El nuevo horario no tiene cupos.' using errcode='23505';end if;
 if exists(select 1 from public.aerosuite_activity_reservations r join public.aerosuite_availability_slots s on s.id=r.slot_id
  where r.institution_id=p_institution_id and r.id<>v_r.id and r.student_id=v_r.student_id
   and r.status in('pending','confirmed')
   and tstzrange(s.starts_at,s.starts_at+s.duration_minutes*interval '1 minute','[)') &&
       tstzrange(v_new.starts_at,v_new.starts_at+v_new.duration_minutes*interval '1 minute','[)')
 ) or exists(select 1 from public.aerosuite_flight_bookings b
  where b.institution_id=p_institution_id and b.id is distinct from v_r.booking_id
    and b.student_id=v_r.student_id and b.status in('pending','confirmed')
    and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
        tstzrange(v_new.starts_at,v_new.starts_at+v_new.duration_minutes*interval '1 minute','[)')
 ) then raise exception 'El alumno tiene otra actividad en ese horario.' using errcode='23505';end if;
 if v_r.booking_id is not null then
  select * into v_b from public.aerosuite_flight_bookings
  where id=v_r.booking_id and institution_id=p_institution_id for update;
  if not found or v_b.status not in('pending','confirmed') or exists(
   select 1 from public.aerosuite_flight_reports fr where fr.booking_id=v_b.id
  ) or exists(
   select 1 from public.aerosuite_flight_checkouts fc where fc.booking_id=v_b.id
  ) then raise exception 'El vuelo ya tiene informe o liquidación. Requiere revisión administrativa.' using errcode='22023';end if;
  if upper(v_new.resource_label) like 'LV-%' and not exists(
   select 1 from public.aerosuite_aircraft_registry a
   where a.institution_id=p_institution_id and a.registration=upper(v_new.resource_label)
    and a.availability='available' and a.archived_at is null
  ) then raise exception 'La aeronave no está disponible.' using errcode='22023';end if;
  update public.aerosuite_flight_bookings
  set starts_at=v_new.starts_at,status='pending',instructor_id=null,aircraft='',
    updated_by=v_actor,updated_at=now()
  where id=v_b.id;
  insert into public.aerosuite_flight_booking_audit
   (institution_id,booking_id,actor_id,event,before_data,after_data)
  values(p_institution_id,v_b.id,v_actor,'rescheduled',to_jsonb(v_b),
   jsonb_build_object('new_starts_at',v_new.starts_at,'new_slot_id',v_new.id,
    'previous_slot_id',v_old.id,'authorized_by_student',true,'authorization_channel',v_channel,'reason',v_reason));
 end if;
 update public.aerosuite_activity_reservations
 set slot_id=v_new.id,status='pending',updated_at=now(),updated_by=v_actor
 where id=v_r.id;
 insert into public.aerosuite_activity_audit
  (institution_id,slot_id,reservation_id,actor_id,event,detail)
 values(p_institution_id,v_new.id,v_r.id,v_actor,'rescheduled',
  jsonb_build_object('previous_slot_id',v_old.id,'previous_starts_at',v_old.starts_at,
   'new_starts_at',v_new.starts_at,'channel',v_channel,'reason',v_reason,'authorized',true));
 return jsonb_build_object('ok',true,'booking_id',v_r.booking_id,'new_slot_id',v_new.id,'status','pending');
end $fn$;
revoke all on function public.aerosuite_availability_reprogram(uuid,uuid,uuid,boolean,text,text) from public,anon;
grant execute on function public.aerosuite_availability_reprogram(uuid,uuid,uuid,boolean,text,text) to authenticated;