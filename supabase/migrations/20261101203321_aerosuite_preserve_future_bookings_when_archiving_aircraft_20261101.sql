CREATE OR REPLACE FUNCTION public.aerosuite_aircraft_archive(p_institution_id uuid, p_aircraft_id uuid, p_reason text, p_restore boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_mode text;v_old public.aerosuite_aircraft_registry%rowtype;v_reason text:=btrim(coalesce(p_reason,''));
begin
 select private.aerosuite_access_mode(o.status,o.trial_ends_at,o.license_ends_at,now())
 into v_mode from public.aerosuite_institutions o join public.aerosuite_institution_members m on m.institution_id=o.id
 where o.id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria') limit 1;
 if v_actor is null or v_mode not in ('trial','grace','active') then
  raise exception 'Solo Dirección y Secretaría pueden modificar la flota.' using errcode='42501';
 end if;
 if not coalesce(p_restore,false) and length(v_reason) not between 5 and 300 then
  raise exception 'Indicá un motivo de baja entre 5 y 300 caracteres.' using errcode='22023';
 end if;
 select * into v_old from public.aerosuite_aircraft_registry
 where institution_id=p_institution_id and id=p_aircraft_id for update;
 if not found then raise exception 'Aeronave inexistente en esta institución.' using errcode='P0002';end if;
 if coalesce(p_restore,false) then
  if v_old.archived_at is null then raise exception 'La aeronave ya integra la flota.' using errcode='22023';end if;
  update public.aerosuite_aircraft_registry
  set archived_at=null,archived_by=null,archived_reason='',
      availability='out_of_service',
      out_of_service_since=coalesce(out_of_service_since,(now() at time zone 'America/Argentina/Buenos_Aires')::date),
      out_of_service_reason=case when btrim(out_of_service_reason)='' then 'Reincorporada, pendiente de validación operativa' else out_of_service_reason end,
      status_changed_on=(now() at time zone 'America/Argentina/Buenos_Aires')::date,
      updated_by=v_actor,updated_at=now()
  where id=p_aircraft_id and institution_id=p_institution_id;
 else
  if v_old.archived_at is not null then raise exception 'La aeronave ya fue retirada de la flota.' using errcode='22023';end if;
  if exists (
    select 1 from public.aerosuite_flight_bookings b where b.institution_id=p_institution_id
      and aerosuite_internal.aerosuite_normalize_registration(b.aircraft)=v_old.registration
      and b.status<>'cancelled' and b.starts_at>=now()
  ) then
   raise exception 'Esta aeronave tiene turnos futuros asignados. Reasignalos antes de retirarla.' using errcode='22023';
  end if;
  if exists(
   select 1 from public.aerosuite_activity_reservations r
   join public.aerosuite_availability_slots s on s.id=r.slot_id
   where s.institution_id=p_institution_id and s.activity='flight'
    and upper(s.resource_label)=upper(v_old.registration) and s.starts_at>=now()
    and r.status in('pending','confirmed','completed')
  ) then
   raise exception 'Esta aeronave tiene reservas futuras. Reprogramá o cancelá los turnos antes de retirarla.' using errcode='22023';
  end if;
  update public.aerosuite_aircraft_registry
  set archived_at=now(),archived_by=v_actor,archived_reason=v_reason,
      availability='out_of_service',
      out_of_service_since=coalesce(out_of_service_since,(now() at time zone 'America/Argentina/Buenos_Aires')::date),
      out_of_service_reason=case when v_old.availability='available' then left('Retirada de flota: '||v_reason,300) else out_of_service_reason end,
      status_changed_on=(now() at time zone 'America/Argentina/Buenos_Aires')::date,
      updated_by=v_actor,updated_at=now()
  where id=p_aircraft_id and institution_id=p_institution_id;
 end if;
 insert into public.aerosuite_aircraft_changes(institution_id,aircraft_id,actor_id,before_data,after_data)
  select p_institution_id,p_aircraft_id,v_actor,to_jsonb(v_old),to_jsonb(a)
  from public.aerosuite_aircraft_registry a where a.id=p_aircraft_id;
 return jsonb_build_object('ok',true,'aircraft_id',p_aircraft_id,'archived',not coalesce(p_restore,false));
end;$function$
;