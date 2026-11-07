/* Gente de Vuelo · Capa IGN y perfil orientativo de terreno.
 * La CARTOGRAFÍA topográfica viene del IGN (sombras MDE-Ar v2.1).
 * Las ALTURAS puntuales proceden de SRTM 30 m/OpenTopoData, NO del IGN.
 * No incluye obstáculos, mínimos aeronáuticos ni garantiza separación vertical.
 */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 const TILE='https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/mapabase_topo@EPSG%3A3857@png/{z}/{x}/{-y}.png';
 const OSM='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
 const FT=3.280839895;
 const RAD=Math.PI/180;
 const informative='Consulta topográfica educativa: no reemplaza cartas aeronáuticas, AIP, NOTAM ni verificación de obstáculos y altitudes mínimas.';
 function ignLayer(L){return L.tileLayer(TILE,{maxZoom:19,maxNativeZoom:17,opacity:0.91,attribution:'Cartografía topográfica © Instituto Geográfico Nacional (IGN) · MDE-Ar v2.1'});}
 function valid(p){return p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lng)&&p.lat>=-56.5&&p.lat<=-21.5&&p.lng>=-74.5&&p.lng<=-52.5}
 function format(n,d=0){return Number(n).toLocaleString('es-AR',{maximumFractionDigits:d,minimumFractionDigits:d})}
 function status(node,msg){if(node){node.hidden=false;node.textContent=msg}}
 async function elevations(points){
  if(!Array.isArray(points)||!points.length||points.length>60||!points.every(valid))throw Error('La ruta contiene coordenadas no disponibles para esta consulta.');
  const locations=points.map(p=>(+p.lat).toFixed(6)+','+(+p.lng).toFixed(6)).join('|');
  const response=await fetch('/api/terrain-elevation?locations='+encodeURIComponent(locations),{headers:{Accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!Array.isArray(data.points)||data.points.length!==points.length)
   throw Error(data.error||'No se pudieron obtener las elevaciones.');
  return data;
 }
 function distanceNm(a,b){
  const dLat=(b.lat-a.lat)*RAD,dLon=(b.lng-a.lng)*RAD;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*RAD)*Math.cos(b.lat*RAD)*Math.sin(dLon/2)**2;
  return 3440.065*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
 }
 // Interpolación de arco máximo sobre esfera, no promedio lineal de coordenadas.
 function intermediate(a,b,t){
  const toXYZ=p=>[Math.cos(p.lat*RAD)*Math.cos(p.lng*RAD),Math.cos(p.lat*RAD)*Math.sin(p.lng*RAD),Math.sin(p.lat*RAD)];
  const x=toXYZ(a),y=toXYZ(b),dot=Math.min(1,Math.max(-1,x[0]*y[0]+x[1]*y[1]+x[2]*y[2]));
  const angle=Math.acos(dot);
  if(angle<1e-8)return {lat:a.lat,lng:a.lng};
  const denom=Math.sin(angle),u=Math.sin((1-t)*angle)/denom,v=Math.sin(t*angle)/denom;
  const q=[u*x[0]+v*y[0],u*x[1]+v*y[1],u*x[2]+v*y[2]];
  return {lat:Math.atan2(q[2],Math.hypot(q[0],q[1]))/RAD,lng:Math.atan2(q[1],q[0])/RAD};
 }
 function sampleRoute(nodes,count=60){
  if(!Array.isArray(nodes)||nodes.length<2||!nodes.every(valid))return [];
  const legs=[],total=nodes.slice(1).reduce((sum,p,i)=>{
   const nm=distanceNm(nodes[i],p);
   legs.push({a:nodes[i],b:p,start:sum,end:sum+nm});
   return sum+nm;
  },0);
  if(total<0.01)return [];
  const samples=[];
  for(let i=0;i<count;i++){
   const nm=total*i/(count-1);
   const leg=legs.find(l=>nm<=l.end)||legs[legs.length-1];
   const fraction=leg.end===leg.start?0:(nm-leg.start)/(leg.end-leg.start);
   samples.push({...intermediate(leg.a,leg.b,fraction),distance_nm:nm});
  }
  return samples;
 }
 function svgNode(name,attrs={}){
  const el=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
  return el;
 }
 function profile(container,points,altitudeFt){
  container.replaceChildren();
  const validPoints=points.filter(p=>Number.isFinite(p.elevation_m));
  if(validPoints.length<2){status(container,'La fuente no entregó suficientes alturas para dibujar un perfil.');return}
  const allHeights=validPoints.map(p=>p.elevation_m*FT);
  const alt=Number.isFinite(altitudeFt)&&altitudeFt>0?altitudeFt:null;
  const min=Math.min(0,...allHeights,alt??Infinity);
  const max=Math.max(...allHeights,alt??-Infinity);
  const margin=Math.max(300,(max-min)*0.12);
  const low=min-margin,high=max+margin;
  const W=700,H=230,left=54,right=16,top=18,bottom=41;
  const width=W-left-right,height=H-top-bottom;
  const px=i=>left+i/(points.length-1)*width;
  const py=h=>top+(high-h)/(high-low)*height;
  const svg=svgNode('svg',{viewBox:'0 0 700 230',role:'img','aria-label':'Perfil muestreado de elevación del terreno frente a la altitud de referencia'});
  const base=py(low);
  for(let i=0;i<=4;i++){
   const h=low+(high-low)*i/4,y=py(h);
   svg.append(svgNode('line',{x1:left,y1:y,x2:W-right,y2:y,stroke:'#5c7180','stroke-width':1,'stroke-dasharray':'4 5'}));
   const label=svgNode('text',{x:left-7,y:y+4,'text-anchor':'end',fill:'#c8d6d9','font-size':11});
   label.textContent=format(h)+' ft';svg.append(label);
  }
  const line=validPoints.map(p=>{
   const index=points.indexOf(p);
   return (index===validPoints[0]? 'M':'L')+px(index).toFixed(1)+' '+py(p.elevation_m*FT).toFixed(1);
  }).join(' ');
  const first=points.indexOf(validPoints[0]),last=points.indexOf(validPoints[validPoints.length-1]);
  svg.append(svgNode('path',{d:line+' L'+px(last)+' '+base+' L'+px(first)+' '+base+' Z',fill:'#8ca888','fill-opacity':0.25,stroke:'none'}));
  svg.append(svgNode('path',{d:line,fill:'none',stroke:'#b2df9d','stroke-width':2.5}));
  if(alt!==null){
   const y=py(alt);
   svg.append(svgNode('line',{x1:left,y1:y,x2:W-right,y2:y,stroke:'#ffb064','stroke-width':2,'stroke-dasharray':'8 5'}));
  }
  const total=points[points.length-1].distance_nm||0;
  for(const [x,labelText,anchor]of [[left,'0 NM','start'],[left+width/2,format(total/2,1)+' NM','middle'],[W-right,format(total,1)+' NM','end']]){
   const t=svgNode('text',{x,y:H-13,fill:'#d8e2df','font-size':12,'text-anchor':anchor});t.textContent=labelText;svg.append(t);
  }
  container.append(svg);
  const note=document.createElement('p');
  const peak=Math.max(...allHeights);
  note.textContent='Máxima altura entre las '+validPoints.length+' muestras: '+format(peak)+' ft AMSL'+
   (alt===null?' · Ingresá una altitud de referencia para compararla.': ' · Altitud de referencia: '+format(alt)+' ft AMSL.')+
   (alt!==null&&peak>=alt?' Atención: al menos una muestra alcanza o supera la altitud elegida.':'')+
   (validPoints.length!==points.length?' Datos incompletos: hay muestras sin elevación.':'');
  container.append(note);
  const disclaimer=document.createElement('p');disclaimer.className='terrain-disclaimer';
  disclaimer.textContent='Perfil SRTM 30 m (NASA/USGS mediante OpenTopoData), no IGN. Muestras espaciadas: pueden omitirse cumbres, obstáculos y variaciones entre puntos. '+informative;
  container.append(disclaimer);
 }
 function bootAeroLocator({map,L,readRouteState}){
  const toggle=$('terrain-aerolocator-toggle'),readout=$('terrain-aerolocator-readout');
  if(!map||!toggle||!L)return;
  const overlay=ignLayer(L);
  toggle.checked=false;
  toggle.addEventListener('change',()=>{
   if(toggle.checked){overlay.addTo(map);status(readout,'Capa topográfica IGN activada. Hacé clic en el mapa para consultar la altura puntual (SRTM).');}
   else{map.removeLayer(overlay);if(readout)readout.hidden=true;}
  });
  let sequence=0;
  map.on('click',async event=>{
   if(!toggle.checked||readRouteState?.()?.drawing||!valid(event.latlng))return;
   const id=++sequence;
   status(readout,'Consultando altura aproximada en '+event.latlng.lat.toFixed(4)+', '+event.latlng.lng.toFixed(4)+'…');
   try{
    const response=await elevations([event.latlng]);
    if(id!==sequence||!toggle.checked)return;
    const value=response.points[0]?.elevation_m;
    status(readout,Number.isFinite(value)?'Elevación SRTM: '+format(value)+' m / '+format(value*FT)+' ft AMSL · No incluye obstáculos.':'Sin dato de elevación para este punto.');
   }catch(err){if(id===sequence)status(readout,err.message);}
  });
  return {overlay};
 }
 function bootFlightOperations(){
  const details=$('flight-terrain-panel'),mapEl=$('flight-terrain-map'),toggle=$('flight-terrain-toggle'),message=$('flight-terrain-status'),plot=$('flight-terrain-profile');
  if(!details||!mapEl||!toggle||!root.L)return;
  const L=root.L;
  let map=null,routeLayer=null,overlay=null,lastRoute=null,requestId=0;
  function readCode(id){
   const input=$(id);
   return String(input?.value==='OTHER'?$(id+'-other')?.value||'':input?.value||'').trim().toUpperCase();
  }
  function resolvePoint(raw){
   const str=String(raw||'').trim().toUpperCase();
   const location=root.GDV_FLIGHT_FIR_GEODATA?.airports?.[str]||root.GDV_FLIGHT_NAMED_POINTS?.[str];
   if(Array.isArray(location)&&location.length>=2)return {lat:Number(location[0]),lng:Number(location[1])};
   const match=/^(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(str);
   return match?{lat:+match[1],lng:+match[2]}:null;
  }
  function route(){
   const names=[readCode('flight-origin'),...Array.from(document.querySelectorAll('#flight-waypoints .flight-waypoint-row input')).map(n=>n.value.trim()),readCode('flight-dest')];
   const points=names.map(resolvePoint);
   return {points,names,ok:points.length>=2&&points.every(valid)};
  }
  function ensureMap(){
   if(map)return;
   map=L.map(mapEl,{scrollWheelZoom:false}).setView([-35,-64],5);
   L.tileLayer(OSM,{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
   overlay=ignLayer(L);
   toggle.checked=false;
   toggle.addEventListener('change',()=>{
    if(toggle.checked){overlay.addTo(map);status(message,'Capa IGN visible; el perfil de alturas utiliza SRTM y se consulta por separado.');}
    else{map.removeLayer(overlay);status(message,'Capa IGN oculta. El perfil de elevaciones no se modifica.');}
   });
  }
  function drawRoute(){
   ensureMap();
   if(routeLayer)map.removeLayer(routeLayer);
   const current=route();
   if(!current.ok){
    lastRoute=null;plot.replaceChildren();
    status(message,'Faltan coordenadas para uno o más puntos. Elegí aeródromos conocidos o ingresá coordenadas decimales; revisá las piernas.');
    return null;
   }
   const latlngs=current.points.map(p=>[p.lat,p.lng]);
   routeLayer=L.featureGroup();
   L.polyline(latlngs,{color:'#ffb267',weight:3}).addTo(routeLayer);
   current.points.forEach((p,i)=>L.circleMarker([p.lat,p.lng],{radius:5,color:'#fff3db',fillColor:'#dc8e3c',fillOpacity:1})
    .bindTooltip(current.names[i]||'Punto '+(i+1)).addTo(routeLayer));
   routeLayer.addTo(map);
   map.fitBounds(routeLayer.getBounds(),{padding:[28,28],maxZoom:11,animate:false});
   lastRoute=current;
   plot.replaceChildren();
   status(message,'Ruta trazada. Activá el relieve IGN si querés y pulsá «Calcular perfil» para consultar alturas SRTM.');
   return current;
  }
  async function calculate(){
   const current=drawRoute();
   if(!current)return;
   const samples=sampleRoute(current.points);
   if(samples.length<2){status(message,'No se puede construir el perfil: la ruta es demasiado corta.');return}
   const id=++requestId;
   const button=$('flight-terrain-calculate');
   if(button)button.disabled=true;
   status(message,'Consultando '+samples.length+' muestras SRTM de la ruta…');
   try{
    const data=await elevations(samples);
    if(id!==requestId)return;
    const raw=$('flight-alt')?.value?.trim()||'';
    const altitudeFt=raw?Number(raw):null;
    const elevated=data.points.map((p,i)=>({...p,distance_nm:samples[i].distance_nm}));
    profile(plot,elevated,altitudeFt);
    status(message,'Perfil muestreado cargado · '+data.source+'. La capa topográfica del IGN es independiente.');
   }catch(err){if(id===requestId){plot.replaceChildren();status(message,err.message)}}
   finally{if(id===requestId&&button)button.disabled=false}
  }
  details.addEventListener('toggle',()=>{if(details.open){ensureMap();setTimeout(()=>{map.invalidateSize();drawRoute()},0)}});
  $('flight-terrain-refresh')?.addEventListener('click',drawRoute);
  $('flight-terrain-calculate')?.addEventListener('click',calculate);
 }
 root.GDV_TERRAIN={bootAeroLocator,bootFlightOperations,ignLayer,sampleRoute,distanceNm,informative};
})(window);