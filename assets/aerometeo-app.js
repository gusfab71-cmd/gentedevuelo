/* AeroMeteo · aplicación independiente para pilotos argentinos.
 * Consulta por acción explícita. Observaciones ≠ pronósticos ≠ METAR/TAF.
 */
(function(root){
'use strict';
const PLACES={
 'canuelas':{name:'Cañuelas · Club de Planeadores',lat:-35.114533,lon:-58.727250},
 'sauce-viejo':{name:'Sauce Viejo · Santa Fe',lat:-31.7117,lon:-60.8117},
 'rosario':{name:'Rosario · Santa Fe',lat:-32.9036,lon:-60.785},
 'cordoba':{name:'Córdoba',lat:-31.3236,lon:-64.208},
 'mendoza':{name:'Mendoza',lat:-32.8317,lon:-68.7928},
 'mar-del-plata':{name:'Mar del Plata',lat:-37.9342,lon:-57.5733},
 'bariloche':{name:'Bariloche',lat:-41.1512,lon:-71.1575},
 'buenos-aires':{name:'Buenos Aires',lat:-34.5592,lon:-58.4156}
};
const ARGENTINA=[[-55.6,-73.8],[-21.2,-53.3]];
function boot(){
 const L=root.L;
 if(!L){const el=document.getElementById('aerometeo-status');if(el)el.textContent='No se pudo cargar el mapa. Revisá la conexión.';return null}
 const map=L.map('map',{zoomControl:false,scrollWheelZoom:true,touchZoom:true,minZoom:3});
 map.fitBounds(ARGENTINA,{padding:[20,20],maxZoom:6,animate:false});
 L.control.zoom({position:'topright'}).addTo(map);
 const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
  maxZoom:18,attribution:'Imágenes © Esri y colaboradores'
 }).addTo(map);
 const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:18,attribution:'© OpenStreetMap contributors'
 });
 L.control.layers({'Satélite':satellite,'Mapa de calles':street},null,{position:'bottomright',collapsed:true}).addTo(map);
 const weather=root.GDV_WEATHER_STATIONS?.boot({map,L})||null;
 const forecast=root.GDV_OPEN_METEO_FORECAST?.boot({map,L})||null;
 const status=document.getElementById('aerometeo-status');
 const stationButton=document.getElementById('aerometeo-show-stations');
 const stationCount=document.getElementById('aerometeo-station-count');
 const stationList=document.getElementById('aerometeo-station-list');
 const locations=document.getElementById('aerometeo-location');
 const selection=document.getElementById('aerometeo-pick-location');
 let clickToForecast=false;
 function setStatus(message){status.textContent=message}
 function focusMap(){
  map.invalidateSize({animate:false});
  document.querySelector('.am-map-canvas')?.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 function syncStations(){
  const active=Boolean(weather?.active);
  stationButton.setAttribute('aria-pressed',String(active));
  stationButton.textContent=active?'Ocultar estaciones en el mapa':'Mostrar estaciones en el mapa';
 }
 stationButton.addEventListener('click',()=>{
  if(!weather){setStatus('El módulo 3D-PAWS no está disponible.');return}
  if(weather.active)weather.hide();else weather.show();
  syncStations();
  // El control Leaflet inicia una carga asíncrona de ubicaciones.
  setStatus(weather.active?'Capa de estaciones visible. Elegí un punto para consultar mediciones.':
   'Se solicitó cambiar la visibilidad de las estaciones meteorológicas.');
 });
 async function readStations(){
  try{
   const response=await fetch('../assets/aerolocator-weather-stations-ar.json',{cache:'no-store'});
   if(!response.ok)throw Error('Inventario no disponible');
   const json=await response.json();
   const list=Array.isArray(json.stations)?json.stations.filter(x=>
    typeof x.id==='string'&&typeof x.name==='string'&&
    Number.isFinite(x.lat)&&Number.isFinite(x.lon)):[];
   if(!list.length)throw Error('Sin estaciones');
   stationCount.textContent=list.length+' estaciones localizadas · red 3D-PAWS';
   stationList.replaceChildren();
   for(const station of list){
    const button=document.createElement('button');
    button.type='button';
    button.textContent=station.name;
    const caption=document.createElement('small');
    caption.textContent=station.location+' · Instrumento '+station.instrumentId;
    button.append(caption);
    button.addEventListener('click',async()=>{
     if(!weather){setStatus('No se pudo abrir la capa de estaciones.');return}
     document.getElementById('aerometeo-station-details').open=false;
     const shown=await weather.showStation?.(station.id);
     if(shown){
      syncStations();
      setStatus('Estación '+station.name+'. Comprobá la hora de la última observación y su origen.');
      focusMap();
     }else setStatus('No fue posible abrir la estación seleccionada.');
    });
    stationList.append(button);
   }
  }catch(_){stationCount.textContent='El catálogo no está disponible. No se muestran estaciones inventadas.'}
 }
 void readStations();
 const selected=()=>{
  const point=PLACES[locations.value];
  if(!point){setStatus('Ubicación no reconocida.');return}
  if(!forecast){setStatus('El módulo de pronóstico no está disponible.');return}
  map.setView([point.lat,point.lon],Math.max(8,map.getZoom()),{animate:false});
  void forecast.showAt({lat:point.lat,lon:point.lon,name:point.name});
  setStatus('Pronóstico del modelo para '+point.name+'. No es observación real ni METAR.');
  focusMap();
 };
 document.getElementById('aerometeo-forecast-location').addEventListener('click',selected);
 document.getElementById('aerometeo-forecast-center').addEventListener('click',()=>{
  const point=map.getCenter();
  if(!forecast)return setStatus('El módulo de pronóstico no está disponible.');
  void forecast.showAt({lat:point.lat,lon:point.lng,name:'centro del mapa'});
  setStatus('Pronóstico solicitado para el centro del mapa. Datos estimados, no mediciones.');
  focusMap();
 });
 selection.addEventListener('click',()=>{
  clickToForecast=!clickToForecast;
  selection.setAttribute('aria-pressed',String(clickToForecast));
  selection.textContent=clickToForecast?'Cancelar elección':'Elegir en mapa';
  map.getContainer().style.cursor=clickToForecast?'crosshair':'';
  setStatus(clickToForecast?
   'Tocá una ubicación dentro de Argentina. Abriremos el pronóstico del modelo en ese punto.':
   'Selección de ubicación cancelada.');
  if(clickToForecast)focusMap();
 });
 map.on('click',event=>{
  if(!clickToForecast)return;
  clickToForecast=false;
  selection.setAttribute('aria-pressed','false');
  selection.textContent='Elegir en mapa';
  map.getContainer().style.cursor='';
  if(!forecast)return;
  void forecast.showAt({lat:event.latlng.lat,lon:event.latlng.lng,name:'punto elegido'});
  setStatus('Pronóstico para el punto elegido. No es una medición de estación.');
 });
 const layout=document.getElementById('aerometeo-app');
 const panelButton=document.getElementById('aerometeo-toggle-panel');
 panelButton.addEventListener('click',()=>{
  const hidden=layout.classList.toggle('am-sidebar-hidden');
  panelButton.textContent=hidden?'Mostrar panel':'Ocultar panel';
  panelButton.setAttribute('aria-expanded',String(!hidden));
  requestAnimationFrame(()=>map.invalidateSize({animate:false}));
 });
 document.getElementById('aerometeo-country').addEventListener('click',()=>{
  map.fitBounds(ARGENTINA,{padding:[20,20],maxZoom:6,animate:false});
  setStatus('Vista general de Argentina. Seleccioná un punto o una estación meteorológica.');
 });
 return {map,weather,forecast};
}
root.GDV_AEROMETEO={boot,PLACES,ARGENTINA};
if(typeof module==='object'&&module.exports)module.exports={boot,PLACES,ARGENTINA};
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
}
})(typeof window!=='undefined'?window:globalThis);
