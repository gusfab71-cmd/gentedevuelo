/* AeroMeteo · pantalla inicial interactiva y fuentes independientes.
 * Datos meteorológicos y aeronáuticos no se fabrican ni se convierten en
 * afirmaciones de condiciones actuales si no existe observación verificable.
 */
(function(root){
'use strict';
const PLACES={
 'canuelas':{name:'Cañuelas · Club de Planeadores',lat:-35.114533,lon:-58.727250},
 'sauce-viejo':{name:'Sauce Viejo · Santa Fe',icao:'SAAV',lat:-31.7117,lon:-60.8117},
 'rosario':{name:'Rosario · Santa Fe',icao:'SAAR',lat:-32.9036,lon:-60.785},
 'cordoba':{name:'Córdoba',icao:'SACO',lat:-31.3236,lon:-64.208},
 'mendoza':{name:'Mendoza',icao:'SAME',lat:-32.8317,lon:-68.7928},
 'mar-del-plata':{name:'Mar del Plata',icao:'SAZM',lat:-37.9342,lon:-57.5733},
 'bariloche':{name:'Bariloche',icao:'SAZS',lat:-41.1512,lon:-71.1575},
 'buenos-aires':{name:'Buenos Aires · Aeroparque',icao:'SABE',lat:-34.5592,lon:-58.4156},
 'ezeiza':{name:'Ezeiza · Buenos Aires',icao:'SAEZ',lat:-34.8222,lon:-58.5358}
};
const ARGENTINA=[[-55.6,-73.8],[-21.2,-53.3]];
const $=id=>document.getElementById(id);
const EMPTY='—';
const METRICS={
 wind:{title:'Viento (kt)',label:'viento',valueKey:'windKt',unit:' kt'},
 rain:{title:'Precipitación (mm)',label:'precipitación',valueKey:'precipitationMm',unit:' mm'},
 cloud:{title:'Nubosidad (%)',label:'nubosidad',valueKey:'cloudPct',unit:' %'},
 temperature:{title:'Temperatura (°C)',label:'temperatura',valueKey:'temperatureC',unit:' °C'}
};
function safeNumber(value,unit=''){
 return typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(value)+unit:EMPTY;
}
function localTime(date){
 const d=new Date(date);
 if(!Number.isFinite(d.getTime()))return 'No verificada';
 return new Intl.DateTimeFormat('es-AR',{
  timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',
  month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false
 }).format(d)+' ART';
}
function create(tag,text,className){
 const el=document.createElement(tag);
 if(text!==undefined&&text!==null)el.textContent=String(text);
 if(className)el.className=className;
 return el;
}
function boot(){
 // Enlaces internos de retorno: nunca confiar en URL externa ni elevar permisos.
 if(new URLSearchParams(root.location?.search||'').get('desde')==='portal-escuela'){
  const back=document.querySelector('.am-nav-primary');
  if(back)back.href='gestion-aeronautica/portal-escuela.html';
 }
 const L=root.L;
 if(!L){$('aerometeo-status').textContent='No se pudo cargar Leaflet. Comprobá tu conexión.';return null}
 const map=L.map('map',{zoomControl:false,scrollWheelZoom:true,touchZoom:true,minZoom:3});
 map.fitBounds(ARGENTINA,{padding:[23,23],maxZoom:6,animate:false});
 L.control.zoom({position:'topleft'}).addTo(map);
 const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
  maxZoom:18,attribution:'Imágenes © Esri y colaboradores'
 }).addTo(map);
 const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:18,attribution:'© OpenStreetMap contributors'
 });
 L.control.layers({'Satélite':satellite,'Calles y caminos':street},null,{position:'bottomright',collapsed:true}).addTo(map);

 let selectedPoint=null,selectedStation=null,currentForecast=null;
 let lastStationId=null,lastObservedAt=null,lastMetric='wind',clickToForecast=false;
 let forecastRequest=0;
 const status=$('aerometeo-status');
 const stationButton=$('aerometeo-show-stations');
 const stationCount=$('aerometeo-station-count');
 const stationList=$('aerometeo-station-list');
 const selection=$('aerometeo-pick-location');
 const locations=$('aerometeo-location');
 const favorite=$('am-favorite');
 const forecastMarkers=L.layerGroup().addTo(map);
 const airportGroup=L.layerGroup().addTo(map);
 const $text=(id,value)=>{const el=$(id);if(el)el.textContent=String(value)};
 const setStatus=message=>$text('aerometeo-status',message);
 const resetFavorite=()=>{
  favorite.setAttribute('aria-pressed','false');favorite.textContent='☆';
 };
 function showTab(tab){
  for(const name of ['observation','forecast','aviation']){
   $('am-detail-'+name).hidden=name!==tab;
  }
  document.querySelectorAll('[data-detail-tab]').forEach(button=>{
   const active=button.dataset.detailTab===tab;
   button.classList.toggle('is-selected',active);
   button.setAttribute('aria-pressed',String(active));
  });
 }
 function selectSource(source,expand=true){
  for(const key of ['stations','forecast','smn','aviation']){
   const card=$('am-source-'+key),panel=$('am-'+key+'-tools');
   const open=key===source&&expand;
   card?.classList.toggle('is-active',key===source);
   if(card)card.setAttribute('aria-expanded',String(open));
   if(panel)panel.hidden=!open;
  }
 }
 for(const key of ['stations','forecast','smn','aviation']){
  $('am-source-'+key)?.addEventListener('click',()=>{
   const wasOpen=$('am-source-'+key).getAttribute('aria-expanded')==='true';
   selectSource(key,!wasOpen);
   if(key==='aviation')showTab('aviation');
   else if(key==='forecast')showTab('forecast');
   else if(key==='stations')showTab('observation');
  });
 }
 for(const button of document.querySelectorAll('[data-detail-tab]')){
  button.addEventListener('click',()=>{
   const tab=button.dataset.detailTab;
   showTab(tab);
   if(tab==='aviation')selectSource('aviation',true);
  });
 }
 function setLocation(name,subtitle){
  $text('am-detail-title',name);
  $text('am-detail-location',subtitle);
  resetFavorite();
 }
 favorite.addEventListener('click',()=>{
  const active=favorite.getAttribute('aria-pressed')==='true';
  favorite.setAttribute('aria-pressed',String(!active));
  favorite.textContent=active?'☆':'★';
 });
 function clearObservation(note='No se recibió ninguna observación'){
  for(const id of ['wind','gust','temperature','pressure','humidity','cloud'])
   $text('am-value-'+id,EMPTY);
  $text('am-detail-status',note);
  $text('am-detail-updated','Actualización: sin datos');
  $text('am-detail-condition','Sin información de observación verificable');
  $text('am-detail-footnote','Observación local ≠ METAR oficial. Comprobar fecha y procedencia.');
  $('am-detail-status-dot').classList.remove('is-live','is-stale');
  lastObservedAt=null;
 }
 function showStation(station){
  selectedStation=station;
  lastStationId=station.id;
  selectedPoint={lat:station.lat,lon:station.lon,name:station.name};
  currentForecast=null;
  forecastMarkers.clearLayers();
  setLocation(station.name,station.location+' · 3D-PAWS · Instrumento '+station.instrumentId);
  clearObservation('Consultando estación 3D-PAWS…');
  showTab('observation');
  selectSource('stations',false);
  setStatus('Estación '+station.name+': recuperando última medición local; no es METAR.');
 }
 function showObservation(station,observation){
  if(station.id!==lastStationId)return;
  if(!observation){
   clearObservation('No se pudo verificar una medición de esta estación');
   setStatus('La estación '+station.name+' no entregó una observación verificable. Consultá la fuente original.');
   return;
  }
  const stale=observation.status!=='recent';
  const validTime=new Date(observation.observedAt);
  if(!Number.isFinite(validTime.getTime())){
   clearObservation('Hora de medición inválida');
   return;
  }
  lastObservedAt=observation.observedAt;
  $('am-detail-status-dot').classList.toggle('is-stale',stale);
  $('am-detail-status-dot').classList.toggle('is-live',!stale);
  $text('am-detail-status',stale?'Medición DESACTUALIZADA · 3D-PAWS':'Observación local · 3D-PAWS');
  $text('am-detail-updated','Registrada: '+localTime(observation.observedAt)+' · hace '+observation.ageMinutes+' min');
  const wind=observation.windDirection===null?'':safeNumber(observation.windDirection,'°');
  const speed=safeNumber(observation.windKt,' kt');
  $text('am-value-wind',[wind,speed].filter(x=>x&&x!==EMPTY).join(' / ')||EMPTY);
  $text('am-value-gust',safeNumber(observation.gustKt,' kt'));
  $text('am-value-temperature',safeNumber(observation.temperatureC,' °C'));
  $text('am-value-pressure',safeNumber(observation.pressureHpa,' hPa'));
  $text('am-value-humidity',safeNumber(observation.humidityPct,' %'));
  $text('am-value-cloud','No medida');
  $text('am-detail-condition',stale?'Observación antigua: no utilizar como condición actual':'Última observación disponible de la estación');
  $text('am-detail-footnote','Fuente: 3D Argentina / 3D-PAWS. No es METAR oficial; verificar licencia y vigencia.');
  setStatus((stale?'Atención: medición antigua de ':'Observación local de ')+station.name+
   '. Referencia '+localTime(observation.observedAt)+'.');
 }
 function showForecastPending(point){
  forecastRequest++;
  selectedPoint={...point};
  // Conservar observaciones de estación solo cuando el pronóstico coincide con esa estación.
  const sameStation=selectedStation&&Math.abs(selectedStation.lat-point.lat)<.001&&
   Math.abs(selectedStation.lon-point.lon)<.001;
  if(!sameStation){
   selectedStation=null;lastStationId=null;clearObservation('Sin estación meteorológica física en este punto');
  }
  currentForecast=null;
  setLocation(point.name,(sameStation?'Comparación con estación 3D-PAWS':'Punto de pronóstico')+' · Argentina');
  showTab('forecast');
  const box=$('am-forecast-content');
  box.replaceChildren(create('p','Consultando el modelo meteorológico…'));
  setStatus('Consultando modelo Open-Meteo para '+point.name+'. No es observación real ni METAR.');
 }
 function forecastLine(container,label,value){
  const row=create('p',undefined,'am-forecast-data-row');
  const title=create('span',label),v=create('strong',value);
  row.append(title,v);container.append(row);
 }
 function showForecastResult(data,point){
  if(!selectedPoint||Math.abs(selectedPoint.lat-point.lat)>.001||
     Math.abs(selectedPoint.lon-point.lon)>.001)return;
  currentForecast=data;
  const box=$('am-forecast-content');box.replaceChildren();
  const current=data.current;
  const grid=create('div',undefined,'am-forecast-data');
  forecastLine(grid,'Fecha del modelo',localTime(current.time));
  forecastLine(grid,'Viento a 10 m',safeNumber(current.windKt,' kt')+
   (typeof current.directionDeg==='number'?' · '+safeNumber(current.directionDeg,'°'):''));
  forecastLine(grid,'Ráfagas',safeNumber(current.gustKt,' kt'));
  forecastLine(grid,'Temperatura',safeNumber(current.temperatureC,' °C'));
  forecastLine(grid,'Presión a nivel del mar',safeNumber(current.pressureHpa,' hPa'));
  forecastLine(grid,'Humedad',safeNumber(current.humidityPct,' %'));
  forecastLine(grid,'Nubosidad',safeNumber(current.cloudPct,' %'));
  forecastLine(grid,'Precipitación',safeNumber(current.precipitationMm,' mm'));
  box.append(grid);
  const hourlyChart=create('section',undefined,'am-hourly-chart');
  hourlyChart.id='am-hourly-chart';
  box.append(hourlyChart);
  root.GDV_AEROMETEO_HOURLY?.render(hourlyChart,data,lastMetric);
  if(Array.isArray(data.forecast)&&data.forecast.length){
   const details=create('details');
   const summary=create('summary','Evolución horaria ('+data.forecast.length+' pronósticos)');
   details.append(summary);
   for(const hour of data.forecast){
    const p=create('p',localTime(hour.time)+' · viento '+safeNumber(hour.windKt,' kt')+
     ' · ráfagas '+safeNumber(hour.gustKt,' kt')+' · nubes '+safeNumber(hour.cloudPct,' %'));
    details.append(p);
   }
   box.append(details);
  }
  const source=create('a','Modelo Open-Meteo · CC BY 4.0 ↗');
  source.href='https://open-meteo.com/en/docs';source.target='_blank';source.rel='noopener noreferrer';
  box.append(source);
  // El punto indica dónde se consultó un modelo: no inventa un campo interpolado.
  const value=current[METRICS[lastMetric].valueKey];
  const forecastMarker=L.circleMarker([point.lat,point.lon],{
   radius:15,color:'#ffbb37',weight:2,fillColor:'#e7a52e',fillOpacity:.30
  }).bindTooltip(point.name+' · '+METRICS[lastMetric].label+' '+safeNumber(value,METRICS[lastMetric].unit));
  forecastMarker.addTo(forecastMarkers);
  $text('am-layer-note','Consulta puntual de modelo en '+point.name+'. No se está mostrando una capa nacional.');
  showTab('forecast');
  setStatus('Pronóstico consultado para '+point.name+' a las '+localTime(current.time)+'. No es METAR ni medición.');
 }
 function forecastError(point){
  if(!selectedPoint||Math.abs(selectedPoint.lat-point.lat)>.001||
   Math.abs(selectedPoint.lon-point.lon)>.001)return;
  currentForecast=null;
  $('am-forecast-content').replaceChildren(create('p','La fuente no devolvió un pronóstico verificable. No se muestran cifras.'));
  setStatus('Pronóstico no disponible para '+point.name+'. Revisar la conexión.');
 }
 const weather=root.GDV_WEATHER_STATIONS?.boot({
  map,L,onSelected:showStation,onObservation:showObservation
 })||null;
 const forecast=root.GDV_OPEN_METEO_FORECAST?.boot({
  map,L,onPending:showForecastPending,onForecast:showForecastResult,
  onForecastError:forecastError,
  dockContainer:document.querySelector('.am-map-canvas')
 })||null;
 const syncStations=()=>{
  const active=Boolean(weather?.active);
  stationButton.setAttribute('aria-pressed',String(active));
  stationButton.textContent=active?'Ocultar estaciones en el mapa':'Mostrar estaciones en el mapa';
 };
 // Controles secundarios Leaflet permanecen operativos internamente pero el
 // dashboard usa sus propias tarjetas; se evita duplicar controles sobre el mapa.
 for(const id of ['weather-stations-toggle','open-meteo-map-forecast']){
  const control=$(id)?.closest('.leaflet-control');
  if(control)control.style.display='none';
 }
 stationButton.addEventListener('click',()=>{
  if(!weather)return setStatus('Módulo 3D-PAWS no disponible.');
  if(weather.active)weather.hide();else weather.show();
  syncStations();
  setStatus('Actualizando la visibilidad de las ubicaciones 3D-PAWS. Seleccioná una para consultar su lectura.');
 });
 async function readStations(){
  try{
   const response=await fetch('../assets/aerolocator-weather-stations-ar.json',{cache:'no-store'});
   if(!response.ok)throw Error('No disponible');
   const json=await response.json(),records=Array.isArray(json.stations)?json.stations.filter(s=>
    typeof s.id==='string'&&typeof s.name==='string'&&Number.isFinite(s.lat)&&Number.isFinite(s.lon)):[];
   if(!records.length)throw Error('Sin estaciones');
   stationCount.textContent=records.length+' estaciones documentadas · 3D-PAWS';
   stationList.replaceChildren();
   for(const station of records){
    const button=create('button',station.name);
    button.type='button';button.append(create('small',station.location+' · instrumento '+station.instrumentId));
    button.addEventListener('click',async()=>{
     $('aerometeo-station-details').open=false;
     if(!weather)return setStatus('No se pudo abrir la capa de estaciones.');
     const shown=await weather.showStation(station.id);
     if(shown){syncStations();focusMap()}
     else setStatus('No se pudo abrir la estación '+station.name);
    });
    stationList.append(button);
   }
  }catch(_){stationCount.textContent='No se pudo recuperar el inventario de estaciones.'}
 }
 void readStations();
 // Los puntos OACI representan ubicaciones para consultar: NO son estaciones 3D-PAWS.
 const airportMarker=(place)=>{
  const icon=L.divIcon({
   className:'am-airport-marker',
   html:'<span class="am-airport-icon">✈</span><span class="am-airport-code">'+place.icao+'</span>',
   iconSize:[71,27],iconAnchor:[12,14]
  });
  const marker=L.marker([place.lat,place.lon],{icon,title:place.icao+' · '+place.name});
  marker.bindTooltip(place.icao+' · '+place.name+' · ubicación de referencia',{direction:'top'});
  marker.on('click',()=>{
   selectedPoint={...place};
   $('aerometeo-icao').value=place.icao;
   void forecast?.showAt(place);
  });
  return marker;
 };
 for(const place of Object.values(PLACES))if(place.icao)airportMarker(place).addTo(airportGroup);
 const focusMap=()=>{
  map.invalidateSize({animate:false});
  if(window.matchMedia('(max-width:650px)').matches)
   document.querySelector('.am-map-canvas')?.scrollIntoView({behavior:'smooth',block:'nearest'});
 };
 const forecastAt=place=>{
  if(!forecast)return setStatus('Pronóstico no disponible.');
  selectedPoint=place;
  if(place.icao)$('aerometeo-icao').value=place.icao;
  void forecast.showAt(place);
  focusMap();
 };
 $('aerometeo-forecast-location').addEventListener('click',()=>{
  const place=PLACES[locations.value];
  if(!place)return setStatus('Ubicación no reconocida.');
  map.setView([place.lat,place.lon],Math.max(7,map.getZoom()),{animate:false});
  forecastAt(place);
 });
 $('aerometeo-forecast-center').addEventListener('click',()=>{
  const center=map.getCenter();
  forecastAt({name:'centro del mapa',lat:center.lat,lon:center.lng});
 });
 $('am-detail-forecast-action').addEventListener('click',()=>{
  if(!selectedPoint)return setStatus('Seleccioná primero un punto del mapa o una estación.');
  forecastAt(selectedPoint);
 });
 selection.addEventListener('click',()=>{
  clickToForecast=!clickToForecast;
  selection.setAttribute('aria-pressed',String(clickToForecast));
  selection.textContent=clickToForecast?'Cancelar elección':'Elegir en mapa';
  map.getContainer().style.cursor=clickToForecast?'crosshair':'';
  setStatus(clickToForecast?'Hacé clic en un punto de Argentina para consultar su pronóstico.':
   'Selección de punto cancelada.');
  if(clickToForecast)focusMap();
 });
 map.on('click',event=>{
  if(!clickToForecast)return;
  clickToForecast=false;
  selection.setAttribute('aria-pressed','false');
  selection.textContent='Elegir en mapa';
  map.getContainer().style.cursor='';
  forecastAt({name:'punto del mapa',lat:event.latlng.lat,lon:event.latlng.lng});
 });
 for(const button of document.querySelectorAll('[data-weather-metric]')){
  button.addEventListener('click',()=>{
   lastMetric=button.dataset.weatherMetric;
   if(!METRICS[lastMetric])return;
   document.querySelectorAll('[data-weather-metric]').forEach(item=>{
    const active=item===button;
    item.classList.toggle('is-selected',active);
    item.setAttribute('aria-pressed',String(active));
   });
   $text('am-active-layer-name',METRICS[lastMetric].title);
   if(currentForecast){
    const chartTarget=$('am-hourly-chart');
    if(chartTarget)root.GDV_AEROMETEO_HOURLY?.render(chartTarget,currentForecast,lastMetric);
   }
   const x=currentForecast?.current?.[METRICS[lastMetric].valueKey];
   $text('am-layer-note',currentForecast?
    'Dato puntual de '+selectedPoint.name+': '+safeNumber(x,METRICS[lastMetric].unit)+
    '. No existe una capa nacional cargada.':
    'Elegí una estación o consultá Open-Meteo para '+METRICS[lastMetric].label+
    '. No hay una capa nacional cargada.');
  });
 }
 $('am-detail-aviation').addEventListener('click',()=>{
  selectSource('aviation',true);
 });
 // Reflejar el estado del producto AWC en su pestaña, sin simular lecturas.
 if(root.MutationObserver){
  const src=$('aerometeo-aviation-status');
  const observer=new MutationObserver(()=>{
   $text('am-detail-aviation-status',src.textContent);
  });
  observer.observe(src,{childList:true,subtree:true,characterData:true});
 }
 const layout=$('aerometeo-app'),togglePanel=$('aerometeo-toggle-panel');
 const expandMapButton=$('aerometeo-expand-map');
 function setExpandedMap(expanded){
  layout.classList.toggle('am-map-expanded',expanded);
  expandMapButton?.setAttribute('aria-pressed',String(expanded));
  if(expandMapButton)expandMapButton.textContent=expanded?'⛶ Volver a vista completa':'⛶ Ampliar mapa';
  requestAnimationFrame(()=>{
   map.invalidateSize({animate:false});
   if(map._popup?.update)map._popup.update();
  });
 }
 expandMapButton?.addEventListener('click',()=>{
  setExpandedMap(!layout.classList.contains('am-map-expanded'));
 });
 root.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&layout.classList.contains('am-map-expanded')){
   setExpandedMap(false);
  }
 });
 togglePanel.addEventListener('click',()=>{
  const hidden=layout.classList.toggle('am-sidebar-hidden');
  togglePanel.setAttribute('aria-expanded',String(!hidden));
  togglePanel.textContent=hidden?'Mostrar panel':'Ocultar panel';
  requestAnimationFrame(()=>map.invalidateSize({animate:false}));
 });
 $('aerometeo-country').addEventListener('click',()=>{
  map.fitBounds(ARGENTINA,{padding:[23,23],maxZoom:6,animate:false});
  setStatus('Mapa general de Argentina. Seleccioná una estación, un aeródromo o un punto de pronóstico.');
 });
 // Arranque: se muestran ubicaciones, pero jamás datos meteorológicos ficticios.
 if(weather){weather.show();syncStations()}
 setStatus('Ubicaciones aeronáuticas y estaciones documentadas. Elegí un punto: los valores se consultan bajo demanda.');
 return {map,weather,forecast,showTab,selectSource};
}
root.GDV_AEROMETEO={boot,PLACES,ARGENTINA,safeNumber,localTime};
if(typeof module==='object'&&module.exports)module.exports={boot,PLACES,ARGENTINA,safeNumber,localTime};
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
}
})(typeof window!=='undefined'?window:globalThis);
