// DEMOSTRACIÓN ADMINISTRATIVA DE RAV, sin certificación, firma ni trámite ante ANAC.
// Las facultades de firmar deben verificarse con normativa e identidad real en el backend.
export const RAV_STATES=Object.freeze({
 draft:'Borrador institucional',
 submitted:'Enviado para revisión',
 returned:'Devuelto con observaciones',
 reviewed:'Revisado internamente · NO CERTIFICADO'
});
const iso=s=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s)))return false;
 const d=new Date(s+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
};
export function ravCandidates(studentId,flights,from,to){
 if(!iso(from)||!iso(to)||from>to)throw Error('Seleccioná un período válido.');
 return flights.filter(f=>f.pilot===studentId&&f.operationType==='instruction'&&f.instructor&&f.date>=from&&f.date<=to)
  .slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)));
}
export function ravFlightTotals(rav,flights){
 if(!rav||!Array.isArray(rav.flightIds))throw Error('RAV inválido.');
 const selected=rav.flightIds.map(id=>flights.find(f=>f.id===id));
 if(selected.some(f=>!f))throw Error('Hay vuelos de origen faltantes; requiere revisión.');
 if(new Set(rav.flightIds).size!==rav.flightIds.length)throw Error('Un vuelo no puede repetirse en un RAV.');
 return {
  count:selected.length,
  minutes:selected.reduce((n,f)=>n+(Number.isInteger(f.blockMinutes)?f.blockMinutes:Math.round(Number(f.blockHours||0)*60)),0),
  aircraft:[...new Set(selected.map(f=>f.aircraft))]
 };
}
export function createRavDraft(input,flights,members,existing=[]){
 const student=members.find(p=>p.id===input.studentId&&p.kind==='alumno');
 if(!student)throw Error('Seleccioná un alumno de la institución.');
 const found=ravCandidates(student.id,flights,input.dateFrom,input.dateTo);
 if(!found.length)throw Error('El alumno no tiene vuelos de instrucción cerrados en este período.');
 const ids=found.map(f=>f.id);
 const already=new Set(existing.filter(r=>r.studentId===student.id).flatMap(r=>r.flightIds||[]));
 if(ids.some(id=>already.has(id)))throw Error('Hay vuelos incluidos en otro RAV de demostración. No dupliques documentación.');
 const now=new Date().toISOString();
 return {id:crypto.randomUUID(),studentId:student.id,dateFrom:input.dateFrom,dateTo:input.dateTo,
  flightIds:ids,status:'draft',createdAt:now,updatedAt:now,
  history:[{action:'borrador_creado',actor:'administracion_demo',at:now}],
  certification:null};
}
export function submitRavForReview(rav){
 if(!rav||!['draft','returned'].includes(rav.status))throw Error('Solo se envían borradores o devoluciones.');
 const now=new Date().toISOString();
 return {...rav,status:'submitted',updatedAt:now,
  history:[...(rav.history||[]),{action:'enviado_a_responsable',actor:'administracion_demo',at:now}]};
}
export function institutionalReviewRav(rav,{actor,role,decision,observations=''}){
 if(!rav||rav.status!=='submitted')throw Error('El RAV debe estar pendiente de revisión.');
 if(!['director','jefe','responsable_institucional'].includes(role))throw Error('Se requiere un responsable institucional autorizado.');
 if(!actor||!String(actor).trim())throw Error('Falta identidad de quien revisa.');
 if(!['reviewed','returned'].includes(decision))throw Error('Decisión inválida.');
 if(decision==='returned'&&!String(observations).trim())throw Error('La devolución requiere observaciones.');
 const now=new Date().toISOString();
 return {...rav,status:decision,updatedAt:now,
  history:[...(rav.history||[]),{action:decision==='reviewed'?'revision_interna':'devuelto',
   actor:String(actor),role,at:now,observations:String(observations).slice(0,1000)}],
  certification:null};
}
