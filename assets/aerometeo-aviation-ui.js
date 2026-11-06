/* AeroMeteo · METAR y TAF via Aviation Weather Center.
 * Observaciones aeronáuticas originales, sin derivar aptitud VFR/IFR.
 */
(function(root){
'use strict';
const API='/api/aerometeo-aviation-weather';
const ICAO=/^SA[A-Z]{2}$/;
function formatTime(value){
 if(typeof value!=='string')return 'No verificada';
 const d=new Date(value);
 if(!Number.isFinite(d.getTime()))return 'No verificada';
 return new Intl.DateTimeFormat('es-AR',{
  timeZone:'America/Argentina/Buenos_Aires',
  day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false
 }).format(d)+' (Argentina)';
}
function boot(){
 const icaoInput=document.getElementById('aerometeo-icao');
 const status=document.getElementById('aerometeo-aviation-status');
 const output=document.getElementById('aerometeo-aviation-result');
 const source=document.getElementById('aerometeo-aviation-source');
 const buttons={
  metar:document.getElementById('aerometeo-metar'),
  taf:document.getElementById('aerometeo-taf')
 };
 if(!icaoInput||!status||!output||!buttons.metar||!buttons.taf)return;
 let requestNo=0;
 async function query(type){
  const icao=icaoInput.value.trim().toUpperCase();
  icaoInput.value=icao;
  output.hidden=true;output.textContent='';source.hidden=true;
  if(!ICAO.test(icao)){
   status.textContent='Código OACI inválido: utilizá cuatro letras, comenzando con SA (por ejemplo, SAAV).';
   return;
  }
  const request=++requestNo;
  buttons.metar.disabled=true;buttons.taf.disabled=true;
  status.textContent='Consultando '+type.toUpperCase()+' '+icao+' en Aviation Weather Center…';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
  try{
   const params=new URLSearchParams({type,icao});
   const response=await fetch(API+'?'+params,{signal:controller.signal,headers:{Accept:'application/json'}});
   const data=await response.json();
   if(!response.ok||data.ok!==true||data.icao!==icao||data.type!==type)
    throw Error(data.error||'Sin respuesta válida');
   if(request!==requestNo)return;
   source.hidden=false;
   if(!data.found){
    status.textContent=type.toUpperCase()+' '+icao+': no se encontró un mensaje disponible. Consultá al SMN.';
    return;
   }
   output.textContent=data.raw;
   output.hidden=false;
   status.textContent=type.toUpperCase()+' '+icao+
    (data.stale?' · Fecha ausente o mensaje posiblemente DESACTUALIZADO.':' · Mensaje recuperado.')+
    ' Emisión: '+formatTime(data.issuedAt)+'.';
  }catch(_){
   if(request===requestNo)status.textContent=
    'No se pudo recuperar el mensaje aeronáutico. Consultá al SMN directamente.';
  }finally{
   clearTimeout(timer);
   if(request===requestNo){
    buttons.metar.disabled=false;buttons.taf.disabled=false;
   }
  }
 }
 buttons.metar.addEventListener('click',()=>{void query('metar')});
 buttons.taf.addEventListener('click',()=>{void query('taf')});
 icaoInput.addEventListener('keyup',event=>{
  if(event.key==='Enter'){void query('metar')}
 });
 return {query};
}
root.GDV_AEROMETEO_AVIATION={boot,formatTime,ICAO};
if(typeof module==='object'&&module.exports)module.exports={boot,formatTime,ICAO};
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
}
})(typeof window!=='undefined'?window:globalThis);
