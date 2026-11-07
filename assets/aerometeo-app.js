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

 let selectedPoint=null,currentForecast=null;
 let lastMetric='wind',clickToForecast=false;
 let forecastRequest=0;
 let observationRequest=0;
 let tafRequest=0;
 const status=$('aerometeo-status');
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
  for(const key of ['forecast','smn','aviation']){
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
  });
 }
 // El sitio del SMN puede ser inaccesible: ofrecer nuestra consulta AWC sin inventar observaciones.
 $('aerometeo-smn-alternative')?.addEventListener('click',()=>{
  selectSource('aviation',true);
  showTab('aviation');
  $('aerometeo-icao')?.focus();
 });
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
  observationRequest++;
  const raw=$('am-observation-metar-raw');
  if(raw){raw.hidden=true;raw.textContent='';}
  for(const id of ['wind','gust','temperature','pressure','humidity','cloud'])
   $text('am-value-'+id,EMPTY);
  $text('am-detail-status',note);
  $text('am-detail-updated','Actualización: sin datos');
  $text('am-detail-condition','Sin información de observación verificable');
  $text('am-detail-footnote','Cuando existe un METAR original para el aeródromo, se presenta aquí con su fecha; no se reemplaza con modelos.');
  $('am-detail-status-dot').classList.remove('is-live','is-stale');
 }
 // La franja de estado se mantiene visible aun cuando la pestaña Pronóstico está activa.
 // Los datos originales se muestran exclusivamente para el código OACI consultado.
 function showAutomaticReport(type,{status,badge,date='',raw='',validity=''}){
  $text('am-auto-'+type+'-status',status);
  $text('am-auto-'+type+'-badge',badge);
  $text('am-auto-'+type+'-date',date);
  const pre=$('am-auto-'+type+'-raw');
  if(pre){pre.textContent=raw;pre.hidden=!raw;}
  if(type==='taf')$text('am-auto-taf-validity',validity);
 }
 function resetAutomaticReports(point){
  tafRequest++; // Invalida cualquier TAF anterior, aun si el usuario elige un punto sin ICAO.
  const hasIcao=typeof point?.icao==='string'&&/^SA[A-Z]{2}$/.test(point.icao);
  for(const type of ['metar','taf']){
   showAutomaticReport(type,{
    status:hasIcao?'Pendiente de consulta para '+point.icao+'.':
     'Punto sin código OACI asociado: no se consulta un METAR ni TAF de otro aeródromo.',
    badge:hasIcao?'Pendiente':'Sin OACI'
   });
  }
 }
 async function loadTafObservation(point){
  const icao=typeof point?.icao==='string'?point.icao.toUpperCase():'';
  if(!/^SA[A-Z]{2}$/.test(icao))return;
  const id=++tafRequest;
  showAutomaticReport('taf',{status:'Consultando TAF '+icao+'…',badge:'Consultando'});
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
   const url='/api/aerometeo-aviation-weather?'+new URLSearchParams({icao,type:'taf'});
   const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Servicio aeronáutico no disponible');
   const data=await response.json();
   if(id!==tafRequest||selectedPoint?.icao!==icao)return;
   if(data.ok!==true||data.type!=='taf'||data.icao!==icao)throw Error('Respuesta TAF inválida');
   if(!data.found||typeof data.raw!=='string'||!data.raw.trim()){
    showAutomaticReport('taf',{
     status:'No se encontró TAF disponible para '+icao+'. Este aeropuerto puede no emitirlo.',
     badge:'Sin TAF'
    });
    return;
   }
   const issued=data.issuedAt?'Emisión: '+localTime(data.issuedAt):
    'La fuente no aporta una emisión verificable.';
   const hasPeriod=Boolean(data.validFrom&&data.validTo);
   const period=hasPeriod?
    'Período informado: '+localTime(data.validFrom)+' a '+localTime(data.validTo)+'.':
    'Período de validez no verificado en la respuesta: revisar grupos de fecha del TAF original.';
   const expired=hasPeriod&&Date.now()>Date.parse(data.validTo);
   const future=hasPeriod&&Date.now()<Date.parse(data.validFrom);
   const condition=expired?'TAF vencido':future?'TAF aún fuera de período':
    data.stale?'Emisión antigua o sin fecha verificable':
     data.validNow===true?'TAF dentro del período informado':
      'TAF recibido; validez a verificar';
   showAutomaticReport('taf',{
    status:condition+' · '+icao+'. Confirmá vigencia en SMN/ANAC.',
    badge:expired||data.stale?'Revisar vigencia':'Recibido',
    date:issued,validity:period,raw:data.raw
   });
  }catch(_error){
   if(id!==tafRequest||selectedPoint?.icao!==icao)return;
   showAutomaticReport('taf',{status:'No fue posible recuperar el TAF de '+icao+'. Consultá el SMN.',
    badge:'Error'});
  }finally{clearTimeout(timer);}
 }
 async function loadMetarObservation(point){
  const icao=typeof point?.icao==='string'?point.icao.trim().toUpperCase():'';
  if(!/^SA[A-Z]{2}$/.test(icao))return;
  const id=++observationRequest;
  showAutomaticReport('metar',{status:'Consultando METAR '+icao+'…',badge:'Consultando'});
  $text('am-detail-status','Consultando METAR '+icao+'…');
  $text('am-detail-updated','Pendiente de observación aeronáutica');
  $text('am-detail-footnote','Buscando un METAR original y verificando su fecha de emisión.');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const url='/api/aerometeo-aviation-weather?'+new URLSearchParams({icao,type:'metar'});
   const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Servicio aeronáutico no disponible');
   const data=await response.json();
   if(id!==observationRequest||selectedPoint?.icao!==icao)return;
   if(data.ok!==true||data.icao!==icao||data.type!=='metar')throw Error('Respuesta de METAR inválida');
   if(!data.found||typeof data.raw!=='string'){
    showAutomaticReport('metar',{status:'No se encontró METAR para '+icao+
     '. No se reemplaza por pronósticos.',badge:'Sin METAR'});
    $text('am-detail-status','Sin METAR disponible · '+icao);
    $text('am-detail-updated','No se encontró un mensaje para esta consulta');
    $text('am-detail-footnote','Sin observación verificable en Aviation Weather Center. Consultá el METAR oficial del SMN; no se reemplaza con el pronóstico.');
    return;
   }
   const raw=$('am-observation-metar-raw');
   if(raw){raw.textContent=data.raw;raw.hidden=false;}
   const ts=Date.parse(data.issuedAt||'');
   const old=data.stale!==false||!Number.isFinite(ts)||Math.abs(Date.now()-ts)>180*60000;
   $('am-detail-status-dot').classList.toggle('is-stale',old);
   $('am-detail-status-dot').classList.toggle('is-live',!old);
   $text('am-detail-updated','Emisión: '+localTime(data.issuedAt)+' · '+icao);
   showAutomaticReport('metar',{
    status:(old?'METAR desactualizado o sin fecha verificable':'Último METAR disponible')+
     ' · '+icao+'. Verificá vigencia antes de volar.',
    badge:old?'Revisar vigencia':'Recibido',
    date:'Emisión: '+localTime(data.issuedAt),raw:data.raw
   });
   if(old){
    $text('am-detail-status','METAR DESACTUALIZADO O NO VERIFICADO · '+icao);
    $text('am-detail-condition','El mensaje está desactualizado: no usar como observación actual');
    $text('am-detail-footnote','Se conserva el texto original como referencia histórica. Confirmá emisión y vigencia en el SMN.');
    return;
   }
   const parsed=root.GDV_AEROMETEO_METAR?.decode(data.raw);
   if(!parsed)throw Error('Decodificador METAR no disponible');
   const wind=parsed.windKt===null?EMPTY:
    (parsed.windDirection===null?'':String(parsed.windDirection)+(typeof parsed.windDirection==='number'?'°':'')+' / ')+safeNumber(parsed.windKt,' kt');
   $text('am-value-wind',wind);
   $text('am-value-gust',safeNumber(parsed.gustKt,' kt'));
   $text('am-value-temperature',safeNumber(parsed.temperatureC,' °C'));
   $text('am-value-pressure',safeNumber(parsed.pressureHpa,' hPa'));
   $text('am-value-humidity',EMPTY);
   $text('am-value-cloud',parsed.cloudLabel||EMPTY);
   $text('am-detail-status','METAR aeronáutico · '+icao);
   $text('am-detail-condition','Último METAR disponible; verificar vigencia antes del vuelo');
   $text('am-detail-footnote','Fuente: Aviation Weather Center (NOAA/NWS). Grupos METAR decodificados parcialmente; nubes en grupos OACI, no porcentaje. Humedad sin dato. Verificá el mensaje original y el SMN.');
  }catch(_){
   if(id!==observationRequest||selectedPoint?.icao!==icao)return;
   showAutomaticReport('metar',{status:'No fue posible consultar el METAR de '+icao+
    '. Consultá el SMN.',badge:'Error'});
   $text('am-detail-status','METAR no disponible · '+icao);
   $text('am-detail-updated','Consulta sin resultado verificable');
   $text('am-detail-footnote','No pudimos recuperar el METAR. Las estimaciones de Open-Meteo no sustituyen observaciones; consultá el SMN.');
  }finally{clearTimeout(timeout)}
 }
 function showForecastPending(point){
  forecastRequest++;
  selectedPoint={...point};
  clearObservation('Sin observación METAR disponible para el punto seleccionado');
  resetAutomaticReports(point);
  if(/^SA[A-Z]{2}$/.test(point.icao||'')){
   // Solo el aeropuerto elegido; jamás hacemos 46 consultas de golpe.
   void loadMetarObservation(point);
   void loadTafObservation(point);
  }
  currentForecast=null;
  setLocation(point.name,'Punto de pronóstico · Argentina');
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
  // El resultado numérico no debe devolver al usuario a Pronóstico si ya abrió METAR/TAF.
  setStatus('Pronóstico consultado para '+point.name+' a las '+localTime(current.time)+'. No es METAR ni medición.');
 }
 function forecastError(point){
  if(!selectedPoint||Math.abs(selectedPoint.lat-point.lat)>.001||
   Math.abs(selectedPoint.lon-point.lon)>.001)return;
  currentForecast=null;
  $('am-forecast-content').replaceChildren(create('p','La fuente no devolvió un pronóstico verificable. No se muestran cifras.'));
  setStatus('Pronóstico no disponible para '+point.name+'. Revisar la conexión.');
 }
 const forecast=root.GDV_OPEN_METEO_FORECAST?.boot({
  map,L,onPending:showForecastPending,onForecast:showForecastResult,
  onForecastError:forecastError,
  dockContainer:document.querySelector('.am-map-canvas')
 })||null;
 // AeroMeteo oculta el control duplicado de Open-Meteo: usa el panel propio.
 const control=$('open-meteo-map-forecast')?.closest('.leaflet-control');
 if(control)control.style.display='none';
 // Los marcadores indican aeropuertos de REFERENCIA, no disponibilidad de METAR ni estado operativo.
 // Archivo local derivado de OurAirports; consultar AIP/NOTAM antes de volar.
 const airportPlaces={...PLACES};
 let catalogAirports=[];
 const provinceFilter=$('aerometeo-province');
 const airportsStatus=$('am-airports-status');
 function refreshAirportMarkers(){
  airportGroup.clearLayers();
  const zoom=map.getZoom();
  const points=catalogAirports.length?catalogAirports:Object.values(PLACES).filter(p=>p.icao);
  const visible=zoom>=7?points:points.filter(p=>p.primary!==false);
  for(const place of visible){
   const showCode=zoom>=6;
   const safeICAO=/^SA[A-Z]{2}$/.test(place.icao||'')?place.icao:'';
   if(!safeICAO)continue;
   const icon=L.divIcon({
    className:'am-airport-marker'+(showCode?'':' am-airport-compact'),
    html:'<span class="am-airport-icon">✈</span>'+(showCode?'<span class="am-airport-code">'+safeICAO+'</span>':''),
    iconSize:showCode?[71,27]:[26,26],iconAnchor:showCode?[12,14]:[13,13]
   });
   const marker=L.marker([place.lat,place.lon],{icon,title:safeICAO+' · '+place.name});
   marker.bindTooltip(safeICAO+' · '+place.name+
    (place.province?' · '+place.province:'')+' · ubicación de referencia',{direction:'top'});
   marker.on('click',()=>{
    selectedPoint={...place};
    $('aerometeo-icao').value=safeICAO;
    if(place.province&&provinceFilter){
     provinceFilter.value=place.province;
     fillAirportSelect(safeICAO);
    }
    void forecast?.showAt(place);
   });
   marker.addTo(airportGroup);
  }
  if(airportsStatus&&catalogAirports.length){
   airportsStatus.textContent=catalogAirports.length+' aeropuertos de referencia en 23 provincias y CABA · '+visible.length+
    ' marcadores visibles. Acercá el mapa para ver más.';
  }
 }
 function fillAirportSelect(selected){
  if(!catalogAirports.length)return;
  const old=selected||locations.value;
  locations.replaceChildren();
  const visibleProvince=provinceFilter?.value||'';
  const grouped=new Map();
  for(const place of catalogAirports){
   if(visibleProvince&&visibleProvince!==place.province)continue;
   if(!grouped.has(place.province))grouped.set(place.province,[]);
   grouped.get(place.province).push(place);
  }
  for(const [province,places] of grouped){
   const group=document.createElement('optgroup');
   group.label=province;
   for(const place of places){
    const option=document.createElement('option');
    option.value=place.icao;
    option.textContent=place.name+' · '+place.icao;
    group.append(option);
   }
   locations.append(group);
  }
  if(!visibleProvince){
   const others=document.createElement('optgroup');
   others.label='Otros puntos de referencia';
   const canuelas=document.createElement('option');
   canuelas.value='canuelas';
   canuelas.textContent='Cañuelas (sin METAR propio)';
   others.append(canuelas);locations.append(others);
  }
  if(Array.from(locations.options).some(option=>option.value===old)){
   locations.value=old;
  }else if(Array.from(locations.options).some(option=>option.value==='SABE')){
   locations.value='SABE';
  }else if(locations.options.length){
   locations.selectedIndex=0;
  }
 }
 provinceFilter?.addEventListener('change',()=>{
  fillAirportSelect();
  const province=provinceFilter.value;
  if(!province)return;
  const points=catalogAirports.filter(place=>place.province===province);
  if(points.length===1)map.setView([points[0].lat,points[0].lon],7,{animate:false});
  else if(points.length>1)map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lon])),{
   padding:[45,45],maxZoom:8,animate:false
  });
 });
 async function loadProvincialAirports(){
  try{
   const response=await fetch('../assets/aerometeo-airports-provinces.json',{cache:'force-cache'});
   if(!response.ok)throw Error('Catálogo sin acceso');
   const data=await response.json();
   if(!Array.isArray(data.records)||data.jurisdictions!==24||data.primaryCount!==24)
    throw Error('Catálogo incompleto');
   const seen=new Set(),provinces=new Set(),primary=new Set(),accepted=[];
   for(const entry of data.records){
    if(!/^SA[A-Z]{2}$/.test(entry?.icao||'')||seen.has(entry.icao)||
       typeof entry.label!=='string'||!entry.label.trim()||
       typeof entry.province!=='string'||!entry.province.trim()||
       !Number.isFinite(entry.lat)||!Number.isFinite(entry.lon)||
       entry.lat< -56||entry.lat> -21||entry.lon< -75||entry.lon> -52||
       typeof entry.primary!=='boolean')throw Error('Aeropuerto inválido en catálogo');
    seen.add(entry.icao);provinces.add(entry.province);
    if(entry.primary)primary.add(entry.province);
    accepted.push({
     icao:entry.icao,name:entry.label,province:entry.province,
     lat:entry.lat,lon:entry.lon,primary:entry.primary
    });
   }
   if(provinces.size!==24||primary.size!==24||accepted.length!==data.count)throw Error('Cobertura provincial incompleta');
   catalogAirports=accepted;
   for(const p of accepted)airportPlaces[p.icao]=p;
   provinceFilter.replaceChildren();
   const all=document.createElement('option');
   all.value='';all.textContent='Todas las provincias y CABA';
   provinceFilter.append(all);
   const provinceNames=[...provinces].sort((a,b)=>a.localeCompare(b,'es'));
   for(const province of provinceNames){
    const option=document.createElement('option');
    option.value=province;option.textContent=province;
    provinceFilter.append(option);
   }
   fillAirportSelect('SABE');
   refreshAirportMarkers();
  }catch(_error){
   airportGroup.clearLayers();
   refreshAirportMarkers();
   if(airportsStatus)airportsStatus.textContent='No se pudo cargar el catálogo provincial. Se muestran solo los aeropuertos de referencia originales; los pronósticos siguen funcionando por coordenadas.';
  }
 }
 map.on('zoomend',refreshAirportMarkers);
 refreshAirportMarkers();
 void loadProvincialAirports();
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
  const place=airportPlaces[locations.value];
  if(!place)return setStatus('Ubicación no reconocida.');
  map.setView([place.lat,place.lon],Math.max(7,map.getZoom()),{animate:false});
  forecastAt(place);
 });
 $('aerometeo-forecast-center').addEventListener('click',()=>{
  const center=map.getCenter();
  forecastAt({name:'centro del mapa',lat:center.lat,lon:center.lng});
 });
 $('am-detail-forecast-action').addEventListener('click',()=>{
  if(!selectedPoint)return setStatus('Seleccioná primero un aeropuerto o un punto del mapa.');
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
 setStatus('Ubicaciones aeronáuticas de referencia. Elegí un aeródromo o punto: el pronóstico se consulta a demanda; las observaciones METAR dependen de disponibilidad.');
 return {map,forecast,showTab,selectSource};
}
root.GDV_AEROMETEO={boot,PLACES,ARGENTINA,safeNumber,localTime};
if(typeof module==='object'&&module.exports)module.exports={boot,PLACES,ARGENTINA,safeNumber,localTime};
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
}
})(typeof window!=='undefined'?window:globalThis);
