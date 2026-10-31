/* AeroSuite — formato único de matrículas.
 * Ejemplos: lvert, lv-ert, LV ERT -> LV-ERT; lq123 -> LQ-123.
 * No modifica automáticamente matrículas internacionales de otra estructura.
 */
(function(root){
 "use strict";
 const INPUT_SELECTOR=[
  'input[data-aerosuite-registration]',
  'input[name="aircraft_registration"]',
  'input[name="log_aircraft_registration"]',
  'input[name="registration"]',
  'input[id="lessonAircraft"]',
  'input[id="new-aircraft"]'
 ].join(",");
 function normalize(raw){
  const text=String(raw??"").normalize("NFKC").toUpperCase().trim()
   .replace(/[\u2010-\u2015\u2212_]/g,"-")
   .replace(/\s+/g,"");
  const compact=text.replace(/-/g,"");
  // Dos letras iniciales: el sistema coloca exactamente un guion divisor.
  if(/^[A-Z]{2}[A-Z0-9]*$/.test(compact)&&
     /^[A-Z]{2}-?[A-Z0-9]*$/.test(text)){
   return compact.slice(0,2)+"-"+compact.slice(2);
  }
  // Otros formatos de matrícula: preservar su separación internacional.
  return text;
 }
 function isValid(raw){
  const text=normalize(raw);
  return /^[A-Z]{2}-[A-Z0-9]{3,5}$/.test(text)||
   /^[A-Z0-9]{1,3}-[A-Z0-9]{2,6}$/.test(text)||
   /^[A-Z][A-Z0-9]{2,6}$/.test(text);
 }
 function formatField(el){
  if(!el||typeof el.value!=="string")return;
  const old=el.value,next=normalize(old);
  if(next===old)return;
  let cursor=el.selectionStart;
  if(cursor===null||cursor===undefined)cursor=old.length;
  const substantive=(old.slice(0,cursor).match(/[A-Za-z0-9]/g)||[]).length;
  el.value=next;
  if(typeof el.setSelectionRange==="function"){
   let seen=0,target=next.length;
   if(substantive===0)target=0;
   else for(let i=0;i<next.length;i++){
    if(/[A-Z0-9]/.test(next[i]))seen++;
    if(seen===substantive){target=i+1;break;}
   }
   // Tras introducir el prefijo LV, dejar el cursor después del guion.
   if(substantive===2&&next[2]==="-")target=3;
   el.setSelectionRange(target,target);
  }
 }
 const api=Object.freeze({normalize,isValid,formatField,selector:INPUT_SELECTOR});
 root.AeroSuiteRegistration=api;
 if(typeof document==="undefined")return;
 const handle=event=>{
  const field=event.target;
  if(field?.matches?.(INPUT_SELECTOR)&&field.type!=="hidden")formatField(field);
 };
 document.addEventListener("input",handle,true);
 document.addEventListener("change",handle,true);
 document.addEventListener("blur",handle,true);
 document.addEventListener("submit",event=>{
  const form=event.target;
  if(!form?.querySelectorAll)return;
  for(const field of form.querySelectorAll(INPUT_SELECTOR))formatField(field);
 },true);
})(typeof window!=="undefined"?window:globalThis);
