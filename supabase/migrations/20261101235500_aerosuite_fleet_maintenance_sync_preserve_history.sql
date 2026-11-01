-- Sincronización no destructiva del inventario de Flota con fichas técnicas de Mantenimiento.
-- Conserva identificadores, históricos, contadores y planes existentes.
create or replace function public.aerosuite_maintenance_sync_fleet(p_institution_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_actor uuid:=auth.uid(); v_mode text; v_row public.aerosuite_institution_maintenance%rowtype;
 v_ac jsonb;v_ac_new jsonb;v_entry jsonb;v_updated jsonb;v_result jsonb;v_key text;
 v_f public.aerosuite_aircraft_registry%rowtype;
 v_i int;v_num int;v_count int:=0;v_new int:=0;
 v_selected text;v_sel_active boolean;v_first text;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode from public.aerosuite_institutions i
 join public.aerosuite_institution_members m on m.institution_id=i.id
 where i.id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','grace','active') then
  raise exception 'Solo Dirección y Secretaría pueden sincronizar mantenimiento.' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 insert into public.aerosuite_institution_maintenance(institution_id)
 values(p_institution_id) on conflict(institution_id) do nothing;
 select * into v_row from public.aerosuite_institution_maintenance where institution_id=p_institution_id for update;
 v_result:=v_row.payload;
 v_ac:=coalesce(v_result->'ac','[]'::jsonb);
 if jsonb_typeof(v_ac)<>'array' then raise exception 'Ficha de mantenimiento inválida.' using errcode='22023';end if;
 -- Primero conservar cada ficha y ajustar solo modelo/estado si existe en Flota.
 v_ac_new:='[]'::jsonb;
 for v_entry in select value from jsonb_array_elements(v_ac) loop
  select * into v_f from public.aerosuite_aircraft_registry f
  where f.institution_id=p_institution_id and upper(f.registration)=upper(btrim(v_entry->>'reg'))
  limit 1;
  v_updated:=v_entry;
  if found then
   v_updated:=jsonb_set(v_updated,'{archived}',to_jsonb(v_f.archived_at is not null),true);
   if coalesce(v_f.model,'')<>'' and coalesce(v_entry->>'type','')<>v_f.model then
    v_updated:=jsonb_set(v_updated,'{type}',to_jsonb(v_f.model),true);
   end if;
  else
   -- Ficha legada no identificada: conservada como antecedente, no ofrecer para nuevas operaciones.
   v_updated:=jsonb_set(v_updated,'{archived}','true'::jsonb,true);
  end if;
  if v_updated is distinct from v_entry then v_count:=v_count+1;end if;
  v_ac_new:=v_ac_new||jsonb_build_array(v_updated);
 end loop;
 -- Alta de cada aeronave registrada que todavía carece de ficha técnica.
 for v_f in select * from public.aerosuite_aircraft_registry f
  where f.institution_id=p_institution_id and f.archived_at is null order by f.created_at loop
  if exists(select 1 from jsonb_array_elements(v_ac_new) x where upper(btrim(x->>'reg'))=upper(v_f.registration)) then continue;end if;
  if jsonb_array_length(v_ac_new)>=50 then raise exception 'El módulo de mantenimiento alcanzó su capacidad de fichas.' using errcode='22023';end if;
  v_updated:=jsonb_build_object(
   'id',v_f.id::text,'reg',v_f.registration,'type',coalesce(nullif(v_f.model,''),'Modelo pendiente'),
   'h',0,'c',0,'hpm',0,'cpm',0,'archived',false,'needs_initial_hours',true,
   'technical',jsonb_build_object('source','Flota AeroSuite'),
   'operation',jsonb_build_object('use','unknown','compensation','unknown','operator','','program',''),
   'cp',jsonb_build_object(
    'f',jsonb_build_object('mod','','ser',''),
    'm',jsonb_build_object('mod','','ser','','h',0,'c',0,'tso',0,'tbo',0,'tboY',0,'oh','','tboRef',''),
    'p',jsonb_build_object('mod','','ser','','h',0,'c',0,'tso',0,'tbo',0,'tboY',0,'oh','','tboRef','')
   )
  );
  v_ac_new:=v_ac_new||jsonb_build_array(v_updated);
  v_count:=v_count+1;v_new:=v_new+1;
 end loop;
 if v_count=0 then return jsonb_build_object('ok',true,'created',0,'updated',0,'revision',v_row.revision);end if;
 v_result:=jsonb_set(v_result,'{ac}',v_ac_new,true);
 v_selected:=v_result->>'sel';
 select value->>'id' into v_first from jsonb_array_elements(v_ac_new)
 where coalesce(value->>'archived','false')='false' limit 1;
 select exists(select 1 from jsonb_array_elements(v_ac_new) x
  where x->>'id'=v_selected and coalesce(x->>'archived','false')='false') into v_sel_active;
 if not coalesce(v_sel_active,false) then
  v_result:=jsonb_set(v_result,'{sel}',case when v_first is null then 'null'::jsonb else to_jsonb(v_first) end,true);
 end if;
 update public.aerosuite_institution_maintenance set payload=v_result,revision=v_row.revision+1,
  updated_by=v_actor,updated_at=now() where institution_id=p_institution_id;
 insert into public.aerosuite_institution_maintenance_audit(institution_id,from_revision,to_revision,actor_id)
 values(p_institution_id,v_row.revision,v_row.revision+1,v_actor);
 return jsonb_build_object('ok',true,'created',v_new,'updated',v_count-v_new,'revision',v_row.revision+1);
end $fn$;
revoke all on function public.aerosuite_maintenance_sync_fleet(uuid) from public,anon;
grant execute on function public.aerosuite_maintenance_sync_fleet(uuid) to authenticated;
