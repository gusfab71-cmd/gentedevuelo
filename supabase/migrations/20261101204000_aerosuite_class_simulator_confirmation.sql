create or replace function public.aerosuite_availability_confirm(
 p_institution_id uuid,p_reservation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid();v_mode text;
 v_res public.aerosuite_activity_reservations%rowtype;
 v_slot public.aerosuite_availability_slots%rowtype;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección o Secretaría pueden confirmar actividades.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_res from public.aerosuite_activity_reservations
 where id=p_reservation_id and institution_id=p_institution_id for update;
 if not found or v_res.status<>'pending' then
  raise exception 'La reserva no está pendiente.' using errcode='22023';end if;
 select * into v_slot from public.aerosuite_availability_slots where id=v_res.slot_id;
 if v_slot.starts_at<=now() then raise exception 'El turno ya comenzó.' using errcode='22023';end if;
 if v_res.booking_id is not null then
  raise exception 'Las reservas de vuelo se confirman desde el detalle, asignando Instructor.' using errcode='22023';
 end if;
 update public.aerosuite_activity_reservations
  set status='confirmed',updated_by=v_actor,updated_at=now() where id=v_res.id;
 insert into public.aerosuite_activity_audit(institution_id,slot_id,reservation_id,actor_id,event)
  values(p_institution_id,v_slot.id,v_res.id,v_actor,'confirmed');
 return jsonb_build_object('ok',true);
end $fn$;
revoke all on function public.aerosuite_availability_confirm(uuid,uuid) from public,anon;
grant execute on function public.aerosuite_availability_confirm(uuid,uuid) to authenticated;