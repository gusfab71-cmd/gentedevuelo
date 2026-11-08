/* AeroLocator · estaciones meteorológicas en una capa superpuesta.
 * Los puntos indican ubicaciones documentadas, NO METAR oficiales.
 * No se inventan mediciones cuando CHORDS no responde.
 */
(function(root){
'use strict';
const CATALOG='../assets/aerolocator-weather-stations-ar.json';
const API='/api/aerolocator-weather-stations';
function element(tag,text,className){
 const node=document.createElement(tag);
 if(text!==undefined&&text!==null)node.textContent=String(text);
 if(className)node.className=className;
 return node;
}
function addLine(parent,name,value){
 const row=element('div');
 row.style.cssText='display:flex;gap:10px;justify-content:space-between;border-bottom:1px solid #d6e0e9;padding:4px 0;font-size:12px';
 const label=element('strong',name);const text=element('span',value);
 text.style.textAlign='right';row.append(label,text);parent.append(row);
}
function link(parent,url,label){
 const anchor=element('a',label);
 anchor.href=url;anchor.target='_blank';anchor.rel='noopener noreferrer';
 anchor.style.cssText='display:inline-block;color:#126497;font-size:12px;font-weight:700;margin-top:8px';
 parent.append(anchor);
}
function formatObservation(observation){
 if(!observation)return null;
 return {
  wind:observation.windDirection===null&&observation.windKt===null?'Sin dato':
   [observation.windDirection===null?'':observation.windDirection+'°',
    observation.windKt===null?'':observation.windKt+' kt'].filter(Boolean).join(' · '),
  gust:observation.gustKt===null?'Sin dato':observation.gustKt+' kt',
  temperature:observation.temperatureC===null?'Sin dato':observation.temperatureC+' °C',
  humidity:observation.humidityPct===null?'Sin dato':observation.humidityPct+' %',
  pressure:observation.pressureHpa===null?'Sin dato':observation.pressureHpa+' hPa'
 };
}
function boot({map,L,onSelected,onObservation}){
 if(!map||!L)throw Error('El mapa Leaflet no está disponible');
 const layer=L.featureGroup();
 let active=false,loading=null,records=[];
 let observationSeq=0;
 const markers=new Map();
 const control=L.control({position:'topleft'});
 control.onAdd=()=>{
  const host=element('div');
  host.style.cssText='background:#18354de8;border:1px solid #90b2c9;border-radius:10px;padding:7px;box-shadow:0 4px 16px #0007;max-width:220px';
  const toggle=element('button','Estaciones meteorológicas');
  toggle.type='button';toggle.id='weather-stations-toggle';toggle.setAttribute('aria-pressed','false');
  toggle.title='Mostrar u ocultar ubicaciones de estaciones meteorológicas';
  toggle.style.cssText='background:#214e70;color:#fff;border:1px solid #89b8d4;border-radius:7px;font:700 12px/1.4 Arial,sans-serif;padding:9px 10px;cursor:pointer;width:100%;white-space:normal';
  const status=element('div','Capa desactivada');
  status.id='weather-stations-status';
  status.setAttribute('role','status');
  status.style.cssText='font:11px/1.4 Arial,sans-serif;color:#c9ddea;padding:6px 2px 2px;max-width:200px';
  const showAll=element('button','Ver todas las estaciones');
  showAll.type='button';showAll.hidden=true;showAll.style.cssText='background:#345a75;color:#fff;border:1px solid #6d95ad;border-radius:6px;font:11px Arial,sans-serif;padding:7px;cursor:pointer;width:100%;margin-top:5px';
  host.append(toggle,status,showAll);
  L.DomEvent.disableClickPropagation(host);L.DomEvent.disableScrollPropagation(host);
  function showEverywhere(){
   const bounds=layer.getBounds?.();
   if(bounds?.isValid())map.fitBounds(bounds,{padding:[55,55],maxZoom:10,animate:false});
  }
  showAll.addEventListener('click',showEverywhere);
  function popup(station){
   const currentRequest=++observationSeq;
   if(typeof onSelected==='function')onSelected(station);
   const box=element('section');
   box.style.cssText='min-width:240px;max-width:290px;color:#173147;font:12px/1.5 Arial,sans-serif';
   const title=element('h3',station.name);
   title.style.cssText='font-size:15px;line-height:1.3;margin:0 0 6px;color:#14334a';
   box.append(title);
   addLine(box,'Red','3D Argentina · 3D-PAWS');
   addLine(box,'Ubicación',station.location);
   addLine(box,'Instrumento',String(station.instrumentId).padStart(3,'0'));
   const info=element('p','Consultando la última observación…');
   info.style.cssText='background:#eff4f7;color:#23465b;border-radius:7px;padding:8px;margin:10px 0 4px;font-size:12px';
   box.append(info);
   const readings=element('div');box.append(readings);
   const note=element('small','Estación local: no es METAR oficial. Verificá vigencia y fuente.');
   note.style.cssText='display:block;color:#596e7b;font-size:11px;margin-top:8px';
   box.append(note);link(box,station.sourceUrl,'Consultar estación original');
   const forecastButton=element('button','Comparar con pronóstico Open-Meteo');
   forecastButton.type='button';
   forecastButton.style.cssText='display:block;margin-top:9px;padding:8px 10px;border:1px solid #7da9c6;border-radius:7px;background:#285b7e;color:#fff;font-size:11px;font-weight:750;cursor:pointer;width:100%';
   forecastButton.addEventListener('click',()=>root.GDV_OPEN_METEO_FORECAST?.showAt({
    lat:station.lat,lon:station.lon,name:station.name
   }));
   box.append(forecastButton);
   const controller=new AbortController();
   // Se consulta una estación seleccionada, nunca toda la red en cada movimiento del mapa.
   const timer=setTimeout(()=>controller.abort(),10000);
   fetch(API+'?id='+encodeURIComponent(station.id),{signal:controller.signal,headers:{Accept:'application/json'}})
    .then(async response=>{
     if(!response.ok)throw Error('Servicio no disponible');
     const data=await response.json();
     if(!data.ok||data.id!==station.id)throw Error('Respuesta no válida');
     if(!data.observation){
      if(currentRequest===observationSeq&&typeof onObservation==='function')onObservation(station,null,data);
      info.textContent=data.issue==='provider_access_denied'
       ?'La fuente 3D-PAWS no autoriza descargar sus lecturas (HTTP 401/403). La estación está registrada, pero no tenemos mediciones disponibles.'
       :data.issue==='provider_unavailable'
        ?'No se pudo conectar a la fuente 3D-PAWS. Podés consultar la estación original.'
        :'Sin una medición reciente verificable: la fuente no entregó datos con fecha y valores válidos. No se muestran pronósticos como observaciones.';
      return;
     }
     const observation=data.observation;
     if(currentRequest===observationSeq&&typeof onObservation==='function')onObservation(station,observation);
     const time=new Date(observation.observedAt);
     if(!Number.isFinite(time.getTime()))throw Error('Hora de observación inválida');
     const local=new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',
      day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(time);
     info.textContent=(observation.status==='recent'?'Última medición':'Medición DESACTUALIZADA')+
       ': '+local+' (Argentina) · hace '+observation.ageMinutes+' min';
     if(observation.status!=='recent')info.style.background='#ffefcc';
     const values=formatObservation(observation);
     addLine(readings,'Viento (desde)',values.wind);
     addLine(readings,'Ráfagas',values.gust);
     addLine(readings,'Temperatura',values.temperature);
     addLine(readings,'Humedad',values.humidity);
     addLine(readings,'Presión',values.pressure);
    }).catch(()=>{
     if(currentRequest===observationSeq&&typeof onObservation==='function')onObservation(station,null);
     info.textContent='No se pudo consultar la medición. El enlace a la fuente sigue disponible.';
    })
    .finally(()=>clearTimeout(timer));
   return box;
  }
  async function load(){
   if(records.length)return;
   if(loading)return loading;
   status.textContent='Cargando ubicaciones documentadas…';
   loading=(async()=>{
    const response=await fetch(CATALOG,{cache:'no-store'});
    if(!response.ok)throw Error('No se pudo consultar el catálogo local');
    const data=await response.json();
    if(!Array.isArray(data.stations)||!data.stations.length)throw Error('Catálogo vacío');
    const seen=new Set();
    for(const station of data.stations){
     if(!/^3dpaws-\d+$/.test(station.id)||seen.has(station.id))continue;
     if(typeof station.name!=='string'||!Number.isFinite(station.lat)||!Number.isFinite(station.lon)||
      station.lat<-56||station.lat>-21||station.lon<-75||station.lon>-52)continue;
     if(!/^https:\/\/3d-argentina\.icdp\.ucar\.edu\/instruments\/\d+$/.test(station.sourceUrl))continue;
     seen.add(station.id);records.push(station);
     const planeadores=station.category==='aeroclub';
     const marker=L.circleMarker([station.lat,station.lon],{
      radius:9,weight:2,color:'#f2f7ff',fillColor:planeadores?'#42a9d9':'#3ab49a',
      fillOpacity:.95
     }).bindTooltip(station.name,{direction:'top'});
     marker.on('click',()=>marker.bindPopup(popup(station),{maxWidth:320}).openPopup());
     layer.addLayer(marker);
     markers.set(station.id,marker);
    }
    if(!records.length)throw Error('No se encontraron estaciones con coordenadas válidas');
    status.textContent=records.length+' ubicaciones · 3D-PAWS (no METAR)';
    showAll.hidden=false;
   })().finally(()=>{loading=null});
   return loading;
  }
  toggle.addEventListener('click',async()=>{
   if(active){
    active=false;map.removeLayer(layer);toggle.setAttribute('aria-pressed','false');
    toggle.style.background='#214e70';status.textContent='Capa desactivada';showAll.hidden=true;
    return;
   }
   toggle.disabled=true;
   try{
    await load();layer.addTo(map);active=true;
    toggle.setAttribute('aria-pressed','true');
    toggle.style.background='#287b67';
    status.textContent=records.length+' estaciones · tocá una para ver sus datos';
    showAll.hidden=false;
   }catch(_){status.textContent='Catálogo no disponible. No se muestran datos inventados.'}
   finally{toggle.disabled=false}
  });
  return host;
 };
 control.addTo(map);
 return {show(){document.getElementById('weather-stations-toggle')?.click()},
  async showStation(id){
   if(!active)document.getElementById('weather-stations-toggle')?.click();
   if(loading)await loading.catch(()=>{});
   const marker=markers.get(id);
   if(!marker||!map.hasLayer(layer))return false;
   map.setView(marker.getLatLng(),Math.max(8,map.getZoom()),{animate:false});
   marker.fire('click');
   return true;
  },
  hide(){if(active)document.getElementById('weather-stations-toggle')?.click()},
  layer,get active(){return active}};
}
root.GDV_WEATHER_STATIONS={boot,formatObservation};
if(typeof module==='object'&&module.exports)module.exports={boot,formatObservation};
})(typeof window!=='undefined'?window:globalThis);
