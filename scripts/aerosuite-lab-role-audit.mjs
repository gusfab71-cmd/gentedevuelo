import {getLabAudit} from '../utilidades/gestion-aeronautica/aerosuite-lab-client.js';
import {verifyRlsCases} from '../utilidades/gestion-aeronautica/aerosuite-lab-roles.js';
try{
 const report=await getLabAudit();
 const checked=verifyRlsCases(report);
 console.log(JSON.stringify({
   project:'Supabase Free de AeroSuite (aislado)',
   latest:report.date,
   ...checked
 },null,2));
}catch(error){
 console.error('AUDITORÍA RLS DEL LABORATORIO INCOMPLETA: '+String(error?.message||error));
 process.exitCode=1;
}
