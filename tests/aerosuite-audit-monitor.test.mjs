import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
 assert.ok(js.indexOf("$('adminContent').hidden=false")<js.indexOf('await Promise.all([refresh(),refreshHealth(db),refreshSqlLab()])'));
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

test('Centro de Testeo: rechazar diagnósticos incompletos y no reutilizar resultados anteriores',()=>{
 const page=read('utilidades/gestion-aeronautica/centro-pruebas-operativas.html');
 const begin=page.indexOf('const INTEGRITY_RULES=Object.freeze(');
 const end=page.indexOf('function renderLabAccounts(){',begin);
 assert.ok(begin>0&&end>begin,'La validación debe ejecutarse antes de mostrar resultados');
 const validator=vm.runInNewContext(page.slice(begin,end)+';({validateHealthSnapshot,safeNumber})');
 const now=Date.parse('2026-11-08T12:00:00Z'),id='LAB-FICTICIO';
 const rules=[
  'stale_pending','confirmed_without_instructor','completed_without_approved_report',
  'negative_pack_balance','double_settlement','overlapping_institution_slots',
  'instructor_cross_institution_overlap'
 ];
 const snapshot={institution_id:id,checked_at:new Date(now).toISOString()};
 for(const rule of rules)snapshot[rule]=0;
 assert.equal(validator.validateHealthSnapshot(snapshot,id,now),0);
 assert.equal(validator.validateHealthSnapshot({...snapshot,double_settlement:2},id,now),2);
 assert.throws(()=>validator.validateHealthSnapshot(snapshot,'OTRA-INSTITUCION',now),/otra institución/);
 assert.throws(()=>validator.validateHealthSnapshot({...snapshot,checked_at:null},id,now),/vencido/);
 assert.throws(()=>validator.validateHealthSnapshot({...snapshot,checked_at:new Date(now-360000).toISOString()},id,now),/vencido/);
 assert.throws(()=>validator.validateHealthSnapshot({...snapshot,checked_at:new Date(now+120000).toISOString()},id,now),/vencido/);
 for(const invalid of [null,undefined,-1,0.5,'0',true,NaN]){
  assert.throws(()=>validator.validateHealthSnapshot({...snapshot,stale_pending:invalid},id,now),/incompleto/);
 }
 assert.equal(validator.safeNumber(null),'—');
 assert.equal(validator.safeNumber(0),'0');
 assert.match(page,/health=\{\}; \/\/ Nunca reutilizar el diagnóstico de una consulta anterior/);
 assert.match(page,/if\(!await reloadHealth\(\)\)throw Error\('No hay diagnóstico final vigente y completo/);
 assert.match(page,/if\(!await reloadHealth\(\)\)throw Error\('No se pudo obtener el diagnóstico inicial vigente y completo/);
 assert.match(page,/\.eq\('status','in_progress'\)/,'No abrir dos sesiones por descuido');
 assert.match(page,/Se recuperó una prueba abierta/);
 assert.match(page,/Prueba cerrada/);
});
test('Laboratorio: identidad y permisos separados para cada rol',()=>{
 const lab=read('utilidades/gestion-aeronautica/centro-pruebas-operativas.html');
 const login=read('utilidades/gestion-aeronautica/ingreso-escuela.html');
 assert.match(lab,/<div id="content" hidden>/,'No mostrar datos antes de autorizar superadministración');
 assert.match(lab,/from\('aerosuite_superadmins'\)\.select\('user_id'\)/);
 assert.match(lab,/org\.data\?\.is_test!==true\|\|org\.data\?\.status!=='active'/);
 assert.match(login,/storageKey:labLogin\?'aerosuite-laboratorio-'\+selectedRole\+'-v1-auth'/,
  'Las sesiones de roles deben utilizar almacenamiento Supabase separado');
 for(const role of ['administrador','secretaria','instructor','alumno','piloto']){
  assert.match(lab,new RegExp("'"+role+"'"),'Rol del laboratorio ausente: '+role);
 }
 assert.match(lab,/sin acceso a Contaduría/,'No atribuir contaduría ni packs al alumno');
 assert.match(lab,/PPA puede requerir instructor; PCA opera sin instructor por defecto/);
});
