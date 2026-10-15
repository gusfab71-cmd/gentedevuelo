/* Flight Operations - preselección orientativa de FIR según ruta.
   Solo geometría local, sin red ni IA. Los límites son simplificados:
   cotejar SIEMPRE el AIP Argentina ENR 2.1 vigente. */
(()=>{
'use strict';
const meta=window.GDV_FLIGHT_FIR_GEODATA;
const checkboxes=[...document.querySelectorAll('input.flight-fir')];
const modeButton=document.getElementById('flight-fir-auto-mode');
const status=document.getElementById('flight-fir-auto-status');
const waypoints=document.getElementById('flight-waypoints');
if(!meta||!checkboxes.length||!modeButton||!status||!waypoints)return;
const airports=meta.airports,polygons=meta.polygons;
const knownNames={SAEF:'Ezeiza',SACF:'Córdoba',SAMF:'Mendoza',SARR:'Resistencia',SAVF:'Comodoro Rivadavia'};
const ordered=['SAEF','SACF','SAMF','SARR','SAVF'];
const candidates=ordered.map(code=>{
 const polygon=polygons[code]?.[0]||[];
 return {code,polygon,
  bbox:[
   Math.min(...polygon.map(pt=>pt[0])),Math.min(...polygon.map(pt=>pt[1])),
   Math.max(...polygon.map(pt=>pt[0])),Math.max(...polygon.map(pt=>pt[1]))
  ]};
});
let automatic=true,updating=false,pending=null;
function airport(id){
 const select=document.getElementById(id);
 if(!select)return '';
 const field=select.value==='OTHER'?document.getElementById(id+'-other'):select;
 return (field?.value||'').trim().toUpperCase();
}
function parsePoint(text){
 const value=String(text||'').trim().toUpperCase();
 if(airports[value])return airports[value];
 // Puntos intermedios numéricos explícitos: latitud, longitud en grados decimales.
 const match=/^(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(value);
 if(match){
  const lat=Number(match[1]),lon=Number(match[2]);
  if(lat>=-90&&lat<=90&&lon>=-180&&lon<=180)return [lat,lon];
 }
 return null;
}
function within(lon,lat,polygon){
 let found=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a[1]>lat)!=(b[1]>lat)&&
     lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])found=!found;
 }
 return found;
}
function classify([lat,lon]){
 const found=[];
 for(const entry of candidates){
  const [x0,y0,x1,y1]=entry.bbox;
  if(lon>=x0&&lon<=x1&&lat>=y0&&lat<=y1&&within(lon,lat,entry.polygon))
   found.push(entry.code);
 }
 return found;
}
const radians=Math.PI/180;
function angularDistance(a,b){
 const dLat=(b[0]-a[0])*radians,dLon=(b[1]-a[1])*radians;
 const q=Math.sin(dLat/2)**2+Math.cos(a[0]*radians)*Math.cos(b[0]*radians)*Math.sin(dLon/2)**2;
 return 2*Math.asin(Math.min(1,Math.sqrt(q)));
}
function intermediate(a,b,t,delta){
 if(delta<1e-10)return a;
 const sinD=Math.sin(delta);
 const k1=Math.sin((1-t)*delta)/sinD,k2=Math.sin(t*delta)/sinD;
 const p1=a[0]*radians,p2=b[0]*radians;
 const l1=a[1]*radians,l2=b[1]*radians;
 const x=k1*Math.cos(p1)*Math.cos(l1)+k2*Math.cos(p2)*Math.cos(l2);
 const y=k1*Math.cos(p1)*Math.sin(l1)+k2*Math.cos(p2)*Math.sin(l2);
 const z=k1*Math.sin(p1)+k2*Math.sin(p2);
 return [Math.atan2(z,Math.hypot(x,y))/radians,Math.atan2(y,x)/radians];
}
function crossRoute(points){
 const selected=new Set();
 let outside=0,samples=0;
 for(let j=0;j<points.length-1;j++){
  const a=points[j],b=points[j+1];
  const delta=angularDistance(a,b);
  const count=Math.min(1600,Math.max(1,Math.ceil(delta*6371/8)));
  for(let i=0;i<=count;i++){
   const located=intermediate(a,b,i/count,delta);
   const firs=classify(located);
   for(const fir of firs)selected.add(fir);
   if(!firs.length)outside++;
   samples++;
  }
 }
 return {selected,outside,samples};
}
function renderMode(){
 modeButton.textContent=automatic?'Cambiar a selección manual':'Volver a selección automática';
 modeButton.setAttribute('aria-pressed',String(automatic));
}
function routeData(){
 const originCode=airport('flight-origin'),destinationCode=airport('flight-dest');
 if(!originCode||!destinationCode)return {error:'Seleccioná salida y destino para identificar las FIR de la ruta.'};
 const departure=parsePoint(originCode),destination=parsePoint(destinationCode);
 if(!departure||!destination)
  return {error:'No se dispone de coordenadas verificables para '+[!departure?originCode:null,!destination?destinationCode:null].filter(Boolean).join(', ')+'. Comprobá las FIR manualmente.'};
 const rows=[...waypoints.querySelectorAll('.flight-waypoint-row input')];
 const stops=[];
 for(const row of rows){
  const value=row.value.trim();
  const coords=parsePoint(value);
  if(!coords)return {error:'Punto intermedio sin ubicación conocida: '+(value||'sin completar')+'. Para autoselección usá su OACI registrado o coordenadas «latitud, longitud»; de otro modo seleccioná FIR manualmente.'};
  stops.push(coords);
 }
 const route=[departure,...stops,destination];
 const alternateCode=airport('flight-alternate');
 const alternate=alternateCode?parsePoint(alternateCode):null;
 return {route,alternate,alternateCode};
}
function update(){
 if(!automatic){status.textContent='Selección manual: conservamos las FIR que marcaste. Para recalcularlas con la ruta, pulsá «Volver a selección automática».';return;}
 const data=routeData();
 if(data.error){
  status.textContent='Cálculo automático pendiente: '+data.error+' Las casillas actuales no se actualizaron; verificá el AIP antes de consultar SIGMET.';
  return;
 }
 const result=crossRoute(data.route);
 if(data.alternate){
  // También contemplar un posible desvío directo al alternativo; no es ruta aprobada.
  const diversion=crossRoute([data.route[data.route.length-1],data.alternate]);
  for(const fir of diversion.selected)result.selected.add(fir);
  result.outside+=diversion.outside;
  result.samples+=diversion.samples;
 }
 if(!result.selected.size){
  status.textContent='No se identificó ninguna FIR argentina en los trazados aproximados. Conservamos tu selección actual: verificá la ruta y los límites oficiales.';
  return;
 }
 updating=true;
 try{
  for(const checkbox of checkboxes){
   const value=result.selected.has(checkbox.value);
   if(checkbox.checked!==value){
    checkbox.checked=value;
    checkbox.dispatchEvent(new Event('change',{bubbles:true}));
   }
  }
 }finally{updating=false;}
 const names=ordered.filter(code=>result.selected.has(code)).map(code=>knownNames[code]);
 const notes=[];
 if(data.alternate)notes.push('incluye como referencia el desvío directo destino→alternativo');
 else if(data.alternateCode)notes.push('no se pudo identificar el desvío hacia el alternativo');
 if(result.outside>0)notes.push('hay puntos fuera de estas cinco FIR: revisá FIR de países vecinos y límites');
 status.textContent='Preselección automática: '+names.join(', ')+'. '+
 (notes.length?notes.join('; ')+'. ':'')+
 'Trazado geográfico aproximado, no validado para navegación. Confirmá cada FIR en el AIP vigente; podés corregir las casillas manualmente.';
}
function queueUpdate(){
 if(pending!==null)clearTimeout(pending);
 pending=setTimeout(()=>{pending=null;update();},90);
}
modeButton.addEventListener('click',()=>{
 automatic=!automatic;
 renderMode();
 update();
});
for(const checkbox of checkboxes){
 checkbox.addEventListener('change',()=>{
  if(updating)return;
  automatic=false;
  renderMode();update();
 });
}
for(const id of ['flight-origin','flight-dest','flight-alternate','flight-origin-other','flight-dest-other','flight-alternate-other']){
 const node=document.getElementById(id);
 node?.addEventListener('change',queueUpdate);
 node?.addEventListener('input',queueUpdate);
}
waypoints.addEventListener('change',queueUpdate);
waypoints.addEventListener('input',queueUpdate);
new MutationObserver(queueUpdate).observe(waypoints,{childList:true});
renderMode();
queueUpdate();
})();