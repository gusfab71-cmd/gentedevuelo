// CI: solo consulta REST al segundo proyecto gratuito. Sin credenciales de producción ni escrituras.
import {getLabAudit} from '../utilidades/gestion-aeronautica/aerosuite-lab-client.js';
try{
 const result=await getLabAudit();
 if(!result)throw Error('Aún no se registró ninguna ejecución SQL.');
 console.log(JSON.stringify({project:'Supabase gratuito aislado',scope:'SIMULACIÓN DB, NO E2E',
   passed:result.passed,failed:result.failed,checked:result.checked,
   date:result.date,stale:result.stale},null,2));
 if(result.stale)throw Error('El laboratorio está desactualizado. Comprobar si Supabase Free lo pausó.');
 if(result.status!=='PASS_SIMULATION')throw Error('Fallaron contratos relacionales del laboratorio.');
}catch(error){
 console.error('BLOQUEADO O FALLÓ EL LABORATORIO GRATUITO: '+String(error?.message||error));
 process.exitCode=1;
}
