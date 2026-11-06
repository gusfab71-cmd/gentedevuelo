// Solo informes ficticios del segundo Supabase gratuito; NO contiene claves privilegiadas.
export const LAB_URL='https://djvjaxkukephniwixpra.supabase.co';
export const LAB_PUBLIC_KEY='sb_publishable_RKZRrCEhgbWLzgddoDbmIg_0RNRuiKy';
export const LAB_DASHBOARD='https://supabase.com/dashboard/project/djvjaxkukephniwixpra';
export const LAB_QUERY=LAB_URL+'/rest/v1/aerosuite_lab_audit_summaries?select=run_at,checked_count,passed_count,failed_count,status,cases,description&order=run_at.desc&limit=1';
export function parseLabAudit(rows){
 const item=Array.isArray(rows)?rows[0]:null;
 if(!item)return null;
 const fields=['checked_count','passed_count','failed_count'];
 if(fields.some(x=>!Number.isSafeInteger(item[x])||item[x]<0)||
   item.passed_count+item.failed_count!==item.checked_count||
   !['PASS_SIMULATION','FAIL_SIMULATION'].includes(item.status)||
   !Array.isArray(item.cases))throw Error('Informe de laboratorio inválido.');
 if((item.failed_count===0)!==(item.status==='PASS_SIMULATION'))
  throw Error('Resultado inconsistente en la auditoría SQL.');
 const t=Date.parse(item.run_at);
 if(!Number.isFinite(t))throw Error('Fecha de ejecución SQL inválida.');
 return {date:item.run_at,timeMs:t,checked:item.checked_count,passed:item.passed_count,
  failed:item.failed_count,status:item.status,
  cases:item.cases.map(x=>({name:String(x.name||'Prueba sin nombre'),
   pass:x.pass===true,error:x.error?String(x.error):''})),
  stale:Date.now()-t>8*86400000};
}
export async function getLabAudit(fetcher=fetch){
 const response=await fetcher(LAB_QUERY,{
   headers:{apikey:LAB_PUBLIC_KEY,Accept:'application/json'},
   cache:'no-store',signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw Error('El laboratorio Supabase respondió HTTP '+response.status+'. Puede encontrarse pausado (plan Free).');
 return parseLabAudit(await response.json());
}
