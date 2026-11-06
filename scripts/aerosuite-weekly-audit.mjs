// Auditoría de solo lectura: pruebas de código DEMO y GET públicos.
// No usa Supabase ni secretos, no genera reservas, pagos o registros reales.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,appendFileSync,readFileSync} from 'node:fs';
const output='aerosuite-auditoria-resultados';
mkdirSync(output,{recursive:true});
const suites=[
 ['Turnera, portales, formación y reglas','tests/gestion-aeronautica.test.mjs',true],
 ['Escenarios ficticios integrados','tests/aerosuite-laboratorio.test.mjs',true],
 ['Mantenimiento institucional','tests/aerosuite-maintenance-integration.test.cjs',false],
 ['Matrículas y registros','tests/aerosuite-registration.test.cjs',false],
 ['Director y permisos estructurales','tests/aerosuite-director-institucional.test.mjs',false],
 ['Aislamiento de la demo de autorizaciones','tests/aerosuite-camino-demo.test.mjs',false],
 ['Lógica de mantenimiento aeronáutico','tests/aircraft-maintenance.test.cjs',false]
];
const pending=[
 'Autenticación real y RLS entre Director, Secretaría, Instructor, Alumno, PPA y PCA',
 'RPC y reservas concurrentes sobre una base aislada',
 'Cobros reales, packs e idempotencia',
 'Mantenimiento y contadores técnicos sincronizados',
 'Portales reales con navegador Playwright y datos ficticios'
];
const safeEnv={...process.env,CI:'true',AUDITORIA_MODE:'ficticio'};
for(const k of Object.keys(safeEnv)){
 if(/SUPABASE|DATABASE|DB_PASSWORD|SERVICE_ROLE|POSTGRES|VERCEL_TOKEN|API_SECRET/i.test(k))delete safeEnv[k];
}
const results=[];
const logs=[];
for(const [name,file,esm] of suites){
 const args=[...(esm?['--experimental-default-type=module']:[]),file];
 const r=spawnSync(process.execPath,args,{env:safeEnv,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 const ok=r.status===0&&!r.error;
 results.push({name,file,status:ok?'APROBADO':'FALLÓ',exitCode:r.status,error:r.error?.message||null});
 logs.push('### '+name+'\n'+(r.stdout||'')+'\n'+(r.stderr||''));
 console.log((ok?'APROBADO':'FALLÓ')+' '+name);
}
const source=readFileSync('tests/aerosuite-laboratorio.test.mjs','utf8');
const todo=[...source.matchAll(/\btest\.todo\s*\(/g)].length;
if(todo!==pending.length){
 results.push({name:'Cobertura pendiente contabilizada',status:'FALLÓ',error:'El inventario NO PROBADO no coincide con los test.todo'});
}
const targets=[
 ['Portal de escuela','/utilidades/gestion-aeronautica/portal-escuela.html'],
 ['Turnera, informes y cobros','/utilidades/gestion-aeronautica/operaciones-institucionales.html'],
 ['Mantenimiento institucional','/utilidades/gestion-aeronautica/mantenimiento-institucional.html'],
 ['Centro de Testeo Permanente','/utilidades/gestion-aeronautica/centro-pruebas-operativas.html']
];
const smoke=[];
const checkPublic=['schedule','workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME);
if(checkPublic){
 for(const [name,path] of targets){
  const url='https://gentedevuelo.com'+path;
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'follow',
    headers:{'Cache-Control':'no-cache','User-Agent':'AeroSuite-Weekly-ReadOnly-Audit'}});
   const html=await response.text();
   const ok=response.ok&&html.toLowerCase().includes('aerosuite');
   smoke.push({name,url,http:response.status,status:ok?'DISPONIBLE':'FALLÓ'});
  }catch(e){smoke.push({name,url,status:'FALLÓ',error:String(e)});}
 }
}else targets.forEach(([name])=>smoke.push({name,status:'NO PROBADO (solo semanal o manual)'}));
const failed=results.filter(x=>x.status==='FALLÓ').length+smoke.filter(x=>x.status==='FALLÓ').length;
const verdict=failed?'FALLÓ':'PARCIAL: E2E y RLS NO PROBADOS';
const report={date:new Date().toISOString(),verdict,scope:'Código offline ficticio y salud HTTP pública',
 productionWrites:false,results,smoke,pending,warning:'Pruebas de código y HTTP no equivalen a funcionamiento validado de los portales reales'};
writeFileSync(output+'/reporte.json',JSON.stringify(report,null,2));
writeFileSync(output+'/salida-pruebas.txt',logs.join('\n\n'));
const md=[
 '# Auditoría semanal AeroSuite',
 '',
 '**Resultado: '+verdict+'**',
 '',
 'Escrituras en producción: **ninguna**. No se accede a Supabase.',
 '',
 '## Pruebas automatizadas',
 '| Componente | Resultado |','| --- | --- |',
 ...results.map(x=>'| '+x.name+' | '+x.status+' |'),
 '',
 '## Disponibilidad HTTP pública (no implica autenticación funcional)',
 '| Página | Resultado |','| --- | --- |',
 ...smoke.map(x=>'| '+x.name+' | '+x.status+(x.http?' (HTTP '+x.http+')':'')+' |'),
 '',
 '## Cobertura pendiente de la auditoría completa',
 ...pending.map(s=>'- **NO PROBADO:** '+s),
 '',
 '**Importante:** un resultado parcial no acredita el funcionamiento íntegro de AeroSuite. Debe implementarse E2E real contra una base aislada.',
 'Ejecución: '+report.date
].join('\n')+'\n';
writeFileSync(output+'/reporte.md',md);
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
console.log(md);
if(failed)process.exitCode=1;
