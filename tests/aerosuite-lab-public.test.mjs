import test from 'node:test';
import assert from 'node:assert/strict';
import {getLabAudit,parseLabAudit,LAB_URL,LAB_PUBLIC_KEY,LAB_QUERY} from '../utilidades/gestion-aeronautica/aerosuite-lab-client.js';
const sample={run_at:new Date().toISOString(),checked_count:10,passed_count:10,failed_count:0,
 status:'PASS_SIMULATION',cases:[{name:'Reserva 90 min',pass:true,error:''}],description:'Solo DB ficticia'};
test('Informe válido de laboratorio siempre declara SIMULATION',()=>{
 const r=parseLabAudit([sample]);assert.equal(r.status,'PASS_SIMULATION');
 assert.equal(r.passed,10);assert.equal(r.failed,0);assert.equal(r.stale,false);
});
test('Nunca mostrar aprobaciones inventadas con sumas inconsistentes',()=>{
 assert.throws(()=>parseLabAudit([{...sample,failed_count:1}]),/inválido|inconsistente/);
 assert.throws(()=>parseLabAudit([{...sample,status:'APROBADO_PRODUCCION'}]),/inválido/);
 assert.equal(parseLabAudit([]),null);
});
test('Fuente pública de solo lectura, sin service_role',async()=>{
 assert.equal(new URL(LAB_URL).protocol,'https:');
 assert.match(LAB_PUBLIC_KEY,/^sb_publishable_/);
 assert.match(LAB_QUERY,/select=run_at,checked_count,passed_count,failed_count,status,cases,description/);
 assert.doesNotMatch(LAB_QUERY,/service_role|auth\/v1\/admin/);
 let usedURL='',usedOptions={};
 const fetcher=async(url,options)=>{
  usedURL=url;usedOptions=options;
  return {ok:true,json:async()=>[sample]};
 };
 const result=await getLabAudit(fetcher);
 assert.equal(result.checked,10);
 assert.equal(usedURL,LAB_QUERY);
 assert.equal(usedOptions.headers.apikey,LAB_PUBLIC_KEY);
 assert.equal(usedOptions.method,undefined);
});
test('Fallo HTTP no se interpreta como aprobado',async()=>{
 await assert.rejects(()=>getLabAudit(async()=>({ok:false,status:503})),/503/);
});
