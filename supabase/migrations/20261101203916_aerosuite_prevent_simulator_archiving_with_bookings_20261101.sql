CREATE OR REPLACE FUNCTION public.aerosuite_simulator_action(p_institution_id uuid, p_action text, p_simulator_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_model text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid(); v_mode text;
 v_id uuid;v_sim public.aerosuite_simulators%rowtype;
 v_prev jsonb;v_after jsonb;
 v_name text:=btrim(coalesce(p_name,''));
 v_reason text:=btrim(coalesce(p_reason,''));
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección y Secretaría pueden gestionar simuladores.' using errcode='42501';end if;
 if p_action not in('create','out_of_service','available','archive','restore') then
  raise exception 'Acción de simulador inválida.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 if p_action='create' then
  if length(v_name) not between 2 and 90 or length(coalesce(p_model,''))>100 then
   raise exception 'Completá el nombre del simulador (2 a 90 caracteres).' using errcode='22023';end if;
  if exists(select 1 from public.aerosuite_simulators s
    where s.institution_id=p_institution_id and lower(s.name)=lower(v_name)) then
   raise exception 'Ya existe un simulador con ese nombre. Si fue archivado, reincorporalo.' using errcode='23505';end if;
  insert into public.aerosuite_simulators(institution_id,name,model,created_by,updated_by)
  values(p_institution_id,v_name,btrim(coalesce(p_model,'')),v_actor,v_actor) returning id into v_id;
  v_prev:=null;
 else
  select * into v_sim from public.aerosuite_simulators
   where id=p_simulator_id and institution_id=p_institution_id for update;
  if not found then raise exception 'El simulador no existe en esta institución.' using errcode='P0002';end if;
  v_id:=v_sim.id;v_prev:=to_jsonb(v_sim);
  if p_action='archive' then
   if exists(
    select 1 from public.aerosuite_activity_reservations r
    join public.aerosuite_availability_slots s on s.id=r.slot_id
    where s.institution_id=p_institution_id and s.activity='simulator'
      and lower(s.resource_label)=lower(v_sim.name)
      and s.starts_at>now() and r.status in('pending','confirmed','completed')
   ) then
    raise exception 'Este simulador tiene reservas futuras. Reprogramalas o cancelalas antes de retirarlo.' using errcode='22023';
   end if;
   if v_sim.archived_at is not null then raise exception 'Este simulador ya está archivado.' using errcode='22023';end if;
   if length(v_reason)<5 or length(v_reason)>300 then raise exception 'Indicá un motivo de baja (5 a 300 caracteres).' using errcode='22023';end if;
   update public.aerosuite_simulators set archived_at=now(),archived_reason=v_reason,
    availability='out_of_service',out_of_service_reason=v_reason,
    updated_by=v_actor,updated_at=now() where id=v_id;
  elsif p_action='restore' then
   if v_sim.archived_at is null then raise exception 'El simulador no está archivado.' using errcode='22023';end if;
   update public.aerosuite_simulators set archived_at=null,archived_reason='',
    availability='out_of_service',updated_by=v_actor,updated_at=now() where id=v_id;
  else
   if v_sim.archived_at is not null then raise exception 'Primero reincorporá el simulador archivado.' using errcode='22023';end if;
   if length(v_reason)<5 or length(v_reason)>300 then
    raise exception 'Indicá el motivo del cambio (5 a 300 caracteres).' using errcode='22023';end if;
   update public.aerosuite_simulators
   set availability=case when p_action='available' then 'available' else 'out_of_service' end,
       out_of_service_reason=case when p_action='available' then '' else v_reason end,
       updated_by=v_actor,updated_at=now()
   where id=v_id;
  end if;
 end if;
 select to_jsonb(s) into v_after from public.aerosuite_simulators s where s.id=v_id;
 insert into public.aerosuite_simulator_audit(institution_id,simulator_id,actor_id,event,reason,before_data,after_data)
 values(p_institution_id,v_id,v_actor,p_action,v_reason,v_prev,v_after);
 return jsonb_build_object('ok',true,'simulator_id',v_id,'action',p_action,'name',v_after->>'name');
end $function$
;