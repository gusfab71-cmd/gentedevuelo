-- PROPUESTA: alertas integrales y bloqueo transaccional de publicación.
-- No altera aeronaves, cuentas ni turnos publicados anteriormente.
-- Exige constancias y límites registrados; no deduce aptitud de vuelo.
-- Inspecciones: sin constancia/aplicabilidad => aviso, rechazadas/vencidas => bloqueo.
-- DA: sin constancia/aplicabilidad => aviso, fecha/horas vencidas => bloqueo.
-- Novedades abiertas => aviso, no presunción de no aeronavegabilidad.
-- El servidor bloquea únicamente nuevas publicaciones cuando hay level=due.

CREATE OR REPLACE FUNCTION public.aerosuite_maintenance_alerts(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_role text;v_mode text;
 v_payload jsonb;v_a jsonb;v_c jsonb;v_p jsonb;v_l jsonb;v_cp text;
 v_f public.aerosuite_aircraft_registry%rowtype;
 v_set jsonb:='[]'::jsonb;v_alerts jsonb;v_item jsonb;
 v_hours numeric;v_current numeric;v_iv numeric;v_last numeric;v_next numeric;v_remaining numeric;
 v_tbo numeric;v_tso numeric;v_name text;v_level text;
 v_basis text;v_ref text;v_last_date text;v_date_due date;v_months integer;v_alert_before_hours numeric;
 v_count integer;v_total int:=0;v_initial boolean;v_missing boolean;
 v_plan jsonb;v_record jsonb;v_rule jsonb;v_ad jsonb;v_dx jsonb;
 v_plan_id text;v_kind text;v_applies text;v_plan_title text;v_code text;
 v_examined int;v_annual record;v_due_hours numeric;v_date_text text;
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
   v_alert_before_hours:=case when coalesce(v_c->>'alertBeforeHours','') ~ '^[0-9]{1,4}(\.[0-9]{1,2})?$'
 then least((v_c->>'alertBeforeHours')::numeric,1000) else 10 end;
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
    if v_remaining<=v_alert_before_hours then
     v_level:=case when v_remaining<=0 then 'due' else 'soon' end;
     v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level',v_level,'code','hours','component',v_cp,'name',v_name,
      'interval_hours',v_iv,'alert_before_hours',v_alert_before_hours,'next_hours',v_next,'remaining_hours',v_remaining,
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

  -- Inspecciones con aplicabilidad confirmada y último asiento firmado.
  -- Una inspección anual aprobada puede reiniciar el cómputo del período de 100 h.
  v_examined:=0;
  for v_plan in select ip.value from jsonb_array_elements(coalesce(v_payload->'ip','[]'::jsonb)) ip
   where ip.value->>'ac'=v_a->>'id' and coalesce(ip.value->>'archived','false')<>'true'
  loop
   v_examined:=v_examined+1;if v_examined>100 then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
     'level','notice','code','inspection_limit','message','Demasiadas inspecciones; revisar el registro completo.'));
    exit;
   end if;
   v_plan_id:=v_plan->>'id';v_kind:=coalesce(v_plan->>'kind','manual');
   v_applies:=coalesce(v_plan->>'applies','undecided');
   v_plan_title:=left(coalesce(nullif(v_plan->>'title',''),'Inspección sin título'),140);
   if v_applies='no' then continue;end if;
   if v_applies<>'yes' then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level','notice','code','inspection_applicability','name',v_plan_title,
      'message','Inspección '||v_plan_title||': confirmar aplicabilidad según régimen y programa.'));
    continue;
   end if;
   v_record:=null;
   if v_kind='cien' then
    select ie.value into v_record from jsonb_array_elements(coalesce(v_payload->'ie','[]'::jsonb)) ie
    where ie.value->>'planId'=v_plan_id or (
      ie.value->>'result'='approved' and exists(
       select 1 from jsonb_array_elements(coalesce(v_payload->'ip','[]'::jsonb)) annual
       where annual.value->>'id'=ie.value->>'planId' and annual.value->>'ac'=v_a->>'id'
        and coalesce(annual.value->>'archived','false')<>'true'
        and annual.value->>'kind'='anual' and annual.value->>'applies'='yes'))
    order by case when coalesce(ie.value->>'h','')~'^[0-9]{1,7}(\.[0-9]{1,3})?
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
end $function$

      then (ie.value->>'h')::numeric else -1 end desc,
     ie.value->>'date' desc limit 1;
   else
    select ie.value into v_record from jsonb_array_elements(coalesce(v_payload->'ie','[]'::jsonb)) ie
    where ie.value->>'planId'=v_plan_id
    order by ie.value->>'date' desc,ie.value->>'added' desc limit 1;
   end if;
   if v_record is null then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level','notice','code','inspection_missing_record','name',v_plan_title,
      'message','Inspección '||v_plan_title||': sin constancia firmada cargada; no se deduce vencimiento.'));
    continue;
   end if;
   if v_record->>'result'='rejected' then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level','due','code','inspection_rejected','name',v_plan_title,
      'message','Inspección '||v_plan_title||': último resultado NO APROBADO según constancia.'));
    continue;
   end if;
   if v_record->>'result'<>'approved' or coalesce(v_record->>'doc','')='' then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level','notice','code','inspection_unverified','name',v_plan_title,
      'message','Inspección '||v_plan_title||': revisar resultado y referencia de constancia.'));
    continue;
   end if;
   v_last:=case when coalesce(v_record->>'h','')~'^[0-9]{1,7}(\.[0-9]{1,3})?
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
end $function$

     then (v_record->>'h')::numeric else null end;
   v_iv:=case when coalesce(v_plan->>'hours','')~'^[0-9]{1,7}(\.[0-9]{1,3})?
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
end $function$

     then (v_plan->>'hours')::numeric else null end;
   if coalesce(v_iv,0)>0 then
    if v_last is null or v_hours is null then
     v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
       'level','notice','code','inspection_unknown_hours','name',v_plan_title,
       'message','Inspección '||v_plan_title||': faltan horas verificadas para calcular límite.'));
    else
     v_remaining:=round(v_last+v_iv-v_hours,2);
     if v_remaining<=10 then
      v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
       'level',case when v_remaining<=0 then 'due' else 'soon' end,
       'code','inspection_hours','name',v_plan_title,'remaining_hours',v_remaining,
       'message','Inspección '||v_plan_title||': '||
        case when v_remaining<=0 then 'límite de horas alcanzado o excedido' else 'restan '||v_remaining||' h' end||'.'));
     end if;
    end if;
   end if;
   v_months:=case when coalesce(v_plan->>'months','')~'^[0-9]{1,4}
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
end $function$

    then (v_plan->>'months')::int else 0 end;
   v_date_text:=coalesce(v_record->>'date','');
   if v_months>0 and v_date_text~'^\d{4}-\d{2}-\d{2}
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
end $function$
 then
    -- Ajustar el último día del mes, tal como hace la ficha visual.
    v_date_due:=(date_trunc('month',v_date_text::date)::date+
      make_interval(months=>v_months))::date+
      least(extract(day from v_date_text::date)::int,
       extract(day from ((date_trunc('month',v_date_text::date)::date+
        make_interval(months=>v_months+1))::date-1))::int)-1;
    if v_date_due<=current_date+45 then
     v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level',case when v_date_due<=current_date then 'due' else 'soon' end,
      'code','inspection_calendar','name',v_plan_title,'due_date',v_date_due,
      'message','Inspección '||v_plan_title||': vencimiento por calendario '||v_date_due||'.'));
    end if;
   elsif v_months>0 then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
     'level','notice','code','inspection_missing_date','name',v_plan_title,
     'message','Inspección '||v_plan_title||': falta fecha válida de último cumplimiento.'));
   end if;
  end loop;

  -- Directivas de aeronavegabilidad asentadas: respetar la aplicabilidad
  -- documentada y el contador del componente real.
  v_examined:=0;
  for v_ad in select ad.value from jsonb_array_elements(coalesce(v_payload->'ad','[]'::jsonb)) ad
   where ad.value->>'ac'=v_a->>'id'
  loop
   v_examined:=v_examined+1;if v_examined>100 then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
     'level','notice','code','ad_limit','message','Demasiadas DA cargadas; revisar el registro completo.'));
    exit;
   end if;
   v_name:=left(coalesce(nullif(v_ad->>'number',''),'sin identificación'),90);
   v_applies:=coalesce(v_ad->>'applies','unknown');
   if v_applies='no' then continue;end if;
   if v_applies<>'yes' then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
     'level','notice','code','ad_applicability','name',v_name,
     'message','DA '||v_name||': evaluar aplicabilidad para esta matrícula y componentes.'));
    continue;
   end if;
   if coalesce(v_ad->>'compDate','')='' or coalesce(v_ad->>'doc','')='' or coalesce(v_ad->>'method','')='' then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
     'level','notice','code','ad_missing_record','name',v_name,
     'message','DA '||v_name||': falta constancia de cumplimiento; revisar antes de operar.'));
    continue;
   end if;
   v_cp:=coalesce(v_ad->>'cp','f');
   v_current:=case when v_cp='f' then v_hours
     when v_cp in ('m','p') and coalesce(v_a#>>array['cp',v_cp,'h'],'')~'^[0-9]{1,7}(\.[0-9]{1,3})?
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
end $function$

       and not v_initial then (v_a#>>array['cp',v_cp,'h'])::numeric
     else null end;
   v_date_text:=coalesce(v_ad->>'nextDate','');
   if v_date_text~'^\d{4}-\d{2}-\d{2}
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
end $function$
 then
    v_date_due:=v_date_text::date;
    if v_date_due<=current_date+45 then
     v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level',case when v_date_due<=current_date then 'due' else 'soon' end,
      'code','ad_calendar','name',v_name,'due_date',v_date_due,
      'message','DA '||v_name||': próximo vencimiento por fecha '||v_date_due||'.'));
    end if;
   end if;
   v_due_hours:=case when coalesce(v_ad->>'nextH','')~'^[0-9]{1,7}(\.[0-9]{1,3})?
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
end $function$

      then (v_ad->>'nextH')::numeric else null end;
   if v_due_hours is not null then
    if v_current is null then
     v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'level','notice','code','ad_unknown_hours','name',v_name,
      'message','DA '||v_name||': falta contador de '||v_cp||' para calcular el vencimiento.'));
    else
     v_remaining:=round(v_due_hours-v_current,2);
     if v_remaining<=10 then
      v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
       'level',case when v_remaining<=0 then 'due' else 'soon' end,
       'code','ad_hours','name',v_name,'remaining_hours',v_remaining,
       'message','DA '||v_name||': '||case when v_remaining<=0
        then 'límite de horas alcanzado o excedido' else 'restan '||v_remaining||' h' end||'.'));
     end if;
    end if;
   end if;
  end loop;

  -- Una novedad técnica abierta requiere evaluación, pero su sola
  -- existencia no implica automáticamente que la aeronave sea no aeronavegable.
  v_examined:=0;
  for v_dx in select dx.value from jsonb_array_elements(coalesce(v_payload->'dx','[]'::jsonb)) dx
   where dx.value->>'ac'=v_a->>'id' and coalesce(dx.value->>'status','open')<>'closed'
  loop
   v_examined:=v_examined+1;if v_examined>50 then
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
     'level','notice','code','discrepancy_limit','message','Demasiadas novedades abiertas; revisar el registro completo.'));
    exit;
   end if;
   v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
    'level','notice','code','open_discrepancy',
    'message','Novedad técnica abierta: '||
     left(coalesce(nullif(v_dx->>'description',''),'sin descripción'),140)||
     '. Requiere evaluación y tratamiento documental.'));
  end loop;

  -- Mostrar primero avisos vencidos, luego próximos y por último datos incompletos.
  select coalesce(jsonb_agg(a.value order by
    case a.value->>'level' when 'due' then 0 when 'soon' then 1 else 2 end),'[]'::jsonb)
    into v_alerts from jsonb_array_elements(v_alerts) a;

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
end $function$


