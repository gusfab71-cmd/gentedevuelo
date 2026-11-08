'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const base=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(base,'supabase/migrations/20261108055418_aerosuite_pilot_preflight_documentary_gate_20261108.sql'),'utf8');
const page=fs.readFileSync(path.join(base,'utilidades/gestion-aeronautica/operaciones-institucionales.html'),'utf8');

test('La revisión de predespacho es un documento de auditoría, no una autorización de salida',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.aerosuite_pilot_dispatch_reviews/);
 assert.match(sql,/outcome text NOT NULL CHECK\(outcome IN \('checked','blocked'\)\)/);
 assert.match(sql,/ALTER TABLE public\.aerosuite_pilot_dispatch_reviews ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public\.aerosuite_pilot_dispatch_reviews FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/'dispatched',false/);
 assert.match(sql,/NO autoriza ni registra una salida real/);
 assert.doesNotMatch(sql,/UPDATE\s+public\.aerosuite_flight_bookings\s+SET\s+status/i);
});
test('La vigencia de la revisión se invalida al cambiar la reserva, documentación o mantenimiento',()=>{
 for(const signature of ['booking_updated_at','booking_starts_at','credential_updated_at','authorization_updated_at','aircraft_updated_at','maintenance_revision'])
  assert.match(sql,new RegExp('v_r\\.'+signature+' IS NOT DISTINCT FROM v_'));
 assert.match(sql,/v_r\.valid_until>=now\(\)/);
 assert.match(sql,/now\(\)\+interval '15 minutes'/);
 assert.match(sql,/v_b\.starts_at>now\(\)\+interval '4 hours'/);
});
test('El servidor consulta autorizaciones y CMA actuales y bloquea flota sin controles o vencida',()=>{
 assert.match(sql,/aerosuite_pilot_documents_valid\(v_b\.student_id,v_today\)/);
 assert.match(sql,/aerosuite_pilot_documents_valid\(v_b\.student_id,/);
 assert.match(sql,/v_pa\.status IS DISTINCT FROM 'verified'/);
 assert.match(sql,/v_ac\.availability<>'available'/);
 assert.match(sql,/public\.aerosuite_maintenance_alerts\(p_institution_id\)/);
 assert.match(sql,/a\.value->>'level'='due' OR a\.value->>'code'='no_controls'/);
 assert.match(sql,/initial_hours_pending/);
});
test('Solo Director/Secretaría pueden registrar revisión; el piloto solo ve su propia reserva',()=>{
 assert.match(sql,/m\.role IN \('administrador','secretaria'\)/);
 assert.match(sql,/v_role='piloto' AND v_b\.student_id IS DISTINCT FROM v_actor/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.aerosuite_pilot_dispatch_status\(uuid,uuid\) FROM PUBLIC,anon/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.aerosuite_pilot_dispatch_review\(uuid,uuid,text\) FROM PUBLIC,anon/);
});
test('Pantalla alerta NO DESPACHAR y permite revalidar sin cambiar el estado del vuelo',()=>{
 assert.match(page,/aerosuite_pilot_dispatch_status/);
 assert.match(page,/aerosuite_pilot_dispatch_review/);
 assert.match(page,/NO DESPACHAR/);
 assert.match(page,/Revisar documentación antes de salida/);
 assert.match(page,/NO constituye autorización de vuelo/);
 for(const [,script] of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(script.trim())assert.doesNotThrow(()=>new vm.Script(script));
 }
});
