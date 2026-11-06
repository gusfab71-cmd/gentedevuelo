// Datos publicos de GitHub Actions. No usa tokens, credenciales ni datos personales.
export const AUDIT_REPO='gusfab71-cmd/gentedevuelo';
export const WORKFLOW_PATH='.github/workflows/aerosuite-laboratorio.yml';
export const MODULES=Object.freeze([
 ['Turnera y formación','turnera'],
 ['Escenarios ficticios','laboratorio'],
 ['Mantenimiento institucional','mantenimiento'],
 ['Matrículas y registros','matriculas'],
 ['Dirección y permisos','permisos'],
 ['Aislamiento de demos','demo'],
 ['Mantenimiento aeronáutico','tecnico']
].map(([name,key])=>Object.freeze({name,key,job:'Módulo: '+name})));
export const PENDING=Object.freeze([
 'Autenticación y permisos RLS reales para seis perfiles',
 'Reservas concurrentes y RPC de Alumno, PPA y PCA',
 'Cobros, packs y conciliación bancaria/contable real',
 'Mantenimiento y horas técnicas integradas en Supabase',
 'Recorridos con Playwright en portales conectados a Supabase aislado'
]);
export const API_BASE='https://api.github.com/repos/'+AUDIT_REPO;
export const ACTION_URL='https://github.com/'+AUDIT_REPO+'/actions/workflows/aerosuite-laboratorio.yml';
export function isMainAuditRun(r){
 return r && r.path===WORKFLOW_PATH && r.head_branch==='main' &&
 ['schedule','workflow_dispatch'].includes(r.event) &&
 Number.isSafeInteger(r.id) && r.id>0;
}
export function statusOfRun(run){
 if(!run)return {label:'SIN EJECUCIÓN',kind:'pending'};
 if(['queued','waiting','pending','requested','in_progress'].includes(run.status))
  return {label:'EN EJECUCIÓN',kind:'running'};
 if(run.conclusion==='success')return {label:'PARCIAL · FUNCIONES REALES PENDIENTES',kind:'partial'};
 if(run.conclusion==='failure'||run.conclusion==='timed_out'||run.conclusion==='action_required')
  return {label:'FALLÓ · REQUIERE REVISIÓN',kind:'failure'};
 return {label:'SIN RESULTADO DEFINITIVO',kind:'pending'};
}
export function moduleStatuses(jobs){
 const items=Array.isArray(jobs)?jobs:[];
 return MODULES.map(module=>{
  const match=items.find(job=>job.name===module.job);
  let status='NO PROBADO';
  if(match?.conclusion==='success')status='APROBADO · CÓDIGO';
  else if(match?.conclusion==='failure'||match?.conclusion==='timed_out')status='FALLÓ';
  else if(match?.status==='in_progress'||match?.status==='queued')status='EN CURSO';
  else if(match?.conclusion==='cancelled')status='NO COMPLETADO';
  return {...module,status};
 });
}
export function githubRunLink(run){
 const url=run?.html_url||'';
 return /^https:\/\/github\.com\/gusfab71-cmd\/gentedevuelo\/actions\/runs\/[0-9]+$/.test(url)?url:null;
}
async function getJson(url,fetcher){
 const response=await fetcher(url,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
 if(!response.ok)throw Error('GitHub respondió HTTP '+response.status+'.');
 return response.json();
}
export async function listAuditRuns(fetcher=fetch){
 const collected=[];
 // El repositorio tiene otros workflows: filtrar estrictamente por ruta y rama.
 for(let page=1;page<=7&&collected.length<8;page++){
  const data=await getJson(API_BASE+'/actions/runs?per_page=100&page='+page,fetcher);
  const rows=Array.isArray(data.workflow_runs)?data.workflow_runs:[];
  collected.push(...rows.filter(isMainAuditRun));
  if(rows.length<100)break;
 }
 return collected.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,8);
}
export async function readAuditJobs(runId,fetcher=fetch){
 if(!Number.isSafeInteger(runId)||runId<1)throw Error('Identificador de ejecución inválido.');
 const payload=await getJson(API_BASE+'/actions/runs/'+runId+'/jobs?per_page=100',fetcher);
 return Array.isArray(payload.jobs)?payload.jobs:[];
}
