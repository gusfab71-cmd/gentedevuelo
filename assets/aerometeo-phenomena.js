/* AeroMeteo · capas de SIGMET + consulta PUNTUAL de niebla y tormentas.
 * El radar ya existe en otro módulo y permanece independiente.
 */
(function(root){
'use strict';
const TYPES=['storms','fog','turbulence','icing','ash'];
const SIGMET=new Set(['storms','turbulence','icing','ash']);
const COLORS={storms:'#ffb34e',turbulence:'#bf92e7',icing:'#63c7ef',ash:'#e79383'};
const $=id=>document.getElementById(id);
const when=t=>{
 const d=new Date(t);
 return Number.isFinite(d.getTime())?
  new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',
   day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' ART':
  'Fecha no verificada';
};
function validPoint(p){
 return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>=-56&&p.lat<=-21&&p.lon>=-76&&p.lon<=-52;
}
function isCurrentSigmet(feature,now=Date.now()){
 const p=feature?.properties;
 const start=Date.parse(p?.validFrom),end=Date.parse(p?.validTo);
 return Number.isFinite(start)&&Number.isFinite(end)&&start<=now&&end>now;
}
function checkedAtIsFresh(value,now=Date.now()){
 const checked=Date.parse(value);
 return Number.isFinite(checked)&&checked<=now+60000&&checked>=now-15*60000;
}
function boot({map,L}){
 const toggle=$('am-phenomena-toggle'),panel=$('am-phenomena-panel'),
  status=$('am-phenomena-status'),refresh=$('am-phenomena-refresh'),
  pick=$('am-phenomena-pick'),pointBox=$('am-phenomena-point-result');
 if(!toggle||!panel||!map||!L||!pointBox)return null;
 const checks=Array.from(panel.querySelectorAll('input[data-phenomenon]'));
 const options=new Map(checks.map(input=>[input.dataset.phenomenon,input]));
 const active=key=>options.get(key)?.checked===true;
 const needSIGMET=()=>[...SIGMET].some(active);
 const needPoint=()=>active('storms')||active('fog');
 const layer=L.geoJSON(null,{
  style:feature=>({
   color:COLORS[feature.properties.kind]||'#edc19e',
   fillColor:COLORS[feature.properties.kind]||'#edc19e',
   weight:2,opacity:.95,fillOpacity:.17,dashArray:'6 4'
  }),
  onEachFeature:(feature,area)=>{
   const p=feature.properties||{};
   const box=document.createElement('div');
   const title=document.createElement('strong');
   title.textContent=(p.label||'Fenómeno')+' · SIGMET';
   box.append(title);
   for(const line of [
    'Inicio: '+when(p.validFrom),'Fin: '+when(p.validTo),
    p.fir?'Región informada: '+p.fir:'',
    'Fuente: NOAA Aviation Weather Center'
   ]){
    if(!line)continue;
    const row=document.createElement('p');row.textContent=line;box.append(row);
   }
   if(p.raw){
    const original=document.createElement('pre');
    original.textContent=p.raw;original.style.cssText=
      'white-space:pre-wrap;overflow-wrap:anywhere;max-height:145px;overflow:auto;font-size:10px';
    box.append(original);
   }
   area.bindPopup(box,{maxWidth:290});
   area.on('click',event=>{if(event.originalEvent)L.DomEvent.stopPropagation(event.originalEvent)});
  }
 }).addTo(map);
 let open=false,picking=false,loadId=0,pointId=0,stamp=0,
  catalogue=[],pointLayer=null,requesting=false,nextExpiry=Infinity,pointCheckedAt=0;
 function tell(message){status.textContent=message}
 function setPicking(on){
  picking=Boolean(on);
  pick.setAttribute('aria-pressed',String(picking));
  pick.textContent=picking?'Cancelar elección':'Elegir punto del mapa';
  map.getContainer().classList.toggle('am-phenomena-picking',picking);
 }
 function clearPoint(){
  pointId++;pointCheckedAt=0;
  pointBox.replaceChildren();pointBox.hidden=true;
  if(pointLayer){map.removeLayer(pointLayer);pointLayer=null}
 }
 function redraw(){
  layer.clearLayers();nextExpiry=Infinity;
  if(!open||!needSIGMET())return;
  let count=0;
  const now=Date.now();
  for(const feature of catalogue){
   if(!active(feature.properties?.kind)||!isCurrentSigmet(feature,now))continue;
   layer.addData(feature);count++;
   nextExpiry=Math.min(nextExpiry,Date.parse(feature.properties.validTo));
  }
  tell(count?
   count+' zona(s) SIGMET vigente(s) visibles en el mapa. Tocá un polígono para ver el aviso.':
   'Sin zonas SIGMET vigentes representables para los filtros elegidos. No implica ausencia de peligro.');
 }
 async function loadSigmet(){
  if(!open||!needSIGMET())return;
  const id=++loadId;
  tell('Consultando SIGMET internacionales…');
  refresh.disabled=true;requesting=true;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),13000);
  try{
   const response=await fetch('/api/aerometeo-sigmet',{headers:{Accept:'application/json'},signal:controller.signal});
   if(!response.ok)throw Error('No se pudo consultar SIGMET');
   const data=await response.json();
   if(id!==loadId||!open||!needSIGMET())return;
   if(data.ok!==true||data.type!=='FeatureCollection'||!Array.isArray(data.features)||
    !checkedAtIsFresh(data.checkedAt))throw Error('Respuesta SIGMET inválida o desactualizada');
   catalogue=data.features.filter(f=>f?.type==='Feature'&&
    (f.geometry?.type==='Polygon'||f.geometry?.type==='MultiPolygon')&&
    SIGMET.has(f.properties?.kind)&&isCurrentSigmet(f));
   stamp=Date.parse(data.checkedAt);
   redraw();
   const p=document.createElement('small');
   p.textContent='Consulta: '+when(data.checkedAt)+' · '+data.source+
    (data.stats?.missingValidity?' · '+data.stats.missingValidity+' avisos sin vigencia comprobable excluidos':'');
   status.append(p);
  }catch(_){
   if(id!==loadId||!open)return;
   catalogue=[];layer.clearLayers();
   tell('SIGMET no disponibles en este momento. No se puede confirmar ausencia de avisos; consultá el SMN.');
  }finally{
   clearTimeout(timeout);
   if(id===loadId){requesting=false;refresh.disabled=false}
  }
 }
 async function inspectPoint(point){
  if(!open||!needPoint()||!validPoint(point))return false;
  const id=++pointId;
  // El resultado anterior deja de representar el punto consultado.
  pointCheckedAt=0;
  if(pointLayer){map.removeLayer(pointLayer);pointLayer=null}
  pointBox.hidden=false;pointBox.replaceChildren();
  const initial=document.createElement('p');
  initial.textContent='Consultando estimación de tormentas y niebla para '+(point.name||'el punto')+'…';
  pointBox.append(initial);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),11000);
  try{
   const params=new URLSearchParams({lat:point.lat.toFixed(5),lon:point.lon.toFixed(5)});
   const response=await fetch('/api/aerometeo-phenomena-point?'+params,{
    headers:{Accept:'application/json'},signal:controller.signal
   });
   if(!response.ok)throw Error('Modelo no disponible');
   const data=await response.json();
   if(id!==pointId||!open||!needPoint())return false;
   if(data.ok!==true||data.kind!=='point_model_estimate'||
    !checkedAtIsFresh(data.checkedAt)||!Number.isFinite(Date.parse(data.forecastAt)))
    throw Error('Modelo inválido o desactualizado');
   pointCheckedAt=Date.parse(data.checkedAt);
   pointBox.replaceChildren();
   const strong=document.createElement('strong');
   strong.textContent='Modelo puntual · '+(point.name||'coordenadas seleccionadas');
   pointBox.append(strong);
   const text=[];
   if(active('storms'))text.push(
    data.storm===true?'Tormenta estimada por el modelo en este punto.':
    data.storm===false?'Sin señal de tormenta en el código del modelo para esta hora (no descarta tormentas).':
    'Sin dato de tormenta disponible.');
   if(active('fog'))text.push(
    data.fog===true?'Niebla estimada por el modelo en este punto.':
    data.fog===false?'Sin señal de niebla en el código del modelo para esta hora (no descarta niebla).':
    'Sin dato de niebla disponible.');
   if(data.visibilityM!==null&&data.visibilityM!==undefined)
    text.push('Visibilidad estimada: '+Math.round(data.visibilityM).toLocaleString('es-AR')+' metros.');
   text.push('Modelo: '+when(data.forecastAt)+'.');
   for(const line of text){
    const p=document.createElement('p');p.textContent=line;pointBox.append(p);
   }
   const note=document.createElement('small');
   note.textContent='Estimación puntual, no observación ni alerta. No extrapolar a otras zonas.';
   pointBox.append(note);
   if(pointLayer)map.removeLayer(pointLayer);
   pointLayer=L.circleMarker([point.lat,point.lon],{
    radius:9,color:'#62e6cc',fillColor:'#32bca4',fillOpacity:.6,weight:2
   }).addTo(map);
   pointLayer.bindTooltip('Consulta de modelo puntual · '+when(data.forecastAt));
   return true;
  }catch(_){
   if(id!==pointId||!open)return false;
   pointBox.textContent='No se pudo obtener una estimación puntual. No se muestran fenómenos sin datos.';
   return false;
  }finally{clearTimeout(timeout)}
 }
 function setOpen(next){
  open=Boolean(next);
  toggle.setAttribute('aria-pressed',String(open));
  toggle.setAttribute('aria-expanded',String(open));
  toggle.classList.toggle('is-active',open);
  panel.hidden=!open;
  if(!open){
   loadId++;catalogue=[];layer.clearLayers();clearPoint();setPicking(false);return;
  }
  if(needSIGMET())void loadSigmet();
  else tell('Activá Tormentas, Turbulencia, Engelamiento o Ceniza para consultar SIGMET.');
 }
 toggle.addEventListener('click',()=>setOpen(!open));
 checks.forEach(check=>check.addEventListener('change',()=>{
  if(!TYPES.includes(check.dataset.phenomenon))return;
  if(check.dataset.phenomenon==='storms'||check.dataset.phenomenon==='fog')clearPoint();
  if(!needPoint())setPicking(false);
  if(needSIGMET()){
   if(!stamp||Date.now()-stamp>10*60000||!catalogue.length)void loadSigmet();
   else redraw();
  }else{loadId++;catalogue=[];layer.clearLayers();
   tell('Capas SIGMET desactivadas. Elegí un punto para consultar niebla o tormentas del modelo.')}
 }));
 refresh.addEventListener('click',()=>{if(open&&needSIGMET())void loadSigmet()});
 pick.addEventListener('click',()=>{
  if(!open)return;
  if(!needPoint()){tell('Activá Niebla o Tormentas para consultar un punto.');return}
  setPicking(!picking);
  if(picking)tell('Hacé clic en el mapa para consultar una estimación puntual.');
 });
 map.on('click',event=>{
  if(!open||!picking||!needPoint()||$('aerometeo-pick-location')?.getAttribute('aria-pressed')==='true')return;
  setPicking(false);
  const place={name:'punto del mapa',lat:event.latlng.lat,lon:event.latlng.lng};
  if(validPoint(place))void inspectPoint(place);
  else tell('Seleccioná un punto dentro de Argentina.');
 });
 // No dejar polígonos vencidos ni estimaciones antiguas visibles si la página sigue abierta.
 // Verificación local sin llamadas de red ni consumo de cuota de los proveedores.
 const clock=setInterval(()=>{
  if(!open)return;
  if(needSIGMET()&&Date.now()>=nextExpiry)redraw();
  if(pointCheckedAt&&Date.now()-pointCheckedAt>=20*60000){
   clearPoint();pointBox.hidden=false;
   pointBox.textContent='La estimación puntual quedó desactualizada. Seleccioná nuevamente el punto para consultar datos actuales.';
  }
 },30000);
 root.addEventListener('pagehide',()=>clearInterval(clock),{once:true});
 return {inspectPoint,cancelPick:()=>setPicking(false),state:()=>({open,picking,selected:TYPES.filter(active),shown:layer.getLayers().length})};
}
root.GDV_AEROMETEO_PHENOMENA={boot,validPoint};
if(typeof module==='object'&&module.exports)module.exports={boot,validPoint,isCurrentSigmet,checkedAtIsFresh};
})(typeof window!=='undefined'?window:globalThis);
