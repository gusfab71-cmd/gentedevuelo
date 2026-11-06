-- Ejecutar EXCLUSIVAMENTE en Supabase Free: AeroSuite - Laboratorio Automatico.
-- Los perfiles ficticios se examinan con RLS de PostgreSQL. No son los RPC productivos.
-- Pre-requisito: 01_free_lab_contracts.sql, 02-04 del mismo directorio.

drop policy if exists "persona_consulta_reservas_de_su_institucion" on aerosuite_lab.bookings;
drop policy if exists "turnos_visibles_segun_rol" on aerosuite_lab.bookings;
create policy "turnos_visibles_segun_rol"
 on aerosuite_lab.bookings for select to authenticated
 using (
   exists(
    select 1 from aerosuite_lab.members m
    where m.id=(select auth.uid()) and m.institution_id=bookings.institution_id
      and (m.role in ('director','secretaria') or bookings.student_id=m.id
        or (m.role='instructor' and bookings.instructor_id=m.id))
   )
 );

CREATE OR REPLACE FUNCTION aerosuite_lab.visible_count_for(p_user uuid, p_table text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer;
begin
  if p_user is null or p_table not in ('bookings','members') then
    raise exception 'Parámetros de ensayo inválidos';
  end if;
  perform set_config('request.jwt.claim.sub',p_user::text,true);
  perform set_config('role','authenticated',true);
  if p_table='bookings' then
    select count(*) into n from aerosuite_lab.bookings;
  else
    select count(*) into n from aerosuite_lab.members;
  end if;
  perform set_config('role','none',true);
  perform set_config('request.jwt.claim.sub','',true);
  return n;
exception when others then
  perform set_config('role','none',true);
  perform set_config('request.jwt.claim.sub','',true);
  raise;
end;$function$

CREATE OR REPLACE FUNCTION aerosuite_lab.run_full_weekly()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  inst uuid:='11111111-1111-4111-8111-111111111111';
  plane uuid:='ffffffff-ffff-4fff-8fff-ffffffffffff';
  a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  b uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  instructor uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  ppa uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  outsider uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  pca uuid:='12345678-9999-4999-8999-123456789999';
  director uuid:='12345678-1111-4111-8111-123456789999';
  secretary uuid:='12345678-2222-4222-8222-123456789999';
  starts timestamptz:=date_trunc('day',now()-interval '3 days')+interval '12 hours';
  v_cases jsonb:='[]'::jsonb;
  expected integer; seen integer; rec record; p boolean;
  summary_id bigint; passed integer; failed integer; original_failed integer; original_checked integer;
begin
  -- Reutiliza y valida el circuito ficticio preexistente de diez escenarios.
  perform aerosuite_lab.run_weekly();

  insert into aerosuite_lab.members(id,institution_id,role,verified) values
    (director,inst,'director',true),
    (secretary,inst,'secretaria',true),
    (pca,inst,'pca',true);

  -- Un segundo alumno, un PPA habilitado y un PCA: cada reserva se hace por
  -- la función de laboratorio existente, que exige institución y estado.
  begin
    perform aerosuite_lab.reserve(b,instructor,plane,starts+interval '3 hours',90);
    v_cases:=v_cases||jsonb_build_array(jsonb_build_object('name','Segundo alumno: reserva sin superposición','pass',true));
  exception when others then
    v_cases:=v_cases||jsonb_build_array(jsonb_build_object('name','Segundo alumno: reserva sin superposición','pass',false,'error',sqlerrm));
  end;
  begin
    update aerosuite_lab.members set verified=true where members.id=ppa;
    perform aerosuite_lab.reserve(ppa,null,plane,starts+interval '5 hours',90);
    v_cases:=v_cases||jsonb_build_array(jsonb_build_object('name','Piloto PPA verificado: reserva sin instructor','pass',true));
  exception when others then
    v_cases:=v_cases||jsonb_build_array(jsonb_build_object('name','Piloto PPA verificado: reserva sin instructor','pass',false,'error',sqlerrm));
  end;
  begin
    perform aerosuite_lab.reserve(pca,null,plane,starts+interval '7 hours',90);
    v_cases:=v_cases||jsonb_build_array(jsonb_build_object('name','Piloto PCA verificado: reserva sin instructor','pass',true));
  exception when others then
    v_cases:=v_cases||jsonb_build_array(jsonb_build_object('name','Piloto PCA verificado: reserva sin instructor','pass',false,'error',sqlerrm));
  end;

  -- Exigir datos realmente filtrados por PostgreSQL RLS.
  -- Un alumno no puede ver reservas de otro alumno ni de pilotos de la misma institución.
  for rec in
    select * from (values
      ('Director',director,4),
      ('Secretaría',secretary,4),
      ('Instructor',instructor,2),
      ('Alumno A',a,1),
      ('Alumno B',b,1),
      ('Piloto PPA',ppa,1),
      ('Piloto PCA',pca,1),
      ('Usuario de otra institución',outsider,0)
    ) as v(label,user_id,visible)
  loop
    begin
      seen:=aerosuite_lab.visible_count_for(rec.user_id,'bookings');
      v_cases:=v_cases||jsonb_build_array(jsonb_build_object(
       'name','RLS reservas: '||rec.label,'pass',seen=rec.visible,
       'expected',rec.visible,'actual',seen));
    exception when others then
      v_cases:=v_cases||jsonb_build_array(jsonb_build_object(
        'name','RLS reservas: '||rec.label,'pass',false,'error',sqlerrm));
    end;
    begin
      seen:=aerosuite_lab.visible_count_for(rec.user_id,'members');
      v_cases:=v_cases||jsonb_build_array(jsonb_build_object(
       'name','RLS ficha propia: '||rec.label,'pass',seen=1,'expected',1,'actual',seen));
    exception when others then
      v_cases:=v_cases||jsonb_build_array(jsonb_build_object(
        'name','RLS ficha propia: '||rec.label,'pass',false,'error',sqlerrm));
    end;
  end loop;

  -- Privilegios: nunca escribir desde la API pública del laboratorio.
  v_cases:=v_cases||jsonb_build_array(jsonb_build_object(
    'name','API: alumno/instructor sin permiso INSERT en reservas',
    'pass',not has_table_privilege('authenticated','aerosuite_lab.bookings','INSERT')));
  v_cases:=v_cases||jsonb_build_array(jsonb_build_object(
    'name','API: alumno/instructor sin permiso UPDATE en reservas',
    'pass',not has_table_privilege('authenticated','aerosuite_lab.bookings','UPDATE')));
  v_cases:=v_cases||jsonb_build_array(jsonb_build_object(
    'name','API: alumno/instructor sin permiso DELETE en reservas',
    'pass',not has_table_privilege('authenticated','aerosuite_lab.bookings','DELETE')));
  v_cases:=v_cases||jsonb_build_array(jsonb_build_object(
    'name','API anónima: esquema privado no accesible',
    'pass',not has_schema_privilege('anon','aerosuite_lab','USAGE')));
  v_cases:=v_cases||jsonb_build_array(jsonb_build_object(
    'name','API: prohibida ejecución del motor de auditoría',
    'pass',not has_function_privilege('authenticated','aerosuite_lab.run_full_weekly()','EXECUTE')));
  v_cases:=v_cases||jsonb_build_array(jsonb_build_object(
    'name','API: prohibida ejecución del lector de identidades simuladas',
    'pass',not has_function_privilege('authenticated','aerosuite_lab.visible_count_for(uuid,text)','EXECUTE')));

  select count(*) filter(where not(coalesce((value->>'pass')::boolean,false))),
         count(*) filter(where coalesce((value->>'pass')::boolean,false))
   into failed,passed from jsonb_array_elements(v_cases) value;

  select s.id,s.failed_count,s.checked_count
   into summary_id,original_failed,original_checked
   from public.aerosuite_lab_audit_summaries s order by s.id desc limit 1;
  if summary_id is null then raise exception 'La auditoría anterior no registró sus resultados.';end if;
  update public.aerosuite_lab_audit_summaries
   set checked_count=original_checked+passed+failed,
       passed_count=passed_count+passed,
       failed_count=original_failed+failed,
       status=case when original_failed+failed=0 then 'PASS_SIMULATION' else 'FAIL_SIMULATION' end,
       cases=aerosuite_lab_audit_summaries.cases||v_cases,
       description='Contratos SQL ficticios + RLS real evaluada como seis perfiles simulados; NO son portales o RPC productivos'
   where aerosuite_lab_audit_summaries.id=summary_id;
  return jsonb_build_object('checked',original_checked+passed+failed,
   'passed',original_checked-original_failed+passed,'failed',original_failed+failed,
   'status',case when original_failed+failed=0 then 'PASS_SIMULATION' else 'FAIL_SIMULATION' end);
end;$function$


revoke all on function aerosuite_lab.visible_count_for(uuid,text) from public,anon,authenticated;
revoke all on function aerosuite_lab.run_full_weekly() from public,anon,authenticated;

-- Mismo cron gratuito; se reemplaza su comando sin crear un segundo job.
select cron.schedule('aerosuite-lab-integridad-lunes-0850-art',
 '50 11 * * 1', 'select aerosuite_lab.run_full_weekly()');
