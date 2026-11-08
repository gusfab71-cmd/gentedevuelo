-- Edición segura de un turno sin alumnos, desde la turnera integrada.
-- Conserva el ID y la publicación, impide superposiciones y mantiene auditoría.
create or replace function public.aerosuite_availability_edit(
 p_institution_id uuid,
 p_slot_id uuid,
 p_starts_at timestamptz,
 p_resource text,
 p_capacity integer
) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare
 v_actor uuid:=auth.uid();
 v_mode text;
 v_slot public.aerosuite_availability_slots%rowtype;
 v_resource text:=btrim(coalesce(p_resource,''));
 v_local timestamp;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode from public.aerosuite_institution_members m
 join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Secretaría y Dirección pueden modificar horarios.' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_slot from public.aerosuite_availability_slots s
 where s.id=p_slot_id and s.institution_id=p_institution_id for update;
 if not found then raise exception 'No se encontró el horario seleccionado.' using errcode='P0002';end if;
 if v_slot.starts_at<=now() then
  raise exception 'Un turno iniciado o vencido no puede modificarse.' using errcode='22023';
 end if;
 if exists(select 1 from public.aerosuite_activity_reservations r where r.slot_id=p_slot_id) then
  raise exception 'Este horario tiene reservas o antecedentes. Reprogramá cada reserva antes de modificarlo.' using errcode='22023';
 end if;
 if p_starts_at is null or p_starts_at<=now() or p_starts_at>now()+interval '90 days' then
  raise exception 'Elegí una fecha futura dentro de los próximos 90 días.' using errcode='22023';
 end if;
 v_local:=p_starts_at at time zone 'America/Argentina/Buenos_Aires';
 if v_local::time not in(time '08:00',time '09:30',time '11:00',time '12:30',
  time '14:00',time '15:30',time '17:00',time '18:30') then
  raise exception 'Elegí un horario de la grilla de 90 minutos (08:00 a 18:30).' using errcode='22023';
 end if;
 if length(v_resource) not between 2 and 90 or p_capacity not between 1 and 50
 or (v_slot.activity in('flight','simulator') and p_capacity<>1) then
  raise exception 'El recurso o los cupos no son válidos.' using errcode='22023';
 end if;
 if v_slot.activity='flight' then
  v_resource:=upper(v_resource);
  if not exists(select 1 from public.aerosuite_aircraft_registry a
    where a.institution_id=p_institution_id and a.registration=v_resource
     and a.availability='available' and a.archived_at is null) then
   raise exception 'La aeronave no está habilitada como disponible en Flota.' using errcode='22023';
  end if;
  if exists(select 1 from public.aerosuite_flight_bookings b
    where b.institution_id=p_institution_id and b.status in('pending','confirmed','completed')
      and upper(coalesce(b.aircraft,''))=v_resource
      and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
       tstzrange(p_starts_at,p_starts_at+interval '90 minutes','[)')) then
   raise exception 'La aeronave está asignada a otro vuelo en el horario elegido.' using errcode='23505';
  end if;
 elsif v_slot.activity='simulator' then
  if not exists(select 1 from public.aerosuite_simulators s
    where s.institution_id=p_institution_id and lower(s.name)=lower(v_resource)
     and s.availability='available' and s.archived_at is null) then
   raise exception 'El simulador no está disponible en Flota.' using errcode='22023';
  end if;
 end if;
 if exists(select 1 from public.aerosuite_availability_slots s
    where s.institution_id=p_institution_id and s.id<>v_slot.id
     and s.activity=v_slot.activity and lower(s.resource_label)=lower(v_resource)
     and tstzrange(s.starts_at,s.starts_at+s.duration_minutes*interval '1 minute','[)') &&
         tstzrange(p_starts_at,p_starts_at+interval '90 minutes','[)')) then
  raise exception 'Ya existe un turno superpuesto para ese recurso.' using errcode='23505';
 end if;
 update public.aerosuite_availability_slots set starts_at=p_starts_at,
  resource_label=v_resource,capacity=p_capacity,updated_at=now()
  where id=v_slot.id;
 insert into public.aerosuite_activity_audit(institution_id,slot_id,actor_id,event,detail)
 values(p_institution_id,v_slot.id,v_actor,'slot_edited',
  jsonb_build_object('previous_starts_at',v_slot.starts_at,
   'new_starts_at',p_starts_at,
   'previous_resource',v_slot.resource_label,'new_resource',v_resource,
   'previous_capacity',v_slot.capacity,'new_capacity',p_capacity,
   'published',v_slot.published_at is not null));
 return jsonb_build_object('ok',true,'slot_id',v_slot.id,'starts_at',p_starts_at,
   'resource',v_resource,'capacity',p_capacity,'published',v_slot.published_at is not null);
end $fn$;
revoke all on function public.aerosuite_availability_edit(uuid,uuid,timestamptz,text,integer) from public,anon;
grant execute on function public.aerosuite_availability_edit(uuid,uuid,timestamptz,text,integer) to authenticated;