-- Barrera transaccional en toda publicación de vuelos:
-- cubre publish, publish_week y cualquier otro acceso que pretenda
-- publicar directamente una fila; no cambia vuelos ya publicados.
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_guard_published_flight_maintenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_all jsonb;v_aircraft jsonb;v_error text;
begin
 if new.activity<>'flight' or new.published_at is null then return new;end if;
 if tg_op='UPDATE' and old.published_at is not null then return new;end if;
 if v_actor is null then
  raise exception 'No se puede publicar un vuelo sin identidad institucional válida.'
   using errcode='42501';
 end if;
 v_all:=public.aerosuite_maintenance_alerts(new.institution_id);
 select aircraft.value into v_aircraft from jsonb_array_elements(coalesce(v_all->'aircraft','[]'::jsonb)) aircraft
  where upper(btrim(aircraft.value->>'registration'))=upper(btrim(new.resource_label)) limit 1;
 if v_aircraft is null then
  raise exception 'No se pudo verificar el mantenimiento de la matrícula. Revisá Flota antes de publicar.'
   using errcode='22023';
 end if;
 select left(coalesce(alert.value->>'message','Vencimiento de mantenimiento registrado'),350)
  into v_error from jsonb_array_elements(coalesce(v_aircraft->'alerts','[]'::jsonb)) alert
  where alert.value->>'level'='due' limit 1;
 if v_error is not null then
  raise exception 'Publicación bloqueada por vencimiento de mantenimiento en %: %',
   new.resource_label,v_error using errcode='22023';
 end if;
 return new;
end $function$;
REVOKE ALL ON FUNCTION aerosuite_internal.aerosuite_guard_published_flight_maintenance() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS aerosuite_guard_flight_maintenance_publish ON public.aerosuite_availability_slots;
CREATE TRIGGER aerosuite_guard_flight_maintenance_publish
 BEFORE INSERT OR UPDATE OF published_at ON public.aerosuite_availability_slots
 FOR EACH ROW
 EXECUTE FUNCTION aerosuite_internal.aerosuite_guard_published_flight_maintenance();
