/* Herramientas puras para auditoría interna del banco PPA.
 * Las claves históricas pueden estar equivocadas: el puntaje NO verifica su corrección documental.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.PPA_AUDIT=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const numericId=q=>{
  const m=String(q?.id||'').match(/(\d+)\s*$/);
  return m?Number(m[1]):null;
 };
 const validOptions=q=>Array.isArray(q?.opciones)&&q.opciones.length>=2&&q.opciones.every(x=>typeof x==='string'&&x.trim());
 const hasKey=q=>validOptions(q)&&Number.isInteger(q?.correcta)&&q.correcta>=0&&q.correcta<q.opciones.length;
 const isComplete=q=>Boolean(String(q?.materia||'').trim()&&String(q?.pregunta||'').trim()&&String(q?.fuente||'').trim()&&validOptions(q));
 const sortByNumber=bank=>[...bank].sort((a,b)=>{
  const x=numericId(a),y=numericId(b);
  if(x!==null&&y!==null&&x!==y)return x-y;
  if(x!==null&&y===null)return -1;
  if(x===null&&y!==null)return 1;
  return String(a.id).localeCompare(String(b.id),'es',{numeric:true});
 });
 const auditBank=bank=>{
  const questions=sortByNumber(bank),numbers=questions.map(numericId).filter(x=>x!==null);
  const min=numbers.length?Math.min(...numbers):null,max=numbers.length?Math.max(...numbers):null;
  const count=new Map();
  numbers.forEach(n=>count.set(n,(count.get(n)||0)+1));
  const missing=[];
  if(min!==null&&max-min<20000)for(let x=min;x<=max;x++)if(!count.has(x))missing.push(x);
  return {
   total:questions.length,
   first:min,last:max,
   missing,
   duplicate:[...count.entries()].filter(([,n])=>n>1).map(([n])=>n),
   noKey:questions.filter(q=>!hasKey(q)).length,
   noReason:questions.filter(q=>!String(q.fundamento||'').trim()).length,
   incomplete:questions.filter(q=>!isComplete(q)).length,
   unverified:questions.filter(q=>q.estado!=='verificada').length,
   verified:questions.filter(q=>q.estado==='verificada').length
  };
 };
 const quoteCsv=value=>{
  let s=String(value??'').replace(/[\r\n]+/g,' ').trim();
  // Defiende contra fórmulas si el CSV se abre en Excel u otra planilla.
  if(/^[=+@-]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
 };
 const exportCsv=(questions,answers={},flags={})=>{
  const headings=['Número','ID','Materia','Pregunta','Opciones','Clave histórica registrada','Respuesta seleccionada','Resultado','Puntos','Estado documental','Fundamento','Fuente','Incidencia administrativa','Observaciones'];
  const rows=sortByNumber(questions).map(q=>{
   const n=numericId(q),entry=answers[q.id]||{},key=hasKey(q)?q.opciones[q.correcta]:'SIN CLAVE VÁLIDA';
   const userAnswer=Number.isInteger(entry.selected)&&Array.isArray(q.opciones)?q.opciones[entry.selected]:'Sin responder';
   const result=entry.graded?(entry.correct?'Correcto según clave':'Incorrecto según clave'):(entry.attempted?'Sin calificar':'Sin responder');
   const incidents=[!isComplete(q)?'Registro incompleto':'',!hasKey(q)?'Clave ausente o inválida':'',!String(q.fundamento||'').trim()?'Sin fundamento':'',q.estado!=='verificada'?'Clave sin verificación final':''].filter(Boolean).join('; ');
   return [n??'',q.id,q.materia,q.pregunta,Array.isArray(q.opciones)?q.opciones.map((x,i)=>String.fromCharCode(65+i)+': '+x).join(' | '):'',key,userAnswer,result,entry.correct&&entry.graded?1:0,q.estado,q.fundamento,q.fuente,incidents,flags[q.id]||''];
  });
  return '\ufeff'+[headings,...rows].map(row=>row.map(quoteCsv).join(';')).join('\r\n');
 };
 return Object.freeze({numericId,validOptions,hasKey,isComplete,sortByNumber,auditBank,exportCsv});
});
