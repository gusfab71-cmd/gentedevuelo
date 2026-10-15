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
 MDP:'SAZM',BCA:'SAZB',CBA:'SACO',ROS:'SAAR',SVO:'SAAV',
 PAR:'SAAP',RCU:'SAOC',SLU:'SAOU',CDU:'SAAC',GUA:'SAAG',
 MZA:'SAME',SRA:'SAMR',SJU:'SANU',MLG:'SAMM',
 SAL:'SASA',JUJ:'SASJ',TUC:'SANT',CAT:'SANC',
 SDE:'SANE',LAR:'SANL',IGU:'SARI',RES:'SARE',
 CRR:'SARC',FSA:'SARF',POS:'SARP',NEU:'SAZN',
 BAR:'SAZS',CHP:'SAZY',CRV:'SAVC',TRE:'SAVT',
 ESQ:'SAVE',CAL:'SAWC',GAL:'SAWG',RGA:'SAWE',
 USH:'SAWH',OSA:'SAZR',DIL:'SAZT'
};
function parse(text){
 const raw=String(text||'').toUpperCase().replace(/\r/g,'\n');
 if(!raw.trim())return [];
 // Ignore PRONAREA outside the WIND/T (wind/temperature aloft) section.
 const slices=raw.split(/\b(?:WIND\s*\/\s*T|WIND\s*\/\s*TT|WIND\s*Y\s*TEMPERATURA)\s*:/);
 if(slices.length<2)return [];
 const results=[];
 for(let j=1;j<slices.length;j++){
  const section=slices[j].split(/\b(?:FCST|SIGFENOM|CORRIENTE EN CHORRO|TURBULENCIA|ENGELAMIENTO|PRONAREA\s+FIR)\s*:/)[0];
  const tokens=section.replace(/[,\n;]/g,' ').split(/\s+/).map(x=>x.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g,'')).filter(Boolean);
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
function pick(text,altitude_ft,midpoint,airports){
 const entries=parse(text);
 if(!entries.length)return {ok:false,reason:'PRONAREA sin sección WIND/T reconocible o sin vientos utilizables.'};
 if(!Number.isFinite(altitude_ft)||altitude_ft<500||altitude_ft>45000)
  return {ok:false,reason:'Altitud de la pierna no válida.'};
 if(!Array.isArray(midpoint))return {ok:false,reason:'No hay coordenadas del tramo para elegir una estación de referencia.'};
 // Agrupar estaciones: primero la más cercana al punto medio del tramo y luego
 // el nivel FL publicado más cercano. No interpolar ni inventar niveles.
 const options=entries.map(r=>({...r,distance_km:distanceKm(midpoint,airports?.[r.airport])})).filter(x=>Number.isFinite(x.distance_km));
 if(!options.length)return {ok:false,reason:'El PRONAREA no contiene estaciones con posición conocida para esta pierna.'};
 const minDistance=Math.min(...options.map(x=>x.distance_km));
 if(minDistance>200)
  return {ok:false,reason:'La estación WIND/T más próxima se encuentra a '+Math.round(minDistance)+' km del centro del tramo; requiere selección manual/consulta oficial.'};
 const candidates=options.filter(x=>x.distance_km-minDistance<0.1);
 candidates.sort((a,b)=>Math.abs(a.level_ft-altitude_ft)-Math.abs(b.level_ft-altitude_ft));
 const chosen=candidates[0];
 // Si hay fuentes contradictorias para misma estación/nivel, no elegir arbitrariamente.
 const equals=options.filter(x=>x.station===chosen.station&&x.level_ft===chosen.level_ft);
 if(equals.some(x=>x.direction_true_deg!==chosen.direction_true_deg||x.speed_kt!==chosen.speed_kt))
  return {ok:false,reason:'Se encontraron pronósticos WIND/T diferentes para la misma estación y nivel. Verificá el boletín.'};
 if(Math.abs(chosen.level_ft-altitude_ft)>4000)
  return {ok:false,reason:'El nivel WIND/T más cercano es '+chosen.level_ft+' ft, demasiado alejado de la altitud seleccionada; comprobar el pronóstico.'};
 return {ok:true,...chosen,altitude_difference_ft:Math.abs(chosen.level_ft-altitude_ft),
   notice:'Viento sobre la vertical de '+chosen.station+' (a unos '+Math.round(chosen.distance_km)+' km del punto medio del tramo), a FL'+String(chosen.level_ft/100).padStart(3,'0')+'. Revisá zona, validez UTC y fuentes oficiales.'};
}
window.GDV_PRONAREA_WIND=Object.freeze({parse,pick,distanceKm});
})();