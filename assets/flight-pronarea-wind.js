/* Flight Operations - parser conservador de WIND/T de PRONAREA.
 * SMN Seccion II: "WIND/T: AER EZE ... FL030/33015P18 FL065/..." .
 * Nivel FLXXX = 100*XXX ft (presión estándar), dirección en decenas de grados
 * verdaderos, velocidad en nudos. No interpreta METAR/FCST/SIGFENOM.
 * La proximidad espacial es estimativa: WIND/T es un pronóstico sobre
 * estaciones designadas y para el horario medio de validez, no una garantía
 * del viento efectivo en la ruta. No infiere vigencia del texto incompleto.
 */
(()=>{
'use strict';
const referenceStations={
 EZE:'SAEZ',AER:'SABE',FDO:'SADF',PAL:'SADP',MOR:'SADM',
 MDP:'SAZM',BCA:'SAZB',CBA:'SACO',ROS:'SAAR',SVO:'SAAV', DIL:'SAZT', OSA:'SAZR',
 PAR:'SAAP',RCU:'SAOC',SLU:'SAOU',DIA:'SAAC',GUA:'SAAG',
 MZA:'SAME',SRA:'SAMR',SJU:'SANU',MLG:'SAMM',
 SAL:'SASA',JUJ:'SASJ',TUC:'SANT',CAT:'SANC',
 SDE:'SANE',LAR:'SANL',CAT:'SANC',JUJ:'SASJ',SAL:'SASA',TUC:'SANT',IGU:'SARI',RES:'SARE',
 CRR:'SARC',FSA:'SARF',POS:'SARP',NEU:'SAZN',
 BAR:'SAZS',CHP:'SAZY',CRV:'SAVC',TRE:'SAVT',
 ESQ:'SAVE',CAL:'SAWC',GAL:'SAWG',RGA:'SAWE',
 USH:'SAWH',OSA:'SAZR',DIL:'SAZT'
};
// VALIDEZ HH-HH no trae fecha. Tomamos la fecha UTC de salida, con ajuste
// para franjas que comienzan el día anterior y cruzan medianoche UTC.
// Esto NO certifica que el ejemplar pegado haya sido emitido para ese día.
function resolveWindow(digits,departureUtc){
 const date=departureUtc instanceof Date?departureUtc:new Date(departureUtc);
 if(!Number.isFinite(date.getTime())||!/^[0-9]{4}$/.test(digits))return null;
 const h1=Number(digits.slice(0,2)),h2=Number(digits.slice(2));
 if(h1>23||h2>24||h1===h2)return null;
 const day=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
 const crosses=h2<=h1;
 let start=day+h1*3600000,end=day+h2*3600000+(crosses?86400000:0);
 if(crosses&&date.getTime()<day+h2*3600000){start-=86400000;end-=86400000;}
 return {start,end};
}
function validity(text,departureUtc){
 const raw=String(text||'').toUpperCase();
 if(!raw.trim())return {ok:false,status:'no_aportado',message:'Pegá un PRONAREA oficial para conocer su franja de validez.'};
 const windows=[...raw.matchAll(/\bPRONAREA\s+FIR\s+[A-Z]{3,4}\s+VALIDEZ\s+(\d{4})(?!\d)/g)].map(m=>m[1]);
 if(!windows.length)return {ok:false,status:'sin_validez_legible',message:'No se pudo leer VALIDEZ HH-HH del PRONAREA. No se aplicará su viento a la GS.'};
 if(departureUtc===null||departureUtc===undefined||departureUtc==='')return {ok:false,status:'salida_sin_hora',message:'Completá fecha y hora UTC de salida para comprobar el PRONAREA.'};
 const date=departureUtc instanceof Date?departureUtc:new Date(departureUtc);
 if(!Number.isFinite(date.getTime()))return {ok:false,status:'salida_sin_hora',message:'Completá fecha y hora UTC de salida para comprobar el PRONAREA.'};
 // La fecha se infiere de la salida. La confirmación del original oficial
 // sigue siendo obligatoria antes de utilizar WIND/T.
 const pilotConfirmed=document.getElementById('flight-pronarea-confirm')?.checked===true;
 if(!pilotConfirmed)
  return {ok:false,status:'fecha_sin_confirmar',
   message:'Antes de usar WIND/T, confirmá en el SMN la FIR, emisión y vigencia del PRONAREA copiado.'};
 for(const digits of windows){
  const window=resolveWindow(digits,date);
  if(!window)
   return {ok:false,status:'sin_validez_legible',message:'Grupo de validez del PRONAREA incorrecto.'};
  if(date.getTime()<window.start||date.getTime()>=window.end)
   return {ok:false,status:'fuera_del_horario',windows,
    message:'PRONAREA FUERA DEL HORARIO DE VALIDEZ: '+windows.join(', ')+' UTC; salida '+date.toISOString().slice(0,16).replace('T',' ')+
    ' UTC. No se usará WIND/T para GS automática. Consultá el boletín vigente.'};
 }
 return {ok:true,status:'horario_compatible_fecha_no_confirmada',windows,
  message:'PRONAREA: salida '+date.toISOString().slice(0,16).replace('T',' ')+' UTC dentro de '+windows.join(', ')+
   ' UTC. La fecha de emisión y la vigencia real del texto NO están verificadas; comprobá el original en SMN.'};
}
function parse(text){
 const raw=String(text||'').toUpperCase().replace(/\r/g,'\n');
 if(!raw.trim())return [];
 // Ignore PRONAREA outside the WIND/T (wind/temperature aloft) section.
 const slices=raw.split(/\b(?:WIND\s*\/\s*T|WIND\s*\/\s*TT|WIND\s*Y\s*TEMPERATURA)\s*:/);
 if(slices.length<2)return [];
 const results=[];
 for(let j=1;j<slices.length;j++){
  const section=slices[j].split(/\b(?:FCST|SIGFENOM|CORRIENTE EN CHORRO|TURBULENCIA|ENGELAMIENTO|PRONAREA\s+FIR)\s*:/)[0];
  // En el formato oficial pueden agruparse estaciones con guiones, p.ej.
  // "TAR-JUJ-SAL FL030/..." (SMN, sección II del PRONAREA).
  const tokens=section.replace(/[,\n;]/g,' ').replace(/([A-Z]{3})-([A-Z]{3})/g,'$1 $2').replace(/([A-Z]{3})-([A-Z]{3})/g,'$1 $2')
    .split(/\s+/).map(x=>x.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g,'')).filter(Boolean);
  let group=[],hasLevel=false;
  for(const token of tokens){
   // Full W/T groups always carry the temperature P/M; do not parse other flight level notices.
   const match=/^FL(\d{3})\/(\d{2})(\d{3})([PM])(\d{2})$/.exec(token);
   if(match){
    if(!group.length)continue;
    hasLevel=true;
    const level=Number(match[1])*100,heading=Number(match[2])*10,speed=Number(match[3]);
    if(![3000,6500,10000,16500,23000,30000,36000,39000,45000].includes(level))continue;
    // 99: variable direction, cannot compute a wind correction reliably.
    if(heading>360||speed>200)continue;
    for(const station of group){
     if(referenceStations[station]){
       results.push({station,airport:referenceStations[station],level_ft:level,
         direction_true_deg:heading===360?0:heading,speed_kt:speed,source:'PRONAREA WIND/T'});
     }
    }
   }else if(/^[A-Z]{3}$/.test(token)&&referenceStations[token]){
     if(hasLevel){group=[];hasLevel=false;}
     if(!group.includes(token))group.push(token);
   }
  }
 }
 return results;
}
function distanceKm(a,b){
 if(!a||!b)return Infinity;
 const d=Math.PI/180,phi=(b[0]-a[0])*d,lambda=(b[1]-a[1])*d;
 const q=Math.sin(phi/2)**2+Math.cos(a[0]*d)*Math.cos(b[0]*d)*Math.sin(lambda/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(q)));
}
function pick(text,altitude_ft,midpoint,airports,departureUtc,routeEndpoints){
 const check=validity(text,departureUtc);
 if(!check.ok)return {ok:false,reason:check.message,status:check.status};
 const entries=parse(text);
 if(!entries.length)return {ok:false,reason:'PRONAREA sin sección WIND/T reconocible o sin vientos utilizables. El programa no inventa el viento en altura.'};
 if(!Number.isFinite(altitude_ft)||altitude_ft<500||altitude_ft>45000)
  return {ok:false,reason:'Altitud de la pierna no válida.'};
 if(!Array.isArray(midpoint))return {ok:false,reason:'No hay coordenadas del tramo para elegir una estación de referencia.'};
 // Agrupar estaciones: primero la más cercana al punto medio del tramo y luego
 // el nivel FL publicado más cercano. No interpolar ni inventar niveles.
 const options=entries.map(r=>({...r,distance_km:distanceKm(midpoint,airports?.[r.airport])})).filter(x=>Number.isFinite(x.distance_km));
 if(!options.length)return {ok:false,reason:'El PRONAREA no contiene estaciones con posición conocida para esta pierna.'};
 const minDistance=Math.min(...options.map(x=>x.distance_km));
 // En trayectos largos una estación del propio origen o destino puede quedar
 // a más de 300 km del punto medio. Sólo admitir esa excepción cuando la
 // estación se encuentre a 50 km o menos de un EXTREMO real de la pierna.
 // Si hay pronósticos en ambos extremos, promediar los vectores de viento;
 // nunca promediar directamente los ángulos (350° y 010° no son 180°).
 if(minDistance>300){
  const endpoints=Array.isArray(routeEndpoints)&&routeEndpoints.length===2?routeEndpoints:null;
  function endpointWind(endpoint){
   if(!Array.isArray(endpoint))return null;
   const nearest=options.map(x=>({...x,endpoint_km:distanceKm(endpoint,airports?.[x.airport])}))
    .filter(x=>x.endpoint_km<=50).sort((a,b)=>a.endpoint_km-b.endpoint_km||Math.abs(a.level_ft-altitude_ft)-Math.abs(b.level_ft-altitude_ft));
   if(!nearest.length)return null;
   const name=nearest[0].station;
   const sameStation=nearest.filter(x=>x.station===name)
    .sort((a,b)=>Math.abs(a.level_ft-altitude_ft)-Math.abs(b.level_ft-altitude_ft));
   return sameStation[0];
  }
  const start=endpoints?endpointWind(endpoints[0]):null;
  const finish=endpoints?endpointWind(endpoints[1]):null;
  const references=[start,...(finish&&finish.station!==start?.station?[finish]:[])].filter(Boolean);
  if(!references.length)
   return {ok:false,reason:'La estación WIND/T más próxima se encuentra a '+Math.round(minDistance)+' km del centro del tramo y no corresponde al origen o destino de la pierna. Verificá viento oficial en ruta.'};
  for(const ref of references){
   if(options.some(x=>x.station===ref.station&&x.level_ft===ref.level_ft&&
       (x.direction_true_deg!==ref.direction_true_deg||x.speed_kt!==ref.speed_kt)))
    return {ok:false,reason:'Hay pronósticos WIND/T contradictorios para '+ref.station+' a FL'+ref.level_ft/100+'. Verificá el boletín.'};
   if(Math.abs(ref.level_ft-altitude_ft)>5000)
    return {ok:false,reason:'El nivel WIND/T de '+ref.station+' está demasiado alejado de la altitud seleccionada. Verificá el pronóstico.'};
  }
  const rad=Math.PI/180;
  const east=references.reduce((sum,r)=>sum-r.speed_kt*Math.sin(r.direction_true_deg*rad),0)/references.length;
  const north=references.reduce((sum,r)=>sum-r.speed_kt*Math.cos(r.direction_true_deg*rad),0)/references.length;
  const speed=Math.hypot(east,north);
  const from=speed<0.001?0:((Math.atan2(-east,-north)/rad)%360+360)%360;
  const summary=references.map(r=>r.station+' FL'+String(r.level_ft/100).padStart(3,'0')).join(' + ');
  const both=references.length===2;
  return {ok:true,station:references.map(r=>r.station).join(' + '),
   level_ft:references.every(r=>r.level_ft===references[0].level_ft)?references[0].level_ft:null,
   level_summary:summary,reference_type:both?'route_endpoints_average':'route_endpoint',
   direction_true_deg:from,speed_kt:speed,source:'PRONAREA WIND/T',
   distance_km:Math.max(...references.map(r=>r.distance_km)),
   altitude_difference_ft:Math.max(...references.map(r=>Math.abs(r.level_ft-altitude_ft))),
   notice:(both?'Estimación mediante promedio vectorial de los vientos publicados en ambos extremos de la pierna: '
      :'Estimación usando el viento publicado en un extremo de la pierna: ')+summary+
    '. Es una referencia aproximada, NO un pronóstico confirmado para el tramo completo ni para la hora de paso; verificá representatividad, zona y vigencia oficial.'};
 }
 const candidates=options.filter(x=>x.distance_km-minDistance<0.1);
 candidates.sort((a,b)=>Math.abs(a.level_ft-altitude_ft)-Math.abs(b.level_ft-altitude_ft));
 const chosen=candidates[0];
 // Si hay fuentes contradictorias para misma estación/nivel, no elegir arbitrariamente.
 const equals=options.filter(x=>x.station===chosen.station&&x.level_ft===chosen.level_ft);
 if(equals.some(x=>x.direction_true_deg!==chosen.direction_true_deg||x.speed_kt!==chosen.speed_kt))
  return {ok:false,reason:'Se encontraron pronósticos WIND/T diferentes para la misma estación y nivel. Verificá el boletín.'};
 if(Math.abs(chosen.level_ft-altitude_ft)>5000)
  return {ok:false,reason:'El nivel WIND/T más cercano es '+chosen.level_ft+' ft, demasiado alejado de la altitud seleccionada; comprobar el pronóstico.'};
 return {ok:true,...chosen,altitude_difference_ft:Math.abs(chosen.level_ft-altitude_ft),
   notice:'Viento sobre la vertical de '+chosen.station+' (a unos '+Math.round(chosen.distance_km)+' km del punto medio del tramo), a FL'+String(chosen.level_ft/100).padStart(3,'0')+'. Revisá zona, validez UTC y fuentes oficiales.'};
}
window.GDV_PRONAREA_WIND=Object.freeze({parse,pick,distanceKm,validity,resolveWindow});
// Advertencia preventiva visible junto al PRONAREA, sin usar IA ni tokens.
const field=document.getElementById('flight-pronarea'),time=document.getElementById('flight-time');
const status=document.getElementById('flight-pronarea-validity');
function showValidity(){
 if(!status||!field||!time)return;
 const raw=String(time.value||'').trim().replace(' ','T');
 const date=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)?new Date(raw+'Z'):null;
 const check=validity(field.value,date);
 status.dataset.validity=check.status;
 status.textContent=check.message;
 status.hidden=!field.value.trim();
}
field?.addEventListener('input',showValidity);
document.getElementById('flight-pronarea-confirm')?.addEventListener('change',showValidity);
time?.addEventListener('input',showValidity);
time?.addEventListener('change',showValidity);
showValidity();
})();
