import {MODULES,PENDING,listAuditRuns,readAuditJobs,moduleStatuses,statusOfRun,githubRunLink} from './aerosuite-audit-model.js';
const $=id=>document.getElementById(id);
function badge(parent,label,kind){
 const span=document.createElement('span');
 span.className='status '+(kind||'pending');
 span.textContent=label;parent.replaceChildren(span);
}
function classify(label){
 if(label.startsWith('APROBADO'))return 'ok';
 if(label.startsWith('FALLÓ'))return 'fail';
 if(label.startsWith('EN'))return 'running';
 return 'pending';
}
function dateART(date){
 if(!date)return '—';
 const d=new Date(date);
 return Number.isFinite(d.getTime())?d.toLocaleString('es-AR',
 {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'America/Argentina/Buenos_Aires'})+' ART':'—';
}
function paintModules(jobs){
 const rows=moduleStatuses(jobs);
 const body=$('moduleRows');body.replaceChildren();
 for(const row of rows){
  const tr=document.createElement('tr'),name=document.createElement('td'),status=document.createElement('td');
  name.textContent=row.name;badge(status,row.status,classify(row.status));tr.append(name,status);body.append(tr);
 }
 $('passCount').textContent=String(rows.filter(x=>x.status.startsWith('APROBADO')).length);
 $('failCount').textContent=String(rows.filter(x=>x.status==='FALLÓ').length);
}
function paintHistory(runs){
 const body=$('historyRows');body.replaceChildren();
 if(!runs.length){
  const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;
  td.textContent='Sin ejecuciones semanales o manuales en la rama principal.';tr.append(td);body.append(tr);return;
 }
 for(const run of runs){
  const tr=document.createElement('tr');
  const date=document.createElement('td');date.textContent=dateART(run.created_at);
  const type=document.createElement('td');type.textContent=run.event==='schedule'?'Semanal':'Manual';
  const status=document.createElement('td');const state=statusOfRun(run);
  badge(status,state.label,state.kind==='failure'?'fail':state.kind==='running'?'running':'pending');
  const open=document.createElement('td');
  const link=githubRunLink(run);
  if(link){const a=document.createElement('a');a.href=link;a.rel='noopener noreferrer';a.target='_blank';a.textContent='Ver evidencia';open.append(a);}
  else open.textContent='—';
  tr.append(date,type,status,open);body.append(tr);
 }
}
let loading=false;
async function refresh(){
 if(loading)return;
 loading=true;$('refreshAudit').disabled=true;$('auditMessage').textContent='Consultando las ejecuciones de GitHub…';
 try{
  const runs=await listAuditRuns();
  paintHistory(runs);
  const run=runs[0]||null;const state=statusOfRun(run);
  badge($('globalStatus'),state.label,state.kind==='failure'?'fail':state.kind==='running'?'running':'pending');
  $('lastRunDate').textContent=run?'Última ejecución: '+dateART(run.created_at):'Todavía no se registró una ejecución semanal o manual en la rama principal.';
  const evidence=githubRunLink(run);
  $('openRun').hidden=!evidence;if(evidence)$('openRun').href=evidence;
  const jobs=run?await readAuditJobs(run.id):[];
  paintModules(jobs);
  $('auditMessage').textContent=run?'Resultados de GitHub Actions. Aún faltan pruebas de integración real.':'La programación está configurada. Podés lanzar la primera ejecución manual desde GitHub.';
 }catch(error){
  $('auditMessage').textContent='No se pudo consultar GitHub Actions: '+String(error?.message||'Error')+'. Abrí la ejecución en GitHub para verificarla.';
  badge($('globalStatus'),'SIN DATOS VERIFICABLES','pending');
  paintModules([]);
  $('passCount').textContent='—';$('failCount').textContent='—';
 }
 finally{loading=false;$('refreshAudit').disabled=false;}
}
async function start(){
 const notice=$('accessMessage');
 // La información remota se solicita solo después de la validación explícita del rol.
 try{
  await window.GDV_AUTH.ready;
  const db=window.GDV_AUTH?.client;
  if(!db)throw Error('Autenticación no disponible.');
  const session=await db.auth.getUser();
  const user=session.data?.user;
  if(session.error||!user){notice.textContent='Ingresá a AeroSuite con tu cuenta para consultar el monitoreo.';return;}
  const role=await db.from('aerosuite_superadmins').select('user_id').eq('user_id',user.id).maybeSingle();
  if(role.error)throw role.error;
  if(!role.data||role.data.user_id!==user.id){
    notice.textContent='Acceso denegado. Solo el Superadministrador de AeroSuite puede consultar este centro.';return;
  }
  $('adminContent').hidden=false;
  notice.textContent='Identidad y permisos de Superadministración verificados.';
  const list=$('pendingList');list.replaceChildren();
  for(const item of PENDING){const li=document.createElement('li');li.textContent='NO PROBADO · '+item;list.append(li);}
  $('notCheckedCount').textContent=String(PENDING.length);
  $('refreshAudit').addEventListener('click',refresh);
  await refresh();
 }catch(error){notice.textContent='No se pudo validar el acceso: '+String(error?.message||'Error de servicio');}
}
start();
