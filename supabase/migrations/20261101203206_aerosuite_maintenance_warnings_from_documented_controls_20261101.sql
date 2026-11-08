-- Alertas orientativas: solo con intervalos configurados y último cumplimiento documentado.
-- Nunca significa aeronavegabilidad ni reemplaza la decisión técnica.
create or replace function public.aerosuite_maintenance_alerts(p_institution_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare
 v_actor uuid:=auth.uid();v_role text;v_mode text;
 v_payload jsonb;v_a jsonb;v_c jsonb;v_p jsonb;v_l jsonb;v_cp text;
 v_f public.aerosuite_aircraft_registry%rowtype;
 v_set jsonb:='[]'::jsonb;v_alerts jsonb;v_item jsonb;
 v_hours numeric;v_current numeric;v_iv numeric;v_last numeric;v_next numeric;v_remaining numeric;
 v_tbo numeric;v_tso numeric;v_name text;v_level text;
 v_basis text;v_ref text;v_last_date text;v_date_due date;v_months integer;
 v_count integer;v_total int:=0;v_initial boolean;v_missing boolean;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_role,v_mode from public.aerosuite_institutions i
 join public.aerosuite_institution_members m on m.institution_id=i.id
 where i.id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria','instructor') limit 1;
 if v_actor is null or v_role is null or v_mode is null or v_mode='blocked' then
  raise exception 'Sin autorización para revisar alertas de mantenimiento.' using errcode='42501';end if;
 select payload into v_payload from public.aerosuite_institution_maintenance where institution_id=p_institution_id;
 v_payload:=coalesce(v_payload,'{}'::jsonb);
 for v_f in select * from public.aerosuite_aircraft_registry
  where institution_id=p_institution_id and archived_at is null order by registration loop
  select a.value into v_a from jsonb_array_elements(coalesce(v_payload->'ac','[]'::jsonb)) a
  where upper(btrim(a.value->>'reg'))=upper(v_f.registration) limit 1;
  v_alerts:='[]'::jsonb;v_count:=0;
  v_initial:=v_a is null or coalesce(v_a->>'needs_initial_hours','true')='true';
  v_hours:=null;
  if not v_initial and coalesce(v_a->>'h','')~'^[0-9]{1,7}(\.[0-9]{1,3})?$' then v_hours:=(v_a->>'h')::numeric;end if;
  if v_initial then
   v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
    'level','notice','code','initial_hours','component','f','message',
    'Verificar y cargar las horas iniciales reales de célula, motor y hélice según sus registros. No se calcularon vencimientos ficticios.'));
  end if;
  for v_c in
   select c.value from jsonb_array_elements(coalesce(v_payload->'ct','[]'::jsonb)) c
   join jsonb_array_elements(coalesce(v_payload->'sv','[]'::jsonb)) sv
    on sv.value->>'id'=c.value->>'sv'
   where sv.value->>'ac'=v_a->>'id'
  loop
   if v_count>=25 then exit;end if;
   v_cp:=coalesce(v_c->>'cp','f');
   v_name:=left(coalesce(nullif(v_c->>'name',''),'Control de mantenimiento'),120);
   v_iv:=case when coalesce(v_c->>'ivH','')~'^[0-9]{1,7}(\.[0-9]{1,3})?$' then (v_c->>'ivH')::numeric else null end;
   v_last:=case when coalesce(v_c->>'lastH','')~'^[0-9]{1,7}(\.[0-9]{1,3})?$' then (v_c->>'lastH')::numeric else null end;
   v_basis:=coalesce(v_c->>'basis','');v_ref:=coalesce(v_c->>'lastRef','');
   v_last_date:=coalesce(v_c->>'lastDate','');
   v_current:=case when v_cp='f' then v_hours
    when v_cp='m' and coalesce(v_a#>>'{cp,m,h}','')~'^[0-9]{1,7}(\.[0-9]{1,3})?$' and not v_initial
     then (v_a#>>'{cp,m,h}')::numeric
    when v_cp='p' and coalesce(v_a#>>'{cp,p,h}','')~'^[0-9]{1,7}(\.[0-9]{1,3})?$' and not v_initial
     then (v_a#>>'{cp,p,h}')::numeric
    else null end;
   v_count:=v_count+1;
   if v_ref='' or v_basis='' or v_last_date='' or (coalesce(v_iv,0)>0 and v_last is null) then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
     'level','notice','code','missing_record','component',v_cp,'name',v_name,
     'message','Control "'||v_name||'": falta referencia del último cumplimiento o del programa; revisar documentación antes de calcular.'));
    continue;
   end if;
   if coalesce(v_iv,0)>0 and v_current is not null then
    v_next:=v_last+v_iv;v_remaining:=round(v_next-v_current,2);
    if v_remaining<=10 then
     v_level:=case when v_remaining<=0 then 'due' else 'soon' end;
     v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level',v_level,'code','hours','component',v_cp,'name',v_name,
      'interval_hours',v_iv,'next_hours',v_next,'remaining_hours',v_remaining,
      'message',v_name||' ('||case v_cp when 'm' then 'motor' when 'p' then 'hélice' else 'fuselaje' end||
       '): '||case when v_remaining<=0 then 'límite alcanzado o superado' else 'restan '||v_remaining||' h' end||
       ' para el control configurado ('||v_iv||' h).'));
    end if;
   end if;
   v_months:=case when coalesce(v_c->>'ivM','')~'^[0-9]{1,4}$' then (v_c->>'ivM')::int else 0 end;
   if v_months>0 and v_last_date~'^\d{4}-\d{2}-\d{2}$' then
    v_date_due:=(v_last_date::date+make_interval(months=>v_months))::date;
    if v_date_due<=current_date+45 then
     v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level',case when v_date_due<=current_date then 'due' else 'soon' end,
      'code','calendar','component',v_cp,'name',v_name,
      'due_date',v_date_due,'message',v_name||': fecha configurada '||v_date_due||'.'));
    end if;
   end if;
  end loop;
  -- TBO de motor y hélice, independientes; se usa exclusivamente el intervalo con fuente declarada.
  if not v_initial and v_a is not null then
   foreach v_cp in array array['m','p'] loop
    v_tbo:=case when coalesce(v_a#>>array['cp',v_cp,'tbo'],'')~'^[0-9]{1,7}(\.[0-9]{1,3})?$' then
     (v_a#>>array['cp',v_cp,'tbo'])::numeric else null end;
    v_tso:=case when coalesce(v_a#>>array['cp',v_cp,'tso'],'')~'^[0-9]{1,7}(\.[0-9]{1,3})?$' then
     (v_a#>>array['cp',v_cp,'tso'])::numeric else null end;
    v_basis:=coalesce(v_a#>>array['cp',v_cp,'tboRef'],'');
    if coalesce(v_tbo,0)>0 and v_tso is not null and v_basis<>'' then
     v_remaining:=round(v_tbo-v_tso,2);
     if v_remaining<=10 then
      v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
       'level',case when v_remaining<=0 then 'due' else 'soon' end,
       'code','tbo','component',v_cp,'remaining_hours',v_remaining,
       'message','TBO de '||case when v_cp='m' then 'motor' else 'hélice' end||
         ': restan '||v_remaining||' h según el límite registrado. Verificar manual y componente real.'));
     end if;
    end if;
   end loop;
  end if;
  -- Un equipo sin ficha de mantenimiento no puede describirse como "sin alertas".
  if v_count=0 and not exists(select 1 from jsonb_array_elements(coalesce(v_payload->'ip','[]'::jsonb)) p
     where p.value->>'ac'=v_a->>'id' and coalesce(p.value->>'archived','false')<>'true') then
   v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
    'level','notice','code','no_controls','component','f',
    'message','Todavía no hay controles e inspecciones configurados; verificar el programa de mantenimiento y las libretas.'));
  end if;
  v_total:=v_total+jsonb_array_length(v_alerts);
  v_set:=v_set||jsonb_build_array(jsonb_build_object(
   'registration',v_f.registration,'model',v_f.model,'availability',v_f.availability,
   'current_airframe_hours',v_hours,'alerts',v_alerts,'configured_controls',v_count,
   'initial_hours_pending',v_initial));
 end loop;
 return jsonb_build_object('aircraft',v_set,'total_alerts',v_total,
  'disclaimer','Avisos auxiliares basados solo en registros cargados. No certifican aeronavegabilidad ni autorizan el vuelo.');
end $fn$;
revoke all on function public.aerosuite_maintenance_alerts(uuid) from public,anon;
grant execute on function public.aerosuite_maintenance_alerts(uuid) to authenticated;
