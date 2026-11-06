import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {
 MODULES,PENDING,WORKFLOW_PATH,ACTION_URL,isMainAuditRun,statusOfRun,moduleStatuses,githubRunLink,listAuditRuns,readAuditJobs
} from '../utilidades/gestion-aeronautica/aerosuite-audit-model.js';

const run={id:123456,path:WORKFLOW_PATH,head_branch:'main',event:'schedule',
 status:'completed',conclusion:'success',created_at:'2026-11-09T12:00:00Z',
 html_url:'https://github.com/gusfab71-cmd/gentedevuelo/actions/runs/123456'};
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Solo considerar auditorías programadas/manuales de la rama principal',()=>{
 assert.ok(isMainAuditRun(run));
 assert.ok(isMainAuditRun({...run,event:'workflow_dispatch'}));
 for(const difference of [
  {head_branch:'testing'},{event:'pull_request'},{path:'.github/workflows/static.yml'},
  {id:-1},{id:'123456'}
 ])assert.equal(isMainAuditRun({...run,...difference}),false);
});
test('Un workflow exitoso nunca marca la plataforma integralmente aprobada',()=>{
 assert.equal(statusOfRun(run).kind,'partial');
 assert.equal(statusOfRun({...run,conclusion:'failure'}).kind,'failure');
 assert.equal(statusOfRun({...run,status:'in_progress',conclusion:null}).kind,'running');
 assert.equal(statusOfRun(null).kind,'pending');
 assert.equal(PENDING.length,5);
});
test('Mantener las nueve áreas identificables, incluso las no ejecutadas',()=>{
 assert.equal(MODULES.length,9);
 assert.equal(moduleStatuses([]).filter(x=>x.status==='NO PROBADO').length,9);
 const jobs=MODULES.map((x,i)=>({name:x.job,conclusion:i===0?'failure':'success',status:'completed'}));
 const normalized=moduleStatuses(jobs);
 assert.equal(normalized[0].status,'FALLÓ');
 assert.equal(normalized.filter(x=>x.status==='APROBADO · CÓDIGO').length,7);
 assert.equal(normalized.filter(x=>x.status==='APROBADO · SIMULACIÓN SQL').length,1);
});
test('Los enlaces externos solo aceptan ejecuciones del repositorio correcto',()=>{
 assert.equal(githubRunLink(run),run.html_url);
 assert.equal(githubRunLink({...run,html_url:'javascript:alert(1)'}),null);
 assert.equal(githubRunLink({...run,html_url:'https://github.com/otra/repo/actions/runs/123456'}),null);
 assert.equal(ACTION_URL,'https://github.com/gusfab71-cmd/gentedevuelo/actions/workflows/aerosuite-laboratorio.yml');
});
test('Consulta remota: excluir PRs y otros workflows',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return {ok:true,json:async()=>({workflow_runs:[
  {...run,event:'pull_request'},{...run,id:123457,event:'workflow_dispatch'},{...run,path:'other.yml'},
  run
 ]})};};
 const results=await listAuditRuns(fetcher);
 assert.equal(calls,1);
 assert.equal(results.length,2);
 assert.ok(results.every(x=>isMainAuditRun(x)));
});
test('Las credenciales y URLs no pueden inyectarse a la consulta de jobs',async()=>{
 await assert.rejects(()=>readAuditJobs(-22),/inválido/);
 let path='';
 const fetcher=async url=>{path=url;return {ok:true,json:async()=>({jobs:[]})};};
 await readAuditJobs(123456,fetcher);
 assert.match(path,/\/actions\/runs\/123456\/jobs\?per_page=100$/);
});
test('La interfaz nunca expone resultados antes de verificar el superadministrador',()=>{
 const admin=read('utilidades/gestion-aeronautica/superadministrador.html');
 const page=read('utilidades/gestion-aeronautica/centro-monitoreo-aerosuite.html');
 const js=read('utilidades/gestion-aeronautica/aerosuite-audit-controller.js');
 assert.match(admin,/<div id="adminContent" hidden>/);
 assert.match(admin,/href="centro-monitoreo-aerosuite\.html"/);
 assert.match(page,/<div id="adminContent" hidden>/);
 assert.match(page,/meta name="robots" content="noindex,nofollow"/);
 assert.match(js,/await window\.GDV_AUTH\.ready/);
 assert.match(js,/db\.auth\.getUser\(\)/);
 assert.match(js,/db\.from\('aerosuite_superadmins'\)\.select\('user_id'\)/);
 assert.match(js,/role\.data\.user_id!==user\.id/);
 assert.ok(js.indexOf("$('adminContent').hidden=false")<js.indexOf('await Promise.all([refresh(),refreshHealth(db)])'));
 assert.match(js,/db\.rpc\('aerosuite_superadmin_portal_health'/,'Consulta de integridad existente y sin escritura');
 assert.match(js,/await Promise\.all\(\[refresh\(\),refreshHealth\(db\),refreshSqlLab\(\)\]\)/);
 assert.match(page,/id="sqlLabStatus"/,'El laboratorio SQL aparece únicamente en el panel protegido');
 assert.match(js,/db\.from\('aerosuite_permanent_test_lab'\)/,'El diagnóstico se limita a la institución técnica permanente');
 assert.doesNotMatch(js,/\.(?:insert|update|upsert|delete)\s*\(/);
});
test('Archivos ES module sintácticamente válidos',()=>{
 for(const file of ['utilidades/gestion-aeronautica/aerosuite-audit-controller.js','utilidades/gestion-aeronautica/aerosuite-audit-model.js']){
  const r=spawnSync(process.execPath,['--experimental-default-type=module','--check',file],{encoding:'utf8'});
  assert.equal(r.status,0,file+': '+r.stderr);
 }
});
