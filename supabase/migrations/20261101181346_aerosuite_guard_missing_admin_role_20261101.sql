CREATE OR REPLACE FUNCTION public.aerosuite_availability_cancel(p_institution_id uuid, p_reservation_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_mode text;v_res public.aerosuite_activity_reservations%rowtype;
 v_slot public.aerosuite_availability_slots%rowtype;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección o Secretaría pueden cancelar reservas.' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,'')))<3 then
  raise exception 'Indicá el motivo de cancelación.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_res from public.aerosuite_activity_reservations
 where id=p_reservation_id and institution_id=p_institution_id for update;
 if not found or v_res.status='cancelled' then raise exception 'Reserva no activa o inexistente.' using errcode='22023';end if;
 select * into v_slot from public.aerosuite_availability_slots where id=v_res.slot_id;
 if v_slot.starts_at<=now() then raise exception 'La actividad ya comenzó. Requiere revisión administrativa.' using errcode='22023';end if;
 if v_res.booking_id is not null then
  perform public.aerosuite_booking_action(p_institution_id,'cancel',v_res.booking_id,null,null,null,null,p_reason);
 else
  update public.aerosuite_activity_reservations
  set status='cancelled',cancellation_reason=left(btrim(p_reason),250),updated_by=v_actor,updated_at=now()
  where id=v_res.id;
 end if;
 insert into public.aerosuite_activity_audit
  (institution_id,slot_id,reservation_id,actor_id,event,detail)
 values(p_institution_id,v_slot.id,v_res.id,v_actor,'cancelled',jsonb_build_object('reason',p_reason));
 return jsonb_build_object('ok',true);
end $function$
;
CREATE OR REPLACE FUNCTION public.aerosuite_availability_confirm(p_institution_id uuid, p_reservation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_mode text;
 v_res public.aerosuite_activity_reservations%rowtype;
 v_slot public.aerosuite_availability_slots%rowtype;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
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
end $function$
;
CREATE OR REPLACE FUNCTION public.aerosuite_availability_manage(p_institution_id uuid, p_action text, p_slot_id uuid DEFAULT NULL::uuid, p_activity text DEFAULT NULL::text, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_resource text DEFAULT NULL::text, p_capacity integer DEFAULT 1, p_duration_minutes integer DEFAULT 90, p_week_start date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_mode text;v_id uuid;v_slot public.aerosuite_availability_slots%rowtype;
 v_resource text:=btrim(coalesce(p_resource,''));v_count integer;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección y Secretaría con acceso de escritura pueden publicar horarios.' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 if p_action='create' then
  if p_activity not in ('flight','simulator','theory') or p_starts_at is null
   or p_starts_at<=now() or p_starts_at>now()+interval '90 days'
   or length(v_resource) not between 2 and 90
   or p_duration_minutes not in (90) or p_capacity not between 1 and 50
   or (p_activity='flight' and p_capacity<>1)
  then raise exception 'Actividad, recurso, cupo u horario inválido.' using errcode='22023';end if;
  if p_activity='flight' and upper(v_resource) like 'LV-%' and exists(
   select 1 from public.aerosuite_aircraft_registry a where a.institution_id=p_institution_id
  ) and not exists(
   select 1 from public.aerosuite_aircraft_registry a
   where a.institution_id=p_institution_id and a.registration=upper(v_resource)
    and a.availability='available' and a.archived_at is null
  ) then raise exception 'No se puede publicar un turno de una aeronave fuera de servicio.' using errcode='22023';end if;
  if exists(select 1 from public.aerosuite_availability_slots a
   where a.institution_id=p_institution_id and a.activity=p_activity and lower(a.resource_label)=lower(v_resource)
   and tstzrange(a.starts_at,a.starts_at+a.duration_minutes*interval '1 minute','[)') &&
       tstzrange(p_starts_at,p_starts_at+p_duration_minutes*interval '1 minute','[)')
  ) then raise exception 'Este recurso ya tiene un turno superpuesto.' using errcode='23505';end if;
  insert into public.aerosuite_availability_slots
   (institution_id,activity,starts_at,resource_label,capacity,duration_minutes,created_by)
  values(p_institution_id,p_activity,p_starts_at,
   case when p_activity='flight' and upper(v_resource) like 'LV-%' then upper(v_resource) else v_resource end,
   p_capacity,p_duration_minutes,v_actor) returning id into v_id;
  insert into public.aerosuite_activity_audit(institution_id,slot_id,actor_id,event,detail)
   values(p_institution_id,v_id,v_actor,'draft_created',jsonb_build_object('activity',p_activity,'resource',v_resource,'capacity',p_capacity));
 elsif p_action='publish_week' then
  if p_week_start is null or p_week_start < (now() at time zone 'America/Argentina/Buenos_Aires')::date-7
     or p_week_start > (now() at time zone 'America/Argentina/Buenos_Aires')::date+90
  then raise exception 'Semana fuera del rango permitido.' using errcode='22023';end if;
  update public.aerosuite_availability_slots set published_at=now(),updated_at=now()
  where institution_id=p_institution_id and published_at is null and starts_at>now()
   and starts_at>=p_week_start::timestamp at time zone 'America/Argentina/Buenos_Aires'
   and starts_at<(p_week_start+7)::timestamp at time zone 'America/Argentina/Buenos_Aires';
  get diagnostics v_count=row_count;
  insert into public.aerosuite_activity_audit(institution_id,actor_id,event,detail)
   values(p_institution_id,v_actor,'week_published',jsonb_build_object('week_start',p_week_start,'slots',v_count));
  return jsonb_build_object('ok',true,'published',v_count);
 else
  select * into v_slot from public.aerosuite_availability_slots
   where id=p_slot_id and institution_id=p_institution_id for update;
  if not found then raise exception 'Horario inexistente.' using errcode='P0002';end if;
  if p_action='publish' then
   if v_slot.starts_at<=now() then raise exception 'No se publican horarios ya iniciados.' using errcode='22023';end if;
   update public.aerosuite_availability_slots set published_at=now(),updated_at=now() where id=v_slot.id;
  elsif p_action='hide' then
   if exists(select 1 from public.aerosuite_activity_reservations r where r.slot_id=v_slot.id and r.status in('pending','confirmed','completed')) then
    raise exception 'Este turno tiene alumnos. Gestioná las reservas antes de retirarlo.' using errcode='22023';
   end if;
   update public.aerosuite_availability_slots set published_at=null,updated_at=now() where id=v_slot.id;
  elsif p_action='discard' then
   if exists(select 1 from public.aerosuite_activity_reservations r where r.slot_id=v_slot.id) then
    raise exception 'Este turno tiene historial de reservas y no puede eliminarse.' using errcode='22023';
   end if;
   delete from public.aerosuite_availability_slots where id=v_slot.id;
  else raise exception 'Acción inválida.' using errcode='22023';
  end if;
  v_id=v_slot.id;
  insert into public.aerosuite_activity_audit(institution_id,slot_id,actor_id,event,detail)
   values(p_institution_id,case when p_action='discard' then null else v_id end,v_actor,p_action,
    jsonb_build_object('slot_id',v_id,'activity',v_slot.activity));
 end if;
 return jsonb_build_object('ok',true,'slot_id',v_id,'action',p_action);
end $function$
;
CREATE OR REPLACE FUNCTION public.aerosuite_void_hour_pack(p_institution_id uuid, p_pack_id uuid, p_reason text, p_kind text DEFAULT 'correction'::text, p_refund_method text DEFAULT NULL::text, p_refund_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_mode text;v_pack public.aerosuite_hour_packs%rowtype;
 v_sale public.aerosuite_money_movements%rowtype;v_comp uuid;
 v_reason text:=btrim(coalesce(p_reason,''));
 v_payment text;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Secretaría y Dirección pueden anular packs.' using errcode='42501';end if;
 if length(v_reason)<5 or length(v_reason)>300 or p_kind not in ('correction','refund') then
  raise exception 'Elegí el tipo de anulación y un motivo de 5 a 300 caracteres.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_pack from public.aerosuite_hour_packs
  where id=p_pack_id and institution_id=p_institution_id for update;
 if not found or v_pack.voided_at is not null then raise exception 'Pack inexistente o previamente anulado.' using errcode='22023';end if;
 if exists(select 1 from public.aerosuite_pack_usages u where u.pack_id=v_pack.id) then
  raise exception 'El pack ya tiene horas consumidas. Regularizá los vuelos antes de anularlo.' using errcode='22023';
 end if;
 select * into v_sale from public.aerosuite_money_movements m
  where m.pack_id=v_pack.id and m.institution_id=p_institution_id and m.movement_type='pack_sale'
  order by m.created_at for update;
 if v_pack.paid_amount>0 and v_sale.id is null then
  raise exception 'No se encontró el cobro original. Revisá la contaduría antes de anular.' using errcode='22023';
 end if;
 if p_kind='refund' and (p_refund_method not in('cash','bank_transfer') or
   (p_refund_method='bank_transfer' and length(btrim(coalesce(p_refund_reference,'')))<4)) then
  raise exception 'Indicá cómo y con qué referencia se devolvió realmente el dinero.' using errcode='22023';
 end if;
 v_payment:=case when p_kind='refund' then p_refund_method else coalesce(v_sale.payment_method,'not_recorded') end;
 update public.aerosuite_hour_packs set voided_at=now(),voided_by=v_actor,
  voided_reason=v_reason,void_kind=p_kind where id=v_pack.id;
 if v_pack.paid_amount>0 then
  insert into public.aerosuite_money_movements(
   institution_id,student_id,pack_id,movement_type,amount,currency,description,created_by,payment_method,payment_reference)
  values(p_institution_id,v_pack.student_id,v_pack.id,
   case when p_kind='correction' then 'pack_reversal' else 'refund' end,
   v_pack.paid_amount,v_pack.currency,
   left((case when p_kind='correction' then 'Corrección de compra de pack registrada por error: ' else 'Devolución efectiva por anulación de pack: ' end)||v_reason,500),
   v_actor,v_payment,case when p_kind='refund' then left(btrim(coalesce(p_refund_reference,'')),120) else '' end)
  returning id into v_comp;
 end if;
 insert into public.aerosuite_pack_void_audit(
  institution_id,pack_id,student_id,actor_id,reason,kind,original_movement_id,compensating_movement_id)
 values(p_institution_id,v_pack.id,v_pack.student_id,v_actor,v_reason,p_kind,v_sale.id,v_comp);
 return jsonb_build_object('ok',true,'pack_id',v_pack.id,'mode',p_kind,'compensating_movement_id',v_comp);
end $function$
;
