/* Flight Operations | Referencias intermedias orientativas por corredor geográfico.
 * Catálogo limitado de aeródromos locales + Rufino. Distancias ortodrómicas.
 * No son aerovías, rutas VFR aprobadas, puntos de notificación ni
 * autorizaciones. No calcula/garantiza separaciones ni obstáculos.
 * Sin IA, endpoints o tokens. El piloto debe confirmar en AIP y cartas. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const geodata=window.GDV_FLIGHT_FIR_GEODATA;
const knownPoints=window.GDV_FLIGHT_NAMED_POINTS||{};
const origin=$('flight-origin'),destination=$('flight-dest');
const container=$('flight-suggested-route'),button=$('flight-suggest-route');
const add=$('flight-add-stop'),waypoints=$('flight-waypoints');
if(!geodata||!origin||!destination||!container||!button||!add||!waypoints)return;
const rad=Math.PI/180,earthKm=6371;
const fmtKm=n=>Math.round(n).toLocaleString('es-AR')+' km';
const coordinates={...geodata.airports,RUFINO:knownPoints.RUFINO};
const candidates=Object.entries(coordinates)
  .filter(([code,coord])=>Array.isArray(coord)&&coord.length===2&&coord.every(Number.isFinite))
  .map(([code,coord])=>({code,coords:coord,kind:code==='RUFINO'?'Referencia geográfica':'Aeródromo con identificador OACI'}));
function fieldCode(id){
 const node=$(id);
 return String((node?.value==='OTHER'?$(id+'-other')?.value:node?.value)||'').trim().toUpperCase();
}
function distance(a,b){
 const phi=(b[0]-a[0])*rad,lambda=(b[1]-a[1])*rad;
 const h=Math.sin(phi/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(lambda/2)**2;
 return 2*earthKm*Math.asin(Math.min(1,Math.sqrt(h)));
}
function estimate(from,to){
 const A=coordinates[from],B=coordinates[to];
 if(!A||!B)return {error:'No hay coordenadas de referencia para el origen o destino elegido. Podés cargar puntos manualmente según las cartas oficiales.'};
 const direct=distance(A,B);
 if(direct<120)return {direct,options:[],info:'El recorrido es relativamente corto; el catálogo no propone una escala automática. Revisá las referencias publicadas en las cartas VFR.'};
 const points=candidates.filter(item=>item.code!==from&&item.code!==to).map(item=>{
   const a=distance(A,item.coords),b=distance(B,item.coords);
   const along=(direct*direct+a*a-b*b)/(2*direct);
   const off=Math.sqrt(Math.max(0,a*a-along*along));
   return {...item,a,b,progress:along/direct,off,extra:a+b-direct};
 }).filter(item=>
   item.progress>0.12&&item.progress<0.88&&
   item.off<=Math.min(100,Math.max(35,direct*0.10))&&
   item.extra<=Math.max(12,direct*0.06)&&
   item.a>50&&item.b>50
 ).sort((a,b)=>(a.off+Math.abs(a.progress-0.5)*45)-(b.off+Math.abs(b.progress-0.5)*45));
 const proposals=[];
 function propose(list){
   if(!list.length)return;
   const used=[from,...list.map(item=>item.code),to];
   const points=[A,...list.map(item=>item.coords),B];
   const length=points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
   const extra=length-direct;
   if(extra>Math.max(12,direct*0.06))return;
   const key=list.map(x=>x.code).join('|');
   if(proposals.some(x=>x.key===key))return;
   proposals.push({key,nodes:list.map(x=>x.code),items:list,route:used.join(' → '),length,direct,extra});
 }
 if(points.length)propose([points[0]]);
 if(direct>=500&&points.length>=2){
   let pair=null,best=Infinity;
   for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
     const both=[points[i],points[j]].sort((a,b)=>a.progress-b.progress);
     if(both[1].progress-both[0].progress<0.20)continue;
     const spacing=Math.abs(both[0].progress-1/3)+Math.abs(both[1].progress-2/3);
     const penalty=both[0].off+both[1].off+spacing*75;
     if(penalty<best){best=penalty;pair=both;}
   }
   if(pair)propose(pair);
 }
 if(direct>=1200&&points.length>=3){
   let triple=null,best=Infinity;
   const subset=points.slice(0,18);
   for(let i=0;i<subset.length;i++)for(let j=i+1;j<subset.length;j++)for(let k=j+1;k<subset.length;k++){
     const trio=[subset[i],subset[j],subset[k]].sort((a,b)=>a.progress-b.progress);
     if(trio[1].progress-trio[0].progress<0.15||trio[2].progress-trio[1].progress<0.15)continue;
     const fit=Math.abs(trio[0].progress-.25)+Math.abs(trio[1].progress-.5)+Math.abs(trio[2].progress-.75);
     const score=trio.reduce((t,c)=>t+c.off,0)+fit*90;
     if(score<best){best=score;triple=trio;}
   }
   if(triple)propose(triple);
 }
 return {direct,options:proposals.slice(0,3),info:points.length?'':'No se identificaron puntos de nuestro catálogo suficientemente próximos a la ruta directa. Esto NO implica que no existan referencias aeronáuticas publicadas.'};
}
function humanName(code){
 if(code==='RUFINO')return 'Rufino';
 const option=[...origin.options,...destination.options].find(item=>item.value===code);
 const label=option?.textContent?.trim().split(' · ')[0]||'';
 return label&&label!==code?label+' ('+code+')':code;
}
function element(tag,className,text){
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!==undefined)node.textContent=text;
 return node;
}
let shownKey='';
function show(message){
 container.replaceChildren();
 container.append(element('p','flight-route-note',message));
 container.hidden=false;
 button.setAttribute('aria-expanded','true');
}
function applyOption(nodes,expected){
 const current=fieldCode('flight-origin')+'|'+fieldCode('flight-dest');
 if(current!==expected){show('Cambió el origen o el destino. Volvé a solicitar sugerencias antes de modificar las piernas.');return;}
 if(waypoints.querySelector('.flight-waypoint-row')){
   show('Ya cargaste puntos intermedios. Para evitar borrar o alterar tu planificación, quitá manualmente los puntos existentes antes de aplicar otro recorrido sugerido.');
   return;
 }
 if(add.disabled||nodes.length>8)return;
 // El botón original conserva la lógica de alturas por pierna, FIR y navegación;
 // insertar con ese mismo flujo, sin modificar estados internos.
 for(const code of nodes){
   if(add.disabled){show('No se pudo completar el recorrido sugerido: alcanzaste el máximo de puntos intermedios.');return;}
   add.click();
   const row=waypoints.querySelector('.flight-waypoint-row:last-child input');
   if(!row){show('No se pudo añadir el punto; revisá las piernas manualmente.');return;}
   row.value=code;
   row.dispatchEvent(new Event('input',{bubbles:true}));
   row.dispatchEvent(new Event('change',{bubbles:true}));
 }
 show('Puntos incorporados en orden: '+nodes.join(' → ')+'. Revisá ahora derrota, altitud VFR de cada pierna, FIR, espacio aéreo, terreno y navegación en las cartas oficiales.');
 $('flight-legs-list')?.scrollIntoView({behavior:'smooth',block:'center'});
}
function render(){
 const from=fieldCode('flight-origin'),to=fieldCode('flight-dest');
 if(!from||!to){show('Seleccioná primero aeródromos de salida y destino.');return;}
 if(from===to){show('Origen y destino deben ser diferentes para sugerir piernas.');return;}
 const result=estimate(from,to);
 if(result.error){show(result.error);return;}
 const key=from+'|'+to;
 shownKey=key;
 container.replaceChildren();
 const lead=element('p','flight-route-note','Referencia de distancia directa: '+fmtKm(result.direct)+
  '. Las alternativas se calculan por proximidad geográfica, NO por rutas publicadas ni por aptitud operativa.');
 container.append(lead);
 if(!result.options.length){
   container.append(element('p','flight-route-note',result.info||'No hay suficientes puntos de referencia próximos en el catálogo para ofrecer alternativas.'));
 }else{
   const list=element('div','flight-route-options');
   for(const option of result.options){
     const row=element('article','flight-route-option');
     const title=element('strong','',option.items.length===1?'Sugerencia con 1 punto intermedio':'Sugerencia con '+option.items.length+' puntos intermedios');
     const path=element('p','flight-route-path',[from,...option.nodes,to].map(humanName).join(' → '));
     const metrics=element('p','flight-route-metrics',
       'Recorrido aproximado '+fmtKm(option.length)+' · desvío de '+fmtKm(option.extra)+
       ' respecto de la línea directa. Referencias geográficas, no ruta validada.');
     const labels=element('p','flight-route-metrics',
       option.items.map(item=>humanName(item.code)+' ('+item.kind+
         ', desplazamiento lateral '+fmtKm(item.off)+' aprox.)').join(' · '));
     const action=element('button','secondary','Incorporar estas piernas');
     action.type='button';action.addEventListener('click',()=>applyOption(option.nodes,key));
     row.append(title,path,metrics,labels,action);list.append(row);
   }
   container.append(list);
 }
 container.append(element('p','flight-route-disclaimer',
   'No se comprueban corredores VFR, espacios prohibidos/restringidos, obstáculos, relieve, mínimos, combustible, aeródromos alternativos ni procedimientos ATC. Un aeródromo sugerido es una referencia geográfica, no una escala autorizada. Confirmá los puntos y la ruta en las cartas y el AIP vigente.'));
 container.hidden=false;
 button.setAttribute('aria-expanded','true');
}
button.addEventListener('click',()=>{
 if(!container.hidden&&shownKey===fieldCode('flight-origin')+'|'+fieldCode('flight-dest')){
   container.hidden=true;button.setAttribute('aria-expanded','false');return;
 }
 render();
});
for(const id of ['flight-origin','flight-dest','flight-origin-other','flight-dest-other']){
 $(id)?.addEventListener('change',()=>{if(!container.hidden)container.hidden=true;button.setAttribute('aria-expanded','false');shownKey='';});
 $(id)?.addEventListener('input',()=>{if(!container.hidden)container.hidden=true;button.setAttribute('aria-expanded','false');shownKey='';});
}
// Export helpers for repeatable route-geometry tests (pure functions only).
window.GDV_ROUTE_SUGGESTIONS=Object.freeze({estimate,distance});
})();