/* Flight Operations - Navigation appendix for Essential Flight Report.
 * This is a LOCAL calculation; never uses OpenAI or fetch.
 * Sources: airport coordinates from GDV reference (ANAC 2021);
 * WMM2025 magnetic variation (2025-2030); TAS and forecast winds
 * explicitly entered by the pilot. No wind is inferred from METAR.
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
if(!target||!settings||!tasInput||!legs||!waypoints)return;
const rad=Math.PI/180,deg=180/Math.PI;
const normalize=d=>((d%360)+360)%360;
const num=(v,digits=0)=>Number(v).toLocaleString('es-AR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const windValues=new Map();
let currentSignature='';
const readCode=id=>{
 const el=$(id);
 return String((el?.value==='OTHER'?$(id+'-other')?.value:el?.value)||'').trim().toUpperCase();
};
const point=value=>{
 const name=String(value||'').trim().toUpperCase();
 if(airports?.[name])return airports[name];
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
function windForLeg(leg){
 const data=windValues.get(leg.key)||{};
 const speedStr=String(data.speed??'').trim(),directionStr=String(data.direction??'').trim();
 const speed=speedStr!==''?Number(speedStr):null;
 const from=directionStr!==''?Number(directionStr):null;
 if(speed===null||!Number.isFinite(speed)||speed<0||speed>200)return null;
 if(speed===0)return {speed,from:0};
 if(from===null||!Number.isFinite(from)||from<0||from>359||!Number.isInteger(from))return null;
 return {speed,from};
}
function computeLeg(leg){
 const course=trueTrack(leg.from,leg.to);
 if(course===null)return {leg,course:null,reason:'Sin coordenadas conocidas para uno de los puntos. No se calculan rumbo ni GS.'};
 const date=flightDate();
 const variation=date&&leg.from&&leg.to&&wmm?.magneticVariation
   ?wmm.magneticVariation((leg.from[0]+leg.to[0])/2,(leg.from[1]+leg.to[1])/2,date)
   :null;
 const magneticTrack=Number.isFinite(variation)?normalize(course-variation):null;
 const tas=readTAS(),wind=windForLeg(leg);
 if(tas===null||wind===null)
   return {leg,course,variation,magneticTrack,missing:tas===null?'Falta TAS válida (kt); completala para calcular rumbo con viento y GS.':'Faltan datos válidos de viento en altura (dirección verdadera y velocidad en kt) para esta pierna.'};
 const solution=windTriangle(course,tas,wind.from,wind.speed);
 if(!solution?.possible)return {leg,course,variation,magneticTrack,missing:solution?.reason||'Datos del viento o TAS insuficientes.'};
 return {leg,course,variation,magneticTrack,wind,tas,
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
 lines.push('Datos declarados: TAS '+num(r.tas)+' kt; viento de altura desde '+String(r.wind.from).padStart(3,'0')+'° verdaderos a '+num(r.wind.speed)+' kt.');
 lines.push('Corrección por viento: '+(r.wca>=0?'+':'')+num(r.wca,1)+'°; rumbo verdadero de proa: '+asLine(r.trueHeading)+
   '; rumbo magnético de proa: '+asLine(r.magneticHeading)+
   '; velocidad estimada sobre el suelo (GS): '+num(r.gs,1)+' kt.');
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
 note.textContent='Cálculo local y aproximado: derrota verdadera inicial geométrica entre puntos, variación WMM2025 y triángulo de viento con la TAS/viento declarados. No usa viento METAR. El pronóstico en altura debe verificarse por tramo, nivel y horario con PRONAREA/SMN o fuente oficial; viento y variación pueden cambiar en ruta. El rumbo de brújula requiere además la desviación magnética de la aeronave. No es navegación certificada, no verifica cartas, obstáculos, AGL ni autorización ATC.';
 target.append(note);
}
function windInputs(){
 const route=currentRoute();
 const signature=JSON.stringify(route.map(r=>[r.key,r.alt]));
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
  const fields=document.createElement('div');fields.className='flight-nav-leg-fields';
  const winds=windValues.get(leg.key)||{};
  for(const field of [
   {key:'direction',name:'Viento DESDE (° verdaderos)',placeholder:'Ej.: 270',max:'359'},
   {key:'speed',name:'Velocidad del viento (kt)',placeholder:'Ej.: 15',max:'200'}
  ]){
   const label=document.createElement('label');label.textContent=field.name;
   const input=document.createElement('input');
   input.type='number';input.min='0';input.max=field.max;input.step='1';input.inputMode='numeric';
   input.placeholder=field.placeholder;
   input.value=String(winds[field.key]??'');
   input.setAttribute('aria-label',field.name+' · '+leg.name);
   input.addEventListener('input',()=>{
    const state=windValues.get(leg.key)||{};
    state[field.key]=input.value;
    windValues.set(leg.key,state);
    output();
   });
   label.append(input);fields.append(label);
  }
  item.append(fields);grid.append(item);
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
tasInput.addEventListener('input',output);
document.addEventListener('gdv-flight-essential-generated',()=>{schedule();output();});
schedule();
})();