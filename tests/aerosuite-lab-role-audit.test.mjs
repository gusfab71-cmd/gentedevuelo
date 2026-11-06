import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {REQUIRED_RLS_CASES,verifyRlsCases} from '../utilidades/gestion-aeronautica/aerosuite-lab-roles.js';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const all=[...REQUIRED_RLS_CASES.map(name=>({name,pass:true})),
 ...Array.from({length:13},(_,i)=>({name:'Escenario SQL ficticio '+i,pass:true}))];
const green={status:'PASS_SIMULATION',stale:false,checked:35,passed:35,failed:0,cases:all};
test('La auditoría exige cada uno de los seis perfiles y el aislamiento institucional',()=>{
 assert.equal(REQUIRED_RLS_CASES.length,22);
 assert.equal(verifyRlsCases(green).profileCount,6);
 assert.equal(verifyRlsCases(green).verified,22);
});
test('Un resultado global correcto no oculta una prueba de permisos ausente',()=>{
 const missing={...green,cases:all.map(x=>x.name===REQUIRED_RLS_CASES[0]?{name:'otra',pass:true}:x)};
 assert.throws(()=>verifyRlsCases(missing),/ausente/);
});
test('No aceptar comprobaciones duplicadas, fallidas, desactualizadas ni parciales',()=>{
 const duplicated={...green,cases:[all[0],...all.slice(0,-1)]};
 assert.throws(()=>verifyRlsCases(duplicated),/duplicado/);
 const failed={...green,cases:all.map((x,i)=>i===0?{...x,pass:false}:x)};
 assert.throws(()=>verifyRlsCases(failed),/fallido/);
 assert.throws(()=>verifyRlsCases({...green,stale:true}),/incompleto/);
 assert.throws(()=>verifyRlsCases({...green,checked:34}),/incompleto/);
 assert.throws(()=>verifyRlsCases({...green,status:'FAIL_SIMULATION'}),/incompleto/);
});
test('La consulta usa el segundo proyecto y un token exclusivamente público',()=>{
 const src=read('utilidades/gestion-aeronautica/aerosuite-lab-client.js');
 assert.match(src,/sb_publishable_/);
 assert.doesNotMatch(src,/(service.role|sb_secret_|supabase_service_role_key)/i);
 assert.match(src,/aerosuite_lab_audit_summaries\?select=/);
});
test('La migración distingue alumno, instructor y administración e impide acceso entre escuelas',()=>{
 const sql=read('supabase/laboratory/05_six_role_rls.sql');
 assert.match(sql,/m\.institution_id=bookings\.institution_id/);
 assert.match(sql,/m\.role in \('director','secretaria'\)/);
 assert.match(sql,/bookings\.student_id=m\.id/);
 assert.match(sql,/m\.role='instructor' and bookings\.instructor_id=m\.id/);
 assert.match(sql,/perform set_config\('role','authenticated',true\)/);
 assert.match(sql,/revoke all on function aerosuite_lab\.run_full_weekly\(\) from public,anon,authenticated/);
 assert.match(sql,/cron\.schedule\('aerosuite-lab-integridad-lunes-0850-art'/);
});
