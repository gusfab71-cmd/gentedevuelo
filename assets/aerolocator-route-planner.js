/* AeroLocator · trazado VFR preliminar. Sin reemplazar planificación/briefing oficial. */
(function(){
'use strict';
const RAD=Math.PI/180;
function mod(x,n){return ((x%n)+n)%n}
function nm(a,b){const p1=a.lat*RAD,p2=b.lat*RAD,dLat=(b.lat-a.lat)*RAD,dLon=(b.lng-a.lng)*RAD;
 const h=Math.sin(dLat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dLon/2)**2;
 return 3440.065*2*Math.atan2(Math.sqrt(Math.max(0,h)),Math.sqrt(Math.max(0,1-h)))}
function course(a,b){const p1=a.lat*RAD,p2=b.lat*RAD,dLon=(b.lng-a.lng)*RAD;
 return mod(Math.atan2(Math.sin(dLon)*Math.cos(p2),
 Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dLon))/RAD,360)}
function windVector(dir,speed){return {u:-speed*Math.sin(dir*RAD),v:-speed*Math.cos(dir*RAD)}}
function windFromVector(u,v){return {direction:mod(Math.atan2(-u,-v)/RAD,360),speed:Math.hypot(u,v)}}
/* SMN: WIND/T: ZONAS FL030/09005P25 FL065/02005P16 ...
  dd = decenas de grados verdaderos, fff = nudos; P/M = signo OAT. */
function parseWindT(raw){
 const text=String(raw||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 const section=text.search(/\bWIND\s*\/\s*T\b/);
 if(section<0)return [];
 const tail=text.slice(section).slice(0,12000);
 const pattern=/\bFL\s*(\d{3})\s*\/\s*(\d{2})(\d{3})([PM])(\d{2})\b/g;
 const groups=[];let match,prev=0,current=null;
 while((match=pattern.exec(tail))){
  const between=tail.slice(prev,match.index);
  const cityCodes=(between.match(/\b[A-Z]{3}\b/g)||[])
   .filter(c=>!['WIND','FIR','DEL','LAS','LOS','VFR','UTC','ALT','ISA','DEL','POR'].includes(c));
  if(!current||cityCodes.length){
   const codes=cityCodes.slice(-30);
   current={id:String(groups.length),stations:codes,label:codes.length?codes.slice(0,7).join(' · ')+(codes.length>7?' …':''):'Grupo '+(groups.length+1),levels:[]};
   groups.push(current);
  }
  const fl=Number(match[1]),dd=Number(match[2]),speed=Number(match[3]);
  const temp=(match[4]==='M'?-1:1)*Number(match[5]);
  // A literal dd=36 may mean 360°, dd>36 is not a valid wind direction.
  if(fl>=1&&fl<=450&&dd<=36&&speed<=250&&Math.abs(temp)<=90){
   if(!current.levels.some(item=>item.fl===fl))current.levels.push({fl,direction:dd*10,speed,temp});
  }
  prev=pattern.lastIndex;
 }
 return groups.filter(g=>g.levels.length>=1).map(g=>({...g,levels:g.levels.sort((a,b)=>a.fl-b.fl)}));
}
function windAtLevel(group,altFt){
 if(!group||!group.levels?.length)return null;
 const fl=altFt/100,entries=group.levels,first=entries[0],last=entries[entries.length-1];
 const low=entries.filter(v=>v.fl<=fl).at(-1)||first;
 const high=entries.find(v=>v.fl>=fl)||last;
 const fraction=low.fl===high.fl?0:(fl-low.fl)/(high.fl-low.fl);
 const a=windVector(low.direction,low.speed),b=windVector(high.direction,high.speed);
 const wind=windFromVector(a.u+(b.u-a.u)*fraction,a.v+(b.v-a.v)*fraction);
 return {...wind,temp:low.temp+(high.temp-low.temp)*fraction,
  source:'PRONAREA WIND/T · '+group.label,lowFL:low.fl,highFL:high.fl,
  estimated:fl<first.fl||fl>last.fl,interpolated:low.fl!==high.fl};
}
function tasEstimate(ias,altFt,oat){
 if(!Number.isFinite(ias)||ias<=0||!Number.isFinite(altFt)||altFt<0)return null;
 // Atmósfera estándar para la presión estática de altitud de presión;
 // OAT prevista; IAS≈CAS sin tabla de posición/compresibilidad de la aeronave.
 const h=altFt*0.3048;
 const pressureRatio=Math.pow(Math.max(.02,1-0.0065*h/288.15),5.25588);
 const tempK=Number.isFinite(oat)?oat+273.15:288.15-0.0065*h;
 if(tempK<=170)return null;
 return ias/Math.sqrt(pressureRatio*288.15/tempK);
}
function legCalc(a,b,tas,wind){
 const distance=nm(a,b),track=course(a,b);
 const out={distance,track,tas,heading:null,wca:null,gs:null,ete:null};
 if(!wind||!Number.isFinite(tas)||tas<=0)return out;
 const rel=(wind.direction-track)*RAD;
 const ratio=wind.speed*Math.sin(rel)/tas;
 if(Math.abs(ratio)>=1)return {...out,warning:'Viento cruzado igual o superior a TAS: no se puede mantener la derrota.'};
 const wca=Math.asin(ratio)/RAD,heading=mod(track+wca,360);
 const gs=tas*Math.cos(wca*RAD)-wind.speed*Math.cos(rel);
 if(gs<=0)return {...out,wca,heading,warning:'GS no positiva con el viento previsto.'};
 return {...out,wca,heading,gs,ete:distance/gs*60};
}
function vfrCruiseCheck(altFt,track,variation){
 if(!Number.isFinite(variation)||!Number.isFinite(altFt)||!Number.isFinite(track))return null;
 // La regla usa derrota MAGNÉTICA, no rumbo corregido por viento.
 // Sin elevación del terreno no se determina si el vuelo está >3000 ft AGL.
 const magnetic=mod(track-variation,360),east=magnetic<180;
 const valid=(altFt%1000===500)&&(Math.floor(altFt/1000)%2===(east?1:0));
 let next=null;
 for(let level=3500;level<=17500;level+=1000)if((Math.floor(level/1000)%2)===(east?1:0)&&level>=altFt){next=level;break}
 return {magnetic,valid,next,qualifier:'Orientativo: comprobar altura AGL, espacio aéreo y AIP ENR 1.7.'};
}
function nearestLeg(points,container,map){
 if(points.length<2)return null;
 let best=null,cum=0;
 for(let i=1;i<points.length;i++){
  const p=map.latLngToContainerPoint(points[i-1]),q=map.latLngToContainerPoint(points[i]);
  const vx=q.x-p.x,vy=q.y-p.y,len=vx*vx+vy*vy;
  const t=len?Math.max(0,Math.min(1,((container.x-p.x)*vx+(container.y-p.y)*vy)/len)):0;
  const distancePx=Math.hypot(container.x-(p.x+t*vx),container.y-(p.y+t*vy));
  const length=nm(points[i-1],points[i]);
  if(!best||distancePx<best.distancePx)best={i,distancePx,t,fromOrigin:cum+length*t};
  cum+=length;
 }
 return best;
}
window.GDV_ROUTE_MATH={nm,course,parseWindT,windAtLevel,tasEstimate,legCalc,vfrCruiseCheck};
window.GDV_ROUTE_PLANNER_BOOT=function(options){
 const map=options.map,panel=document.getElementById('route-planner-panel'),toggle=document.getElementById('route-planner-toggle');
 if(!map||!panel||!toggle)return null;
 const $=id=>document.getElementById(id);
 const status=$('route-planner-status'),warnings=$('route-planner-warnings'),results=$('route-planner-results');
 const raw=$('route-pronarea'),altitude=$('route-altitude'),ias=$('route-ias'),variation=$('route-variation');
 const select=$('route-wind-select'),manualDir=$('route-manual-dir'),manualKt=$('route-manual-kt'),manualTemp=$('route-manual-temp');
 const drawButton=$('route-start'),continueButton=$('route-continue'),clearButton=$('route-clear');
 const undoButton=$('route-undo'),undoFloat=$('route-undo-float');
 const layer=L.layerGroup().addTo(map),preview=L.layerGroup().addTo(map);
 const routeHover=document.createElement('div');routeHover.className='route-hover-card';routeHover.hidden=true;
 map.getContainer().append(routeHover);
 const notice=document.createElement('div');notice.className='route-draw-status';notice.hidden=true;
 map.getContainer().append(notice);
 const menu=document.createElement('div');menu.className='route-context-menu';menu.hidden=true;
 map.getContainer().append(menu);
 let points=[],drawing=false,finished=false,windGroups=[],lastHover=null,lastLongPress=0;
 let mousePress=null,ignoreMapClick=false,pointDrag=false;
 const fmt=n=>Number.isFinite(n)?n.toFixed(1):'—';
 function setMessage(msg){status.textContent=msg}
 function setNotice(msg){notice.textContent=msg;notice.hidden=!msg}
 function updateButtons(){
  toggle.setAttribute('aria-pressed',String(drawing));
  toggle.textContent=drawing?'Trazando ruta…':'Trazar ruta VFR';
  drawButton.disabled=drawing;
  continueButton.disabled=points.length===0||drawing;
  undoButton.disabled=points.length===0;
  undoFloat.hidden=points.length===0;
  undoFloat.disabled=points.length===0;
  $('route-finish').disabled=points.length<2||finished;
  map.getContainer().classList.toggle('route-drawing',drawing);
  setNotice(drawing?'Arrastrá el mapa normalmente. Clic breve: marcar punto. Para terminar: clic derecho SOBRE el último punto → «Finalizar navegación aquí». ↶ Deshacer o Ctrl + Z.':'');
 }
 function getForecast(){
  const alt=Number(altitude.value),speed=Number(ias.value);
  if(!Number.isFinite(alt)||alt<500||alt>18000||!Number.isFinite(speed)||speed<25||speed>400)return {error:'Ingresá altitud de 500 a 18.000 ft e IAS de 25 a 400 kt.'};
  let wind=null;
  if(manualDir.value.trim()!==''&&manualKt.value.trim()!==''){
   const dir=Number(manualDir.value),kt=Number(manualKt.value);
   if(dir>=0&&dir<=360&&kt>=0&&kt<=250)wind={
    direction:dir%360,speed:kt,
    temp:manualTemp.value.trim()===''?null:Number(manualTemp.value),
    source:'Viento ingresado manualmente',estimated:false,interpolated:false
   };
  }
  if(!wind){const group=windGroups.find(x=>x.id===select.value);wind=windAtLevel(group,alt)}
  const temp=wind&&Number.isFinite(wind.temp)?wind.temp:null;
  const tas=tasEstimate(speed,alt,temp);
  return {alt,speed,tas,wind,temp,tempIsa:temp===null};
 }
 function refreshMeteoGroups(){
  const previous=select.value;
  windGroups=parseWindT(raw.value);
  select.replaceChildren(new Option('Sin WIND/T reconocido',''));
  for(const g of windGroups)select.append(new Option(g.label+' · '+g.levels.length+' niveles',g.id));
  if(windGroups.some(x=>x.id===previous))select.value=previous;
  else select.value=windGroups.length===1?windGroups[0].id:'';
  refresh();
 }
 function displayResults(){
  const data=getForecast();results.replaceChildren();
  if(data.error){warnings.textContent=data.error;return}
  const issues=[];
  if(windGroups.length>1&&!select.value&&!manualDir.value){
   issues.push('El PRONAREA contiene varios grupos WIND/T. Seleccioná el correspondiente a tu ruta; no se asigna automáticamente por FIR.');
  }
  if(!data.wind)issues.push('Sin viento válido: no se calculan deriva, rumbo corregido, GS ni tiempo. Pegá WIND/T, elegí grupo o ingresá viento manual.');
  if(data.tempIsa)issues.push('TAS aproximada con temperatura ISA: falta temperatura WIND/T válida. Se supone IAS≈CAS.');
  else issues.push('TAS aproximada: IAS≈CAS y presión ISA a la altitud de presión. Corregir con tabla del avión si corresponde.');
  if(data.wind?.estimated)issues.push('Altitud fuera de niveles WIND/T: se usa el nivel más cercano, sin extrapolación meteorológica.');
  if(data.wind?.interpolated)issues.push('Viento y temperatura interpolados entre FL'+String(data.wind.lowFL).padStart(3,'0')+' y FL'+String(data.wind.highFL).padStart(3,'0')+'.');
  if(data.wind)issues.push(data.wind.source+' · '+fmt(data.wind.direction).replace('.0','')+'°/'+fmt(data.wind.speed)+' kt · T '+(data.temp===null?'s/d':fmt(data.temp)+'°C')+'.');
  if(points.length<2){warnings.textContent=issues.join('\n');return}
  const vari=variation.value.trim()===''?null:Number(variation.value);
  let allEte=true,totalNm=0,totalEte=0;
  for(let i=1;i<points.length;i++){
   const leg=legCalc(points[i-1],points[i],data.tas,data.wind);totalNm+=leg.distance;
   if(leg.ete===null)allEte=false;else totalEte+=leg.ete;
   const vfr=vfrCruiseCheck(data.alt,leg.track,vari);
   const row=document.createElement('div');row.className='route-leg-row';
   let left=document.createElement('strong');left.textContent='Pierna '+i;
   let right=document.createElement('span');
   const parts=['Dist. '+fmt(leg.distance)+' NM','Derrota V '+fmt(leg.track)+'°',
    'TAS est. '+fmt(data.tas)+' kt','Deriva '+(leg.wca===null?'—':(leg.wca>=0?'+':'')+fmt(leg.wca)+'°'),
    'RV corregido '+(leg.heading===null?'—':fmt(leg.heading)+'°'),
    'GS '+(leg.gs===null?'—':fmt(leg.gs)+' kt'),
    'ETE '+(leg.ete===null?'—':fmt(leg.ete)+' min')];
   if(vfr){
    parts.push('Derrota magnética '+fmt(vfr.magnetic)+'°');
    if(!vfr.valid&&data.alt>=3500){
     row.dataset.warning='true';
     parts.push('REVISAR nivel semicircular'+(vfr.next?' · sugerido '+vfr.next+' ft':''));
    }
   }else parts.push('Nivel VFR: falta variación magnética');
   if(leg.warning){row.dataset.warning='true';parts.push(leg.warning)}
   right.textContent=parts.join(' · ');row.append(left,right);results.append(row);
  }
  const total=document.createElement('p');total.className='route-planner-state';
  total.textContent='Total '+fmt(totalNm)+' NM · Tiempo total '+(allEte?fmt(totalEte)+' min':'sin calcular')+
   ' · '+(finished?'Ruta finalizada':'Ruta en construcción');
  results.prepend(total);
  if(vari===null)issues.push('Para comprobar nivel par/impar falta la variación magnética local (E positiva, O negativa).');
  else issues.push('La regla VFR usa derrota MAGNÉTICA y aplica según altura sobre terreno y espacio aéreo. Comprobar AIP ENR 1.7.');
  issues.push('Estimaciones educativas: no sustituyen planificación, METAR/TAF, NOTAM, AIP ni performance de aeronave.');
  warnings.textContent=issues.join('\n');
 }
 function refresh(){displayResults();if(lastHover)showHover(lastHover)}
 function render(){
  layer.clearLayers();
  if(points.length>=2){
   const coords=points.map(p=>[p.lat,p.lng]);
   L.polyline(coords,{color:'#26323d',weight:8,opacity:.95,interactive:false}).addTo(layer);
   L.polyline(coords,{color:'#fff',weight:4.3,opacity:1,interactive:false}).addTo(layer);
  }
  points.forEach((point,index)=>{
   const endpoint=index===0||(finished&&index===points.length-1);
   const html='<span class="route-point-pin '+(endpoint?'route-end':'route-middle')+'">'+
    (index===0?'S':finished&&index===points.length-1?'D':String(index))+'</span>';
   const marker=L.marker(point,{draggable:true,autoPan:true,
    icon:L.divIcon({className:'route-point-label',html,iconSize:[22,22],iconAnchor:[11,11]}),
    title:index===0?'Salida':finished&&index===points.length-1?'Destino':'Punto '+index}).addTo(layer);
   marker.bindTooltip(index===0?'Salida':finished&&index===points.length-1?'Destino':'Punto '+index,{direction:'top'});
   marker.on('dragstart',()=>{pointDrag=true;ignoreMapClick=true;hideHover()});
   marker.on('dragend',()=>{
    const p=marker.getLatLng();points[index]={lat:p.lat,lng:p.lng};
    ignoreMapClick=true;pointDrag=false;render();refresh();
    setMessage('Punto '+(index+1)+' ajustado. Navegación recalculada.');
   });
   marker.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent)});
   marker.on('contextmenu',e=>{
    if(e.originalEvent)L.DomEvent.stop(e.originalEvent);
    if(index===points.length-1&&points.length>=2)openMenu(e.latlng,index);
    else if(index>0)openMenu(e.latlng,index);
    else setMessage('La salida ya está marcada. Para finalizar, clic derecho sobre el último punto.');
   });
  });
  refresh();
 }
 function cancelMenu(){menu.hidden=true;menu.replaceChildren()}
 function begin(){
  finished=false;
  drawing=true;
  options.disableRuler?.();
  panel.open=false;
  cancelMenu();updateButtons();
  setMessage(points.length?'Marcá el siguiente punto de navegación.':'Marcá la salida en el mapa, después las referencias y el destino.');
 }
 function pause(){drawing=false;updateButtons();preview.clearLayers();hideHover();setMessage('Trazado pausado. La ruta sigue visible.');}
 function finish(){
  if(points.length<2){setMessage('Marcá por lo menos salida y destino antes de finalizar.');return}
  drawing=false;finished=true;preview.clearLayers();hideHover();cancelMenu();render();updateButtons();panel.open=true;
  setMessage('Ruta finalizada. Ahora pegá el PRONAREA, elegí grupo WIND/T, altitud e IAS; consultá los valores al mover el puntero.');
 }
 function undoLastPoint(){
  if(!points.length){setMessage('No hay puntos para deshacer.');return}
  points.pop();
  const wasFinished=finished;
  if(wasFinished){finished=false;drawing=true;panel.open=false;options.disableRuler?.()}
  cancelMenu();preview.clearLayers();hideHover();render();updateButtons();
  setMessage(points.length?
   'Último punto deshecho. Podés seguir marcando o ajustar la ruta.':
   'Punto de salida deshecho. Arrastrá libremente el mapa y volvé a marcar la salida.');
 }
 function clear(){
  if(points.length&&!window.confirm('¿Borrar el trazado completo y sus puntos?'))return;
  points=[];finished=false;drawing=false;layer.clearLayers();preview.clearLayers();
  hideHover();cancelMenu();updateButtons();refresh();setMessage('Ruta borrada. Pulsá «Trazar ruta» para comenzar nuevamente.');
 }
 function appendPoint(latlng){
  if(points.length&&nm(points.at(-1),latlng)<0.015){
   setMessage('El punto está demasiado cerca del anterior. Desplazá el cursor para agregar otra pierna.');
   return;
  }
  points.push({lat:latlng.lat,lng:latlng.lng});
  render();updateButtons();setMessage(points.length===1?'Salida definida. Clic para agregar punto intermedio o destino.':
   'Punto '+points.length+' marcado. Clic izquierdo para más puntos; clic derecho y luego izquierdo en «Finalizar ruta» para terminar.');
 }
 function openMenu(ll,index){
  if(!points.length)return;
  cancelMenu();
  const content=[];
  const lastPoint=Number.isInteger(index)&&index===points.length-1;
  if(drawing&&points.length>=2&&lastPoint)content.push(['finish','Finalizar navegación aquí']);
  else if(finished&&lastPoint)content.push(['continue','Continuar trazando']);
  if(Number.isInteger(index)&&index>0&&index<points.length)content.push(['delete','Eliminar este punto']);
  for(const [cmd,title] of content){
   const button=document.createElement('button');button.type='button';button.dataset.routeCmd=cmd;
   button.textContent=title;
   button.addEventListener('click',e=>{
    e.stopPropagation();cancelMenu();
    if(cmd==='finish'){finish();return}
    if(cmd==='continue'){begin();return}
    if(cmd==='delete'){
     const removedLast=index===points.length-1;
     points.splice(index,1);
     if(removedLast&&finished){finished=false;drawing=true;options.disableRuler?.();panel.open=false}
     render();updateButtons();setMessage('Punto eliminado. Las piernas se recalcularon.');return;
    }
   });
   menu.append(button);
  }
  if(!content.length)return;
  const p=map.latLngToContainerPoint(ll),w=map.getContainer().clientWidth,h=map.getContainer().clientHeight;
  menu.style.left=Math.max(4,Math.min(p.x,w-190))+'px';
  menu.style.top=Math.max(4,Math.min(p.y,h-155))+'px';menu.hidden=false;
 }
 function hideHover(){routeHover.hidden=true;lastHover=null}
 function showHover(latlng,event){
  if(!points.length){hideHover();return}
  const forecast=getForecast(),mouse=map.latLngToContainerPoint(latlng);
  const projection=nearestLeg(points,mouse,map);
  let legIndex=null,distanceFromOrigin=nm(points[0],latlng),title='Puntero sobre el mapa';
  if(drawing&&points.length){
   legIndex=points.length;
   const all=points.slice(0,-1).reduce((sum,p,i)=>sum+nm(p,points[i+1]),0);
   distanceFromOrigin=all+nm(points.at(-1),latlng);
   title='Pierna '+legIndex+' (en construcción)';
  }else if(projection&&projection.distancePx<=24){
   legIndex=projection.i;distanceFromOrigin=projection.fromOrigin;
   title='Pierna '+legIndex+' · sobre el trazado';
  }
  const lines=[title,'Lat '+latlng.lat.toFixed(5)+' · Lon '+latlng.lng.toFixed(5)];
  if(legIndex!==null&&forecast.tas){
   const a=points[legIndex-1],b=drawing?latlng:points[legIndex];
   const calc=legCalc(a,b,forecast.tas,forecast.wind);
   lines.push('Derrota verdadera '+fmt(calc.track)+'°');
   lines.push('Pierna '+fmt(calc.distance)+' NM · Desde salida '+fmt(distanceFromOrigin)+' NM');
   lines.push('TAS est. '+fmt(forecast.tas)+' kt · Deriva '+(calc.wca===null?'—':(calc.wca>=0?'+':'')+fmt(calc.wca)+'°'));
   lines.push('Rumbo corregido '+(calc.heading===null?'—':fmt(calc.heading)+'°'));
   lines.push('GS '+(calc.gs===null?'—':fmt(calc.gs)+' kt')+' · ETE '+(calc.ete===null?'—':fmt(calc.ete)+' min'));
  }else{
   lines.push('Distancia directa desde salida '+fmt(nm(points[0],latlng))+' NM');
   lines.push('Acercá el puntero a una pierna para ver sus datos.');
  }
  routeHover.textContent=lines.join('\n');routeHover.hidden=false;
  const element=map.getContainer(),w=element.clientWidth,h=element.clientHeight;
  const x=mouse.x,y=mouse.y;
  // Se mantiene cerca del cursor, pero dentro del mapa.
  routeHover.style.left=Math.max(6,Math.min(x+17,w-300))+'px';
  routeHover.style.top=Math.max(6,Math.min(y+17,h-155))+'px';
  lastHover=latlng;
 }
 function mouseMove(e){
  if(!points.length||menu.hidden===false)return;
  if(drawing){
   const coords=[points.at(-1),e.latlng];
   preview.clearLayers();
   L.polyline(coords,{color:'#273440',weight:7,dashArray:'8 8',interactive:false}).addTo(preview);
   L.polyline(coords,{color:'#fff',weight:3.8,dashArray:'8 8',interactive:false}).addTo(preview);
  }
  showHover(e.latlng,e.originalEvent);
 }
 function handleClick(e){
  if(!drawing)return false;
  if(Date.now()-lastLongPress<950||ignoreMapClick||pointDrag){
   ignoreMapClick=false;return true;
  }
  if(e.originalEvent?.button!==undefined&&e.originalEvent.button!==0)return true;
  cancelMenu();
  if(!Number.isFinite(e.latlng.lat)||!Number.isFinite(e.latlng.lng))return true;
  appendPoint(e.latlng);preview.clearLayers();return true;
 }
 function handleContext(e){
  if(!drawing&&!finished)return false;
  if(points.length<2){setMessage('Marcá la salida y la llegada antes de finalizar.');return true}
  const last=points.at(-1),a=map.latLngToContainerPoint(last),b=map.latLngToContainerPoint(e.latlng);
  if(Math.hypot(a.x-b.x,a.y-b.y)<=25){
   openMenu(last,points.length-1);
  }else{
   cancelMenu();
   setMessage('Para finalizar: clic derecho SOBRE el último punto amarillo (destino) y luego clic izquierdo en «Finalizar navegación aquí».');
  }
  return true;
 }
 const onInput=()=>refresh();
 for(const field of [altitude,ias,variation,manualDir,manualKt,manualTemp,select])field.addEventListener('input',onInput);
 raw.addEventListener('input',refreshMeteoGroups);
 $('route-read-pronarea').addEventListener('click',refreshMeteoGroups);
 $('route-use-existing').addEventListener('click',()=>{
  const source=$('pronarea-map-input');
  if(!source?.value.trim()){setMessage('La capa PRONAREA todavía no tiene un boletín pegado.');return}
  raw.value=source.value;refreshMeteoGroups();
  setMessage('PRONAREA copiado de la otra capa. Verificá grupo de localidades y vigencia.');
 });
 toggle.addEventListener('click',()=>{
  if(drawing){pause();panel.open=true}
  else if(finished){panel.open=true;setMessage('Ruta finalizada: podés arrastrar los puntos o pulsar «Continuar trazado».')}
  else begin();
 });
 drawButton.addEventListener('click',begin);
 continueButton.addEventListener('click',begin);
 $('route-finish').addEventListener('click',finish);
 clearButton.addEventListener('click',clear);
 undoButton.addEventListener('click',undoLastPoint);
 undoFloat.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();undoLastPoint()});
 const mapNode=map.getContainer();
 // Una interacción arrastrada no es un punto. Detectar desplazamiento real
 // antes de que Leaflet despache el clic, incluso sobre marcadores ajenos.
 mapNode.addEventListener('mousedown',e=>{
  if(!drawing||e.button!==0)return;
  ignoreMapClick=false;
  mousePress={x:e.clientX,y:e.clientY,moved:false};
 },true);
 mapNode.addEventListener('mousemove',e=>{
  if(mousePress&&Math.hypot(e.clientX-mousePress.x,e.clientY-mousePress.y)>7){
   mousePress.moved=true;ignoreMapClick=true;
  }
 },true);
 mapNode.addEventListener('mouseup',e=>{
  if(mousePress){
   if(Math.hypot(e.clientX-mousePress.x,e.clientY-mousePress.y)>7)mousePress.moved=true;
   if(mousePress.moved)ignoreMapClick=true;
  }
  mousePress=null;
 },true);
 mapNode.addEventListener('mouseleave',()=>{if(mousePress?.moved)ignoreMapClick=true;mousePress=null},true);
 map.on('dragstart',()=>{if(drawing)ignoreMapClick=true});
 // Capturar clics sobre pistas/objetos existentes, para poder fijar exactamente
 // el origen o destino incluso si hay un marcador de aeródromo debajo.
 map.getContainer().addEventListener('click',e=>{
  if(!drawing||ignoreMapClick||pointDrag||Date.now()-lastLongPress<950)return;
  if(e.button!==undefined&&e.button!==0)return;
  const marker=e.target.closest?.('.leaflet-marker-icon,.leaflet-interactive');
  if(!marker||e.target.closest?.('.route-point-label'))return;
  const pos=map.mouseEventToContainerPoint(e);
  e.preventDefault();e.stopPropagation();
  handleClick({latlng:map.containerPointToLatLng(pos),originalEvent:e});
 },true);
 // Pulsación prolongada en dispositivos táctiles: mismo menú del clic derecho.
 let touchTimer=null,touchOrigin=null;
 const cancelTouch=()=>{clearTimeout(touchTimer);touchTimer=null;touchOrigin=null};
 map.getContainer().addEventListener('touchstart',e=>{
  if(!drawing||e.touches.length!==1)return;
  const t=e.touches[0];touchOrigin={x:t.clientX,y:t.clientY};
  touchTimer=setTimeout(()=>{
   if(!drawing||!touchOrigin)return;
   lastLongPress=Date.now();
   const pos=map.mouseEventToContainerPoint({clientX:touchOrigin.x,clientY:touchOrigin.y});
   handleContext({latlng:map.containerPointToLatLng(pos)});
  },650);
 },{passive:true});
 map.getContainer().addEventListener('touchmove',e=>{
  if(!touchOrigin||e.touches.length!==1)return;
  if(Math.hypot(e.touches[0].clientX-touchOrigin.x,e.touches[0].clientY-touchOrigin.y)>12)cancelTouch();
 },{passive:true});
 for(const evt of ['touchend','touchcancel'])map.getContainer().addEventListener(evt,cancelTouch,{passive:true});
 map.on('mousemove',mouseMove);
 map.getContainer().addEventListener('mouseleave',hideHover);
 map.on('mousedown',()=>cancelMenu());
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){cancelMenu();if(drawing)pause();return}
  if(e.key.toLowerCase()==='z'&&(e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&points.length){
   const focused=document.activeElement;
   if(focused&&(focused.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(focused.tagName)))return;
   e.preventDefault();undoLastPoint();
  }
 });
 updateButtons();refresh();
 return {isDrawing:()=>drawing,isActive:()=>drawing||finished,handleClick,handleContext,
  pauseForOtherMode:()=>{if(drawing)pause()},
  getState:()=>({points:points.map(p=>({...p})),drawing,finished})};
};
})();