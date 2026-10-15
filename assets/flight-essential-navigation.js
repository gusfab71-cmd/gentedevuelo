/* Flight Operations - Navigation appendix for Essential Flight Report.
 * This is a LOCAL calculation; never uses OpenAI or fetch.
 * Sources: airport coordinates from GDV reference (ANAC 2021);
 * WMM2025 magnetic variation (2025-2030); TAS declared by pilot;
 * WIND/T forecast from loaded PRONAREA at nearest published flight level
 * and nearby reporting location (manual fallback explicitly identified).
 * No wind is inferred from METAR or TAF.
 * Wind triangle: true track -> true heading with WCA -> magnetic heading.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const target=$('flight-essential-navigation-content');
const settings=$('flight-nav-wind-legs'),tasInput=$('flight-nav-tas');
const legs=$('flight-legs-list'),waypoints=$('flight-waypoints');
const result=$('flight-essential-result'),wmm=window.GDV_WMM2025;
const airports=window.GDV_FLIGHT_FIR_GEODATA?.airports;
const namedPoints=window.GDV_FLIGHT_NAMED_POINTS||{};
const windSource=window.GDV_PRONAREA_WIND;
if(!target||!settings||!tasInput||!legs||!waypoints)return;
const rad=Math.PI/180,deg=180/Math.PI;
const normalize=d=>((d%360)+360)%360;
const num=(v,digits=0)=>Number(v).toLocaleString('es-AR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const windValues=new Map(),aiWindValues=new Map();
let currentSignature='';
const readCode=id=>{
 const el=$(id);
 return String((el?.value==='OTHER'?$(id+'-other')?.value:el?.value)||'').trim().toUpperCase();
};
const point=value=>{
 const name=String(value||'').trim().toUpperCase();
 if(airports?.[name])return airports[name];
 if(namedPoints?.[name])return namedPoints[name];
 const m=/^(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(name);
 if(m){
  const a=Number(m[1]),b=Number(m[2]);
  if(Math.abs(a)<=90&&Math.abs(b)<=180)return [a,b];
 }
 return null;
};
function routeNames(){
 return [readCode('flight-origin'),
   ...[...waypoints.querySelectorAll('.flight-waypoint-row input')].map(n=>n.value.trim()),
   readCode('flight-dest')];
}
function trueTrack(a,b){
 if(!a||!b)return null;
 const lat1=a[0]*rad,lat2=b[0]*rad,deltaLon=(b[1]-a[1])*rad;
 const y=Math.sin(deltaLon)*Math.cos(lat2);
 const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(deltaLon);
 if(Math.hypot(x,y)<1e-9)return null;
 return normalize(Math.atan2(y,x)*deg);
}
function windTriangle(track,tas,fromTrue,speed){
 if(![track,tas,fromTrue,speed].every(Number.isFinite)||tas<=0||speed<0)return null;
 const relative=(fromTrue-track)*rad;
 const lateral=speed*Math.sin(relative);
 if(Math.abs(lateral)>tas)return {possible:false,reason:'El viento cruzado supera la TAS: no existe un rumbo que mantenga esta derrota con estos datos.'};
 const wca=Math.asin(Math.max(-1,Math.min(1,lateral/tas)));
 const gs=tas*Math.cos(wca)-speed*Math.cos(relative);
 if(gs<=0.05)return {possible:false,reason:'La componente de viento no permite progresar sobre la ruta con esa TAS.'};
 return {possible:true,wca:wca*deg,trueHeading:normalize(track+wca*deg),groundSpeed:gs};
}
function flightDate(){
 const value=$('flight-time')?.value?.trim().replace(' ','T');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value||''))return null;
 const parsed=new Date(value+'Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,16)===value?parsed:null;
}
function currentRoute(){
 const names=routeNames();
 const rows=[...legs.querySelectorAll('.flight-leg-row')];
 const result=[];
 for(let i=0;i<names.length-1;i++){
  const alt=rows[i]?.querySelector('.field input[type="number"]')?.value||'';
  const signature=names[i]+' → '+names[i+1];
  result.push({key:signature,index:i,name:signature,from:point(names[i]),to:point(names[i+1]),alt});
 }
 return result;
}
function readTAS(){
 const raw=tasInput.value.trim();
 const n=Number(raw);
 return raw!==''&&Number.isFinite(n)&&n>=20&&n<=500?n:null;
}
function validatedAiWind(leg){
 const check=windSource?.validity($('flight-pronarea')?.value||'',flightDate());
 if(!check?.ok)return null; // Aunque el servidor haya extraído viento, validar nuevamente UTC.
 const ai=aiWindValues.get(leg.index);
 if(!ai||ai.from.trim().toUpperCase()!==leg.name.split(' → ')[0].trim().toUpperCase()||
    ai.to.trim().toUpperCase()!==leg.name.split(' → ')[1].trim().toUpperCase()||
    ai.altitude_ft!==Number(leg.alt))return null;
 const entries=windSource?.parse($('flight-pronarea')?.value||'')||[];
 const item=entries.find(v=>v.station===ai.station&&v.level_ft===ai.forecast_level_ft&&
   v.direction_true_deg===ai.direction_true_deg&&v.speed_kt===ai.speed_kt);
 if(!item||!leg.from||!leg.to||!airports?.[item.airport])return null;
 const mid=[(leg.from[0]+leg.to[0])/2,(leg.from[1]+leg.to[1])/2];
 const distance=windSource.distanceKm(mid,airports[item.airport]);
 if(!Number.isFinite(distance)||distance>300)return null;
 return {wind:{speed:ai.speed_kt,from:ai.direction_true_deg},
   source:'PRONAREA WIND/T interpretado por IA y cotejado · '+ai.station+
     ' · FL'+String(ai.forecast_level_ft/100).padStart(3,'0')+
     ' · estación a '+Math.round(distance)+' km del centro de la pierna.',
   forecastLevelFt:ai.forecast_level_ft,stationDistanceKm:distance,altitudeGapFt:Math.abs(ai.forecast_level_ft-Number(leg.alt)),
   notice:'Comprobá la vigencia, el área y el nivel de referencia en el PRONAREA original.'};
}
function windForLeg(leg){
 const state=windValues.get(leg.key)||{};
 if(state.mode==='manual'){
  const speedStr=String(state.speed??'').trim(),directionStr=String(state.direction??'').trim();
  const speed=speedStr!==''?Number(speedStr):null;
  const from=directionStr!==''?Number(directionStr):null;
  if(speed===null||!Number.isFinite(speed)||speed<0||speed>200||
     (speed>0&&(from===null||!Number.isFinite(from)||from<0||from>359||!Number.isInteger(from))))
    return {wind:null,reason:'Datos de viento manual incompletos o inválidos: dirección verdadera 000–359° y velocidad 0–200 kt.'};
  return {wind:{speed,from:speed===0?0:from},
    source:'Viento ingresado manualmente por el piloto (fuente y vigencia por verificar).'};
 }
 const raw=$('flight-pronarea')?.value||'';
 const check=windSource?.validity(raw,flightDate());
 if(!check?.ok)return {wind:null,reason:check?.message||'No se pudo confirmar la validez horaria del PRONAREA.'};
 const ai=validatedAiWind(leg);
 if(ai)return ai;
 if(!raw.trim())return {wind:null,reason:'No se cargó PRONAREA con WIND/T para esta pierna.'};
 const location=leg.from&&leg.to?[
  (leg.from[0]+leg.to[0])/2,(leg.from[1]+leg.to[1])/2]:null;
 const report=windSource?.pick(raw,Number(leg.alt),location,airports,flightDate());
 if(!report?.ok)return {wind:null,reason:report?.reason||'No se pudo identificar viento en altura en el PRONAREA cargado.'};
 return {wind:{speed:report.speed_kt,from:report.direction_true_deg},
  source:'PRONAREA WIND/T · '+report.station+' · FL'+String(report.level_ft/100).padStart(3,'0')+
   ' ('+num(report.level_ft)+' ft) · distancia a referencia '+Math.round(report.distance_km)+' km.',
  forecastLevelFt:report.level_ft,stationDistanceKm:report.distance_km,altitudeGapFt:report.altitude_difference_ft,
  notice:report.notice};
}
function computeLeg(leg){
 const course=trueTrack(leg.from,leg.to);
 if(course===null)return {leg,course:null,reason:'Sin coordenadas conocidas para uno de los puntos. No se calculan rumbo ni GS.'};
 const date=flightDate();
 const variation=date&&leg.from&&leg.to&&wmm?.magneticVariation
   ?wmm.magneticVariation((leg.from[0]+leg.to[0])/2,(leg.from[1]+leg.to[1])/2,date)
   :null;
 const magneticTrack=Number.isFinite(variation)?normalize(course-variation):null;
 const tas=readTAS(),windInfo=windForLeg(leg),wind=windInfo.wind;
 if(tas===null||wind===null)
   return {leg,course,variation,magneticTrack,missing:tas===null?'Falta TAS válida en el Paso 1 (nudos); completala para calcular rumbo con viento y GS.':windInfo.reason};
 const solution=windTriangle(course,tas,wind.from,wind.speed);
 if(!solution?.possible)return {leg,course,variation,magneticTrack,missing:solution?.reason||'Datos del viento o TAS insuficientes.'};
 return {leg,course,variation,magneticTrack,wind,tas,windSource:windInfo.source,windNotice:windInfo.notice,
   forecastLevelFt:windInfo.forecastLevelFt,stationDistanceKm:windInfo.stationDistanceKm,altitudeGapFt:windInfo.altitudeGapFt,
   wca:solution.wca,trueHeading:solution.trueHeading,
   magneticHeading:Number.isFinite(variation)?normalize(solution.trueHeading-variation):null,
   gs:solution.groundSpeed};
}
function asLine(value){
 return value===null||value===undefined?'No calculable':num(value,1)+'°';
}
function describe(r){
 const name='Pierna '+(r.leg.index+1)+' · '+r.leg.name+' · Altitud declarada '+(r.leg.alt?num(Number(r.leg.alt))+' ft AMSL':'sin definir');
 if(r.course===null)return {title:name,lines:[r.reason]};
 const lines=[
  'Derrota verdadera inicial estimada: '+asLine(r.course)+
   '. Declinación magnética (WMM2025): '+(Number.isFinite(r.variation)?num(r.variation,1)+'° (este +, oeste −)':'No disponible')+
   '. Derrota magnética de referencia: '+asLine(r.magneticTrack)+'.'
 ];
 if(r.missing){lines.push('Rumbo corregido y GS: no calculables. '+r.missing);return {title:name,lines};}
 lines.push('Datos: TAS '+num(r.tas)+' kt; viento de altura desde '+String(r.wind.from).padStart(3,'0')+'° verdaderos a '+num(r.wind.speed)+' kt. '+r.windSource);
 lines.push('Corrección por viento ESTIMADA: '+(r.wca>=0?'+':'')+num(r.wca,1)+'°; rumbo verdadero de proa: '+asLine(r.trueHeading)+
   '; rumbo magnético de proa: '+asLine(r.magneticHeading)+
   '; GS ORIENTATIVA DE REFERENCIA: '+num(r.gs,1)+' kt (NO confirmada para todo el vuelo).');
 if(Number.isFinite(r.forecastLevelFt)&&Number.isFinite(r.stationDistanceKm)){
   const gap=Number(r.altitudeGapFt);
   const distant=r.stationDistanceKm>150||gap>1000;
   lines.push((distant?'ATENCIÓN · REPRESENTATIVIDAD LIMITADA. ':'Referencia meteorológica aproximada. ')+
     'Viento pronosticado a FL'+String(r.forecastLevelFt/100).padStart(3,'0')+
     ' ('+num(r.forecastLevelFt)+' ft), a '+num(gap)+' ft de la altitud de la pierna. '+
     'Estación a '+Math.round(r.stationDistanceKm)+' km del centro del tramo. '+
     'No está confirmado que ese viento represente toda la ruta a tu hora de paso. Comprobá PRONAREA, zona y período.');
 }else{
   lines.push('ATENCIÓN: viento manual sin ubicación ni nivel contrastados por la Mesa. La GS sigue siendo orientativa hasta verificar su fuente y validez.');
 }
 if(r.magneticHeading===null)lines.push('El rumbo magnético no pudo determinarse sin declinación válida: consultá AIP/carta.');
 return {title:name,lines};
}
function output(){
 if(result.hidden)return;
 const legs=currentRoute().map(computeLeg).map(describe);
 target.replaceChildren();
 if(!legs.length){target.textContent='Definí origen y destino para calcular las piernas.';return;}
 for(const item of legs){
  const div=document.createElement('div');div.className='flight-nav-result-row';
  const label=document.createElement('strong');label.textContent=item.title;div.append(label);
  for(const line of item.lines){
   const p=document.createElement('p');p.textContent=line;div.append(p);
  }
  target.append(div);
 }
 const note=document.createElement('p');note.className='flight-nav-result-note';
 note.textContent='ATENCIÓN: cada GS es una estimación de referencia, NO una velocidad confirmada ni garantizada. El PRONAREA WIND/T describe viento a niveles y estaciones específicas; seleccionar la estación y FL más cercanos NO valida automáticamente el viento en ruta u hora de paso. Antes de utilizar estos números corroborá emisión y validez UTC, FIR, sector, altitudes, viento previsto y cartas SMN/AIP. Nunca se usa METAR ni TAF como viento de crucero. El rumbo de brújula requiere la desviación del compás. No reemplaza la planificación, las verificaciones del piloto ni una autorización ATC.';
 target.append(note);
}
function windInputs(){
 const route=currentRoute();
 // Un PRONAREA nuevo vuelve a seleccionar nivel/estación sin depender de la
 // respuesta IA ni producir una llamada a OpenAI.
 const signature=JSON.stringify(route.map(r=>[r.key,r.alt]))+'|'+($('flight-pronarea')?.value||'')+'|'+($('flight-time')?.value||'');
 if(currentSignature===signature)return;
 currentSignature=signature;
 settings.replaceChildren();
 if(!route.length){settings.textContent='Cargá primero la ruta en el Paso 1.';return;}
 const grid=document.createElement('div');grid.className='flight-nav-legs';
 for(const leg of route){
  const item=document.createElement('div');item.className='flight-nav-leg';
  const title=document.createElement('strong');
  title.textContent='Pierna '+(leg.index+1)+' · '+leg.name+(leg.alt?' · '+num(Number(leg.alt))+' ft':'');
  item.append(title);
  const info=windForLeg(leg);
  const state=windValues.get(leg.key)||{};
  const source=document.createElement('p');source.className='flight-nav-source';
  source.dataset.status=state.mode==='manual'?'manual':'automatic';
  source.textContent=state.mode==='manual'
   ?'Viento manual: comprobá que el valor corresponda a esta altitud, FIR y hora UTC.'
   :info.wind?'VIENTO DE REFERENCIA (no confirmado para toda la ruta): '+info.source+
     ' Viento '+String(info.wind.from).padStart(3,'0')+'° verdaderos / '+num(info.wind.speed)+' kt. Verificá vigencia y representatividad.'
    :'Viento automático no disponible: '+info.reason;
  item.append(source);
  const toggle=document.createElement('button');toggle.className='secondary';toggle.type='button';
  toggle.textContent=state.mode==='manual'?'Volver a viento PRONAREA':'Ingresar viento oficial manualmente';
  toggle.addEventListener('click',()=>{
   const selected=windValues.get(leg.key)||{};
   selected.mode=selected.mode==='manual'?'auto':'manual';
   windValues.set(leg.key,selected);
   currentSignature='';
   windInputs();
  });
  item.append(toggle);
  if(state.mode==='manual'){
   const fields=document.createElement('div');fields.className='flight-nav-leg-fields';
   for(const field of [
    {key:'direction',name:'Viento DESDE (° verdaderos)',placeholder:'Ej.: 270',max:'359'},
    {key:'speed',name:'Velocidad del viento (kt)',placeholder:'Ej.: 15',max:'200'}
   ]){
    const label=document.createElement('label');label.textContent=field.name;
    const input=document.createElement('input');
    input.type='number';input.min='0';input.max=field.max;input.step='1';input.inputMode='numeric';
    input.placeholder=field.placeholder;
    input.value=String(state[field.key]??'');
    input.setAttribute('aria-label',field.name+' · '+leg.name);
    input.addEventListener('input',()=>{
     const saved=windValues.get(leg.key)||{mode:'manual'};
     saved[field.key]=input.value;saved.mode='manual';
     windValues.set(leg.key,saved);
     output();
    });
    label.append(input);fields.append(label);
   }
   item.append(fields);
  }
  grid.append(item);
 }
 settings.append(grid);
 output();
}
const schedule=()=>{
 if(schedule.scheduled)return;
 schedule.scheduled=true;
 queueMicrotask(()=>{schedule.scheduled=false;windInputs();});
};
new MutationObserver(schedule).observe(legs,{childList:true,characterData:true,subtree:true});
new MutationObserver(schedule).observe(waypoints,{childList:true,characterData:true,subtree:true});
for(const id of ['flight-origin','flight-dest','flight-origin-other','flight-dest-other','flight-time']){
 const node=$(id);
 node?.addEventListener('input',()=>{schedule();output();});
 node?.addEventListener('change',()=>{schedule();output();});
}
waypoints.addEventListener('input',schedule);
$('flight-pronarea')?.addEventListener('input',()=>{aiWindValues.clear();schedule();output();});
tasInput.addEventListener('input',output);
document.addEventListener('gdv-flight-essential-generated',(event)=>{
 aiWindValues.clear();
 const entries=Array.isArray(event.detail?.winds)?event.detail.winds:[];
 for(const entry of entries){
   if(!entry||!Number.isInteger(entry.leg_index)||entry.leg_index<0||entry.leg_index>8)continue;
   if(typeof entry.station!=="string"||typeof entry.from!=="string"||typeof entry.to!=="string")continue;
   if(!Number.isInteger(entry.altitude_ft)||!Number.isInteger(entry.forecast_level_ft)||
     !Number.isFinite(entry.direction_true_deg)||!Number.isFinite(entry.speed_kt))continue;
   aiWindValues.set(entry.leg_index,entry);
 }
 currentSignature='';
 windInputs();output();
});
// Cálculo geométrico de piernas para la planilla, sin IA ni fuentes externas.
function distanceNm(a,b){
 if(!a||!b)return null;
 const dLat=(b[0]-a[0])*rad,dLon=(b[1]-a[1])*rad,lat1=a[0]*rad,lat2=b[0]*rad;
 const q=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
 return 3440.065*2*Math.asin(Math.min(1,Math.sqrt(q)));
}
window.GDV_FLIGHT_NAV=Object.freeze({snapshot:()=>currentRoute().map(leg=>{
 const result=computeLeg(leg);
 return {index:leg.index,name:leg.name,altitude_ft:Number(leg.alt),distance_nm:distanceNm(leg.from,leg.to),
   course_true_deg:result.course,heading_true_deg:result.trueHeading,
   heading_magnetic_deg:result.magneticHeading,variation_deg:result.variation,
   gs_kt:result.gs,wind_source:result.windSource||result.missing||'Sin viento verificable',
   from:leg.from,to:leg.to};
})});
schedule();
})();