'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'docs/aerosuite-propuesta-alertas-inspecciones-da-novedades-y-bloqueo-servidor-2026-11-08.sql'),'utf8');
const agenda=fs.readFileSync(path.join(root,'utilidades/gestion-aeronautica/aerosuite-agenda-publicada.js'),'utf8');

test('Mantiene contrato de alertas y no inventa intervalos de mantenimiento',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.aerosuite_maintenance_alerts\(p_institution_id uuid\)/);
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/SET search_path TO ''/);
 assert.match(sql,/coalesce\(v_payload->'ct','\[\]'::jsonb\)/);
 assert.match(sql,/coalesce\(v_payload->'ip','\[\]'::jsonb\)/);
 assert.match(sql,/coalesce\(v_payload->'ad','\[\]'::jsonb\)/);
 assert.match(sql,/coalesce\(v_payload->'dx','\[\]'::jsonb\)/);
 assert.doesNotMatch(sql,/UPDATE\s+public\.aerosuite_aircraft_registry|DELETE\s+FROM\s+public\.aerosuite_aircraft_registry/i);
});
test('Inspecciones: aplicabilidad, anual aprobada, 100 h, rechazada y sin constancia',()=>{
 assert.match(sql,/v_applies<>'yes'/);
 assert.match(sql,/'code','inspection_applicability'/);
 assert.match(sql,/annual\.value->>'kind'='anual' and annual\.value->>'applies'='yes'/);
 assert.match(sql,/ie\.value->>'result'='approved'/);
 assert.match(sql,/'code','inspection_missing_record'/);
 assert.match(sql,/v_record->>'result'='rejected'/);
 assert.match(sql,/'level','due','code','inspection_rejected'/);
 assert.match(sql,/'code','inspection_hours'/);
 assert.match(sql,/'code','inspection_calendar'/);
 assert.match(sql,/least\(extract\(day from v_date_text::date\)::int/);
 assert.match(sql,/America\/Argentina\/Buenos_Aires/);
});
test('DA: sin evidencia son avisos, límites fechados o en horas pasan a due',()=>{
 assert.match(sql,/'code','ad_applicability'/);
 assert.match(sql,/'code','ad_missing_record'/);
 assert.match(sql,/'code','ad_calendar'/);
 assert.match(sql,/'code','ad_hours'/);
 assert.match(sql,/'level',case when v_date_due<=v_today then 'due' else 'soon' end/);
 assert.match(sql,/'level',case when v_remaining<=0 then 'due' else 'soon' end/);
});
test('Novedades abiertas se notifican sin presumir automáticamente no aeronavegabilidad',()=>{
 assert.match(sql,/coalesce\(dx\.value->>'status','open'\)<>'closed'/);
 assert.match(sql,/'level','notice','code','open_discrepancy'/);
 assert.doesNotMatch(sql,/'level','due','code','open_discrepancy'/);
 assert.match(sql,/No certifican aeronavegabilidad ni autorizan el vuelo/);
});
test('Publicación: barrera transaccional de servidor sin alterar turnos ya publicados',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION aerosuite_internal\.aerosuite_guard_published_flight_maintenance\(\)/);
 assert.match(sql,/BEFORE INSERT OR UPDATE OF published_at ON public\.aerosuite_availability_slots/);
 assert.match(sql,/new\.activity<>'flight' or new\.published_at is null then return new/);
 assert.match(sql,/if tg_op='UPDATE' then\s*if old\.published_at is not null then return new/);
 assert.match(sql,/v_actor uuid:=auth\.uid\(\)/);
 assert.match(sql,/if v_actor is null then/);
 assert.match(sql,/v_all:=public\.aerosuite_maintenance_alerts\(new\.institution_id\)/);
 assert.match(sql,/where alert\.value->>'level'='due' limit 1/);
 assert.match(sql,/raise exception 'Publicación bloqueada por vencimiento de mantenimiento/);
 assert.match(sql,/REVOKE ALL ON FUNCTION aerosuite_internal\.aerosuite_guard_published_flight_maintenance\(\) FROM PUBLIC,anon,authenticated/);
 assert.match(agenda,/const due=warnings\.filter\(w=>w\.level==="due"\)/);
});
test('El cambio SQL no borra ni modifica reservas, identidad, autorizaciones ni contabilidad',()=>{
 assert.doesNotMatch(sql,/\b(?:insert\s+into|update|delete\s+from|truncate)\s+(?:auth\.users|public\.aerosuite_activity_reservations|public\.aerosuite_institution_maintenance|public\.aerosuite_pilot_authorizations|public\.aerosuite_flight_bookings)/i);
 assert.doesNotMatch(sql,/\bupdate\s+public\.aerosuite_availability_slots\b/i);
 assert.match(sql,/No altera aeronaves, cuentas ni turnos publicados anteriormente/);
});
