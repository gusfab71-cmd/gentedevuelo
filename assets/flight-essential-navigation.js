/* Flight Operations - Navigation appendix for Essential Flight Report.
 * This is a LOCAL calculation; never uses OpenAI or fetch.
 * Sources: airport coordinates from GDV reference (ANAC 2021);
 * WMM2025 magnetic variation (2025-2030); IAS entered by pilot,
 * TAS calculated per leg from CAS, pressure altitude and air temperature;
 * WIND/T forecast from loaded PRONAREA at nearest published flight level
 * and nearby reporting location (manual fallback explicitly identified).
 * No wind is inferred from METAR or TAF.
 * Wind triangle: true track -> true heading with WCA -> magnetic heading.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const target=$('flight-essential-navigation-content');
const settings=$('flight-nav-wind-legs'),iasInput=$('flight-nav-ias');
const qnhInput=$('flight-nav-qnh'),casCorrectionInput=$('flight-nav-cas-correction');
const legs=$('flight-legs-list'),waypoints=$('flight-waypoints');
const result=$('flight-essential-result'),wmm=window.GDV_WMM2025;
const airports=window.GDV_FLIGHT_FIR_GEODATA?.airports;
const namedPoints=window.GDV_FLIGHT_NAMED_POINTS||{};
const windSource=window.GDV_PRONAREA_WIND,tasCalculator=window.GDV_FLIGHT_TAS;
if(!target||!settings||!iasInput||!tasCalculator||!legs||!waypoints)return;
const rad=Math.PI/180,deg=180/Math.PI;
const normalize=d=>((d%360)+360)%360;
const num=(v,digits=0)=>Number(v).toLocaleString('es-AR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const windValues=new Map(),temperatureValues=new Map(),aiWindValues=new Map();
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
function readIAS(){
 const raw=iasInput.value.trim(),value=Number(raw);
 return raw!==''&&Number.isFinite(value)&&value>=20&&value<=500?value:null;
}
function airParameters(){
 const ias=readIAS(),qnhRaw=qnhInput?.value.trim()||'',correctionRaw=casCorrectionInput?.value.trim()||'';
 const qnh=qnhRaw===''?1013.25:Number(qnhRaw);
 const correction=correctionRaw===''?0:Number(correctionRaw);
 if(ias===null||!Number.isFinite(qnh)||qnh<850||qnh>1100||
   !Number.isFinite(correction)||correction< -30||correction>30)return null;
 return {iasKt:ias,qnhHpa:qnh,casCorrectionKt:correction,qnhAssumed:qnhRaw===''};
}
function temperatureForLeg(leg,params){
 const altitude=Number(leg.alt),atmosphere=tasCalculator.atmosphere(altitude,params.qnhHpa);
 if(!atmosphere)return {error:'Altitud de esta pierna inválida para calcular la TAS.'};
 const manual=temperatureValues.get(leg.key);
 if(manual!==undefined&&manual!==''){
  const degrees=Number(manual);
  if(!Number.isFinite(degrees)||degrees< -90||degrees>60)
   return {error:'Temperatura manual inválida (−90 a +60 °C).'};
  return {celsius:degrees,source:'temperatura indicada por el piloto',mode:'manual'};
 }
 const raw=$('flight-pronarea')?.value||'';
 const location=leg.from&&leg.to?[(leg.from[0]+leg.to[0])/2,(leg.from[1]+leg.to[1])/2]:null;
 if(location&&windSource?.validity(raw,flightDate())?.ok){
  const forecast=windSource.pick(raw,altitude,location,airports,flightDate(),[leg.from,leg.to]);
  if(forecast?.ok&&Number.isFinite(forecast.temperature_c)&&
     Number.isFinite(forecast.level_ft)&&Math.abs(forecast.level_ft-altitude)<=2500){
   return {celsius:forecast.temperature_c,
    source:'PRONAREA WIND/T '+forecast.station+' · FL'+String(forecast.level_ft/100).padStart(3,'0')+
     ' (temperatura a nivel publicado, no necesariamente a la altitud de la pierna)',mode:'pronarea'};
  }
 }
 return {celsius:atmosphere.isaTemperatureC,source:'atmósfera estándar ISA, no temperatura meteorológica pronosticada',mode:'isa'};
}
function speedForLeg(leg){
 const params=airParameters();
 if(!params)return {error:'Ingresá una IAS válida y comprobá QNH y corrección CAS − IAS.'};
 const temperature=temperatureForLeg(leg,params);
 if(temperature.error)return {error:temperature.error};
 const calculated=tasCalculator.calculate({...params,altitudeFt:Number(leg.alt),oatC:temperature.celsius});
 if(!calculated)return {error:'No pudo calcularse la TAS con IAS, altitud, presión y temperatura ingresadas.'};
 return {...calculated,source:temperature.source,tempMode:temperature.mode,qnhAssumed:params.qnhAssumed};
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
 const report=windSource?.pick(raw,Number(leg.alt),location,airports,flightDate(),
  leg.from&&leg.to?[leg.from,leg.to]:null);
 if(!report?.ok)return {wind:null,reason:report?.reason||'No se pudo identificar viento en altura en el PRONAREA cargado.'};
 const levelLabel=report.level_summary||('FL'+String(report.level_ft/100).padStart(3,'0'));
 const sourceLabel=report.reference_type==='route_endpoints_average'
  ?'promedio vectorial de estaciones de origen y destino'
  :report.reference_type==='route_endpoint'?'estación en un extremo de la pierna':'estación próxima al centro del tramo';
 return {wind:{speed:report.speed_kt,from:report.direction_true_deg},
  source:'PRONAREA WIND/T · '+levelLabel+' · '+sourceLabel+
   ' (hasta '+Math.round(report.distance_km)+' km del centro).',
  forecastLevelFt:report.level_ft,stationDistanceKm:report.distance_km,altitudeGapFt:report.altitude_difference_ft,
  notice:report.notice};
}
function computeLeg(leg){
 const air=speedForLeg(leg);
 const airData=air.error?{airMissing:air.error}:{tas:air.tasKt,ias:air.iasKt,cas:air.casKt,
  temperatureC:air.oatC,pressureAltitudeFt:air.pressureAltitudeFt,
  temperatureSource:air.source,tempMode:air.tempMode,qnhAssumed:air.qnhAssumed};
 const date=flightDate();
 const variation=date&&leg.from&&leg.to&&wmm?.magneticVariation
   ?wmm.magneticVariation((leg.from[0]+leg.to[0])/2,(leg.from[1]+leg.to[1])/2,date)
   :null;
 const manualInput=[...legs.querySelectorAll('.flight-leg-row')][leg.index]?.querySelector('.flight-true-track');
 const manualRaw=manualInput?.dataset.estimated==='false'?String(manualInput.value).trim():'';
 const chosen=manualRaw!==''?Number(manualRaw):null;
 const manualTrue=Number.isFinite(chosen)&&chosen>=0&&chosen<360?chosen:null;
 // El curso verdadero de la carta es obligatorio: no sustituirlo por
 // una línea geográfica automática al calcular viento, rumbos o GS.
 const course=manualTrue;
 const magneticTrack=Number.isFinite(variation)&&course!==null?normalize(course-variation):null;
 const courseSource=manualTrue!==null?'Curso verdadero ingresado por el piloto':
  'Curso verdadero pendiente de ingreso';
 if(course===null)return {leg,...airData,course:null,magneticTrack,variation,courseSource,
  reason:'Ingresá el curso verdadero (°T) de esta pierna en Planificar piernas. Sin ese dato no se calcula rumbo ni GS.'};
 const windInfo=windForLeg(leg),wind=windInfo.wind;
 if(air.error||wind===null)
   return {leg,...airData,course,variation,magneticTrack,courseSource,missing:air.error||windInfo.reason};
 const solution=windTriangle(course,air.tasKt,wind.from,wind.speed);
 if(!solution?.possible)return {leg,...airData,course,variation,magneticTrack,courseSource,missing:solution?.reason||'Datos del viento o TAS insuficientes.'};
 return {leg,...airData,course,variation,magneticTrack,courseSource,wind,windSource:windInfo.source,windNotice:windInfo.notice,
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
  (r.courseSource==='Curso verdadero ingresado por el piloto'?'Curso verdadero manual: ':'Derrota verdadera inicial estimada: ')+asLine(r.course)+
   '. Declinación magnética (WMM2025): '+(Number.isFinite(r.variation)?num(r.variation,1)+'° (este +, oeste −)':'No disponible')+
   '. Derrota magnética de referencia: '+asLine(r.magneticTrack)+'.'
 ];
 if(Number.isFinite(r.tas))lines.push('Velocidades: IAS '+num(r.ias,1)+' kt · CAS '+num(r.cas,1)+
   ' kt · TAS '+num(r.tas,1)+' kt · temperatura '+num(r.temperatureC,1)+' °C ('+r.temperatureSource+').'+
   ' Altitud de presión '+num(r.pressureAltitudeFt)+' ft.'+
   (r.qnhAssumed?' QNH no aportado: 1013,25 hPa supuesto.':''));
 if(r.missing){lines.push('Rumbo corregido y GS: no calculables. '+r.missing);return {title:name,lines};}
 lines.push('Viento de altura desde '+String(Math.round(r.wind.from)%360).padStart(3,'0')+'° verdaderos a '+num(r.wind.speed,1)+' kt. '+r.windSource);
 lines.push('Corrección de deriva estimada: '+(r.wca>=0?'+':'')+num(r.wca,1)+'°; rumbo verdadero de proa: '+asLine(r.trueHeading)+
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
 }else if(r.windNotice){
   lines.push('ATENCIÓN · REPRESENTATIVIDAD LIMITADA. '+r.windNotice);
 }else{
   lines.push('ATENCIÓN: viento manual sin ubicación ni nivel contrastados por la Mesa. La GS sigue siendo orientativa hasta verificar su fuente y validez.');
 }
 if(r.magneticHeading===null)lines.push('El rumbo magnético no pudo determinarse sin declinación válida: consultá AIP/carta.');
 return {title:name,lines};
}
function output(){
 // Los cálculos locales se actualizan aunque no se haya solicitado un informe con IA.
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
 const signature=JSON.stringify(route.map(r=>[r.key,r.alt]))+'|'+($('flight-pronarea')?.value||'')+'|'+($('flight-time')?.value||'')+'|'+String($('flight-pronarea-confirm')?.checked);
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
     ' Viento '+String(Math.round(info.wind.from)%360).padStart(3,'0')+'° verdaderos / '+num(info.wind.speed,1)+' kt. Verificá vigencia y representatividad.'
    :'Viento automático no disponible: '+info.reason;
  item.append(source);
  const calculated=speedForLeg(leg);
  const speedNote=document.createElement('p');speedNote.className='flight-nav-source';
  speedNote.textContent=calculated.error?'TAS pendiente: '+calculated.error:
   'IAS '+num(calculated.iasKt,1)+' kt → TAS '+num(calculated.tasKt,1)+' kt · '+
   num(calculated.oatC,1)+' °C ('+calculated.source+').'+
   (calculated.qnhAssumed?' QNH estándar supuesto.':'');
  item.append(speedNote);
  const temperatureLabel=document.createElement('label');
  temperatureLabel.className='flight-nav-temperature';
  temperatureLabel.textContent='Temperatura de crucero (°C, opcional: reemplaza WIND/T o ISA)';
  const temperatureInput=document.createElement('input');
  temperatureInput.type='number';temperatureInput.min='-90';temperatureInput.max='60';
  temperatureInput.step='0.1';temperatureInput.inputMode='decimal';
  temperatureInput.placeholder='Automática';
  temperatureInput.value=temperatureValues.get(leg.key)||'';
  temperatureInput.setAttribute('aria-label','Temperatura de crucero en °C · '+leg.name);
  temperatureInput.addEventListener('input',()=>{
   temperatureValues.set(leg.key,temperatureInput.value);
   const next=speedForLeg(leg);
   speedNote.textContent=next.error?'TAS pendiente: '+next.error:
    'IAS '+num(next.iasKt,1)+' kt → TAS '+num(next.tasKt,1)+' kt · '+
    num(next.oatC,1)+' °C ('+next.source+').'+(next.qnhAssumed?' QNH estándar supuesto.':'');
   output();
  });
  temperatureLabel.append(temperatureInput);item.append(temperatureLabel);
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
// Los cambios de valor en <input> no son mutaciones del DOM: la derrota
// corregida por el piloto debe recalcular la planilla sin esperar otro paso.
const syncLegResults=()=>{schedule();output();};
legs.addEventListener('input',syncLegResults);
legs.addEventListener('change',syncLegResults);
for(const id of ['flight-origin','flight-dest','flight-origin-other','flight-dest-other','flight-time']){
 const node=$(id);
 node?.addEventListener('input',()=>{schedule();output();});
 node?.addEventListener('change',()=>{schedule();output();});
}
waypoints.addEventListener('input',schedule);
$('flight-pronarea')?.addEventListener('input',()=>{aiWindValues.clear();schedule();output();});
for(const id of ['flight-pronarea-confirm']){
 $(id)?.addEventListener('input',()=>{aiWindValues.clear();currentSignature='';schedule();output();});
 $(id)?.addEventListener('change',()=>{aiWindValues.clear();currentSignature='';schedule();output();});
}
for(const input of [iasInput,qnhInput,casCorrectionInput].filter(Boolean)){
 input.addEventListener('input',()=>{currentSignature='';windInputs();output();});
}
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
// Escenarios a niveles WIND/T publicados, para responder preguntas del piloto.
// Se reutilizan exactamente la selección espacial y el triángulo de viento de
// la planilla. No se interpola ni se atribuye a la altitud real un viento de FL.
function navigationScenarios(){
 const raw=$('flight-pronarea')?.value||'',date=flightDate();
 const parsed=windSource?.validity(raw,date)?.ok?windSource?.parse(raw)||[]:[];
 const levels=[...new Set(parsed.map(row=>row.level_ft))].sort((a,b)=>a-b);
 return currentRoute().slice(0,9).map(leg=>{
  const base=computeLeg(leg),altitude=Number(leg.alt);
  const distance=window.GDV_FLIGHT_DISTANCE?.get?.(leg.index)??distanceNm(leg.from,leg.to);
  const result={index:leg.index,name:leg.name,altitude_ft:altitude,
   course_true_deg:base.course,variation_deg:base.variation,
   magnetic_track_deg:base.magneticTrack,distance_nm:distance,
   tas_kt:base.tas??null,selected_level_ft:base.forecastLevelFt??null,
   selected_wind_source:base.windSource||base.missing||base.reason||'No disponible',levels:[]};
  if(!Number.isFinite(altitude)||altitude<500||altitude>45000||
     !Number.isFinite(base.course)||!Number.isFinite(result.tas_kt)||
     !leg.from||!leg.to||!levels.length)return result;
  const below=levels.filter(fl=>fl<=altitude).at(-1);
  const above=levels.find(fl=>fl>=altitude);
  const surrounding=[...new Set([below,above].filter(Number.isFinite))];
  const midpoint=[(leg.from[0]+leg.to[0])/2,(leg.from[1]+leg.to[1])/2];
  for(const fl of surrounding){
   const reference=windSource.pick(raw,fl,midpoint,airports,date,[leg.from,leg.to]);
   // Un nivel publicado en otra zona NO vale para esta pierna.
   if(!reference?.ok||reference.level_ft!==fl)continue;
   // El servidor coteja escenarios con la TAS de la pierna planificada;
   // no atribuir otra TAS a niveles hipotéticos sin modificar ese contrato.
   const triangle=windTriangle(base.course,result.tas_kt,reference.direction_true_deg,reference.speed_kt);
   if(!triangle?.possible)continue;
   const minutes=Number.isFinite(distance)&&distance>0?distance/triangle.groundSpeed*60:null;
   result.levels.push({level_ft:fl,level_gap_ft:Math.abs(fl-altitude),
    station:reference.station,reference_type:reference.reference_type||'nearest_station',
    direction_true_deg:reference.direction_true_deg,speed_kt:reference.speed_kt,
    wca_deg:triangle.wca,heading_true_deg:triangle.trueHeading,
    heading_magnetic_deg:Number.isFinite(base.variation)?normalize(triangle.trueHeading-base.variation):null,
    gs_kt:triangle.groundSpeed,ete_min:minutes});
  }
  result.levels.sort((a,b)=>a.level_ft-b.level_ft);
  return result;
 });
}
window.GDV_FLIGHT_NAV=Object.freeze({
 saveTemperatures:()=>[...temperatureValues.entries()].map(([key,value])=>({key,value})),
 restoreTemperatures:entries=>{
  temperatureValues.clear();if(Array.isArray(entries))for(const row of entries.slice(0,9)){
   if(row&&typeof row.key==='string'&&row.key.length<150&&typeof row.value==='string'&&row.value.length<12)
    temperatureValues.set(row.key,row.value);
  }
  currentSignature='';windInputs();output();
 },
 saveWind:()=>[...windValues.entries()].map(([key,value])=>({key,value:{...value}})),restoreWind:entries=>{
  windValues.clear();if(Array.isArray(entries))for(const row of entries.slice(0,9)){
   if(row&&typeof row.key==='string'&&row.key.length<150&&row.value&&typeof row.value==='object')
    windValues.set(row.key,{mode:row.value.mode==='manual'?'manual':'auto',direction:String(row.value.direction??'').slice(0,4),speed:String(row.value.speed??'').slice(0,4)});
  }
  currentSignature='';windInputs();output();
 },navigationScenarios,snapshot:()=>currentRoute().map(leg=>{
 const result=computeLeg(leg);
 return {index:leg.index,name:leg.name,altitude_ft:Number(leg.alt),distance_nm:window.GDV_FLIGHT_DISTANCE?.get?.(leg.index)??distanceNm(leg.from,leg.to),distance_source:window.GDV_FLIGHT_DISTANCE?.getSource?.(leg.index)||'geometric',magnetic_track_deg:result.magneticTrack,course_source:result.courseSource,
   ias_kt:result.ias,tas_kt:result.tas,temperature_c:result.temperatureC,
   temperature_source:result.temperatureSource||result.airMissing||'No disponible',pressure_altitude_ft:result.pressureAltitudeFt,
   course_true_deg:result.course,heading_true_deg:result.trueHeading,
   heading_magnetic_deg:result.magneticHeading,variation_deg:result.variation,
   wind_correction_deg:result.wca,wind_true_from_deg:result.wind?.from,wind_speed_kt:result.wind?.speed,
   gs_kt:result.gs,wind_source:result.windSource||result.missing||result.reason||'Sin viento verificable',
   from:leg.from,to:leg.to};
})});
schedule();
})();
