/* AeroLocator · Pronóstico Open-Meteo, separado de las estaciones locales.
 * Sin consultas automáticas al mover el mapa: únicamente por acción del piloto.
 */
(function(root){
'use strict';
const API='/api/aerolocator-open-meteo';
function node(tag,label){
 const e=document.createElement(tag);
 if(label!==undefined&&label!==null)e.textContent=String(label);
 return e;
}
function paragraph(target,label,value){
 const row=node('div');
 row.style.cssText='display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #dae4eb';
 const title=node('strong',label),v=node('span',value);
 v.style.textAlign='right';
 row.append(title,v);target.append(row);
}
function number(value,suffix){
 return typeof value==='number'&&Number.isFinite(value)?value+suffix:'Sin dato';
}
function wind(row){
 const direction=number(row.directionDeg,'°');
 const knots=number(row.windKt,' kt');
 return direction==='Sin dato'?knots:knots==='Sin dato'?direction:direction+' · '+knots;
}
function localTime(iso){
 const d=new Date(iso);
 if(!Number.isFinite(d.getTime()))return 'Hora no disponible';
 return new Intl.DateTimeFormat('es-AR',{
  timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',
  hour:'2-digit',minute:'2-digit',hour12:false
 }).format(d);
}
function render(parent,data,location){
 parent.replaceChildren();
 const h=node('h3','Pronóstico Open-Meteo · '+location);
 h.style.cssText='font-size:15px;color:#153951;margin:0 0 5px';
 parent.append(h);
 const description=node('p','MODELO meteorológico estimado · No es una estación ni un METAR.');
 description.style.cssText='font-size:11px;background:#fff0cb;border-left:3px solid #d29d36;padding:7px;color:#694400;margin:0 0 8px';
 parent.append(description);
 const now=node('p','Referencia del modelo: '+localTime(data.current.time)+' (hora argentina)');
 now.style.cssText='font-size:11px;margin:6px 0;color:#466779';parent.append(now);
 paragraph(parent,'Viento a 10 m',wind(data.current));
 paragraph(parent,'Ráfagas a 10 m',number(data.current.gustKt,' kt'));
 paragraph(parent,'Temperatura',number(data.current.temperatureC,' °C'));
 paragraph(parent,'Humedad',number(data.current.humidityPct,' %'));
 paragraph(parent,'Presión reducida al nivel del mar',number(data.current.pressureHpa,' hPa'));
 paragraph(parent,'Nubosidad total',number(data.current.cloudPct,' %'));
 paragraph(parent,'Precipitación',number(data.current.precipitationMm,' mm'));
 if(Array.isArray(data.forecast)&&data.forecast.length){
  const details=node('details');details.style.marginTop='9px';
  const summary=node('summary','Próximas '+data.forecast.length+' horas · pronóstico');
  summary.style.cssText='font-size:12px;font-weight:700;color:#215b82;cursor:pointer';
  details.append(summary);
  for(const row of data.forecast){
   const item=node('div');
   item.style.cssText='border-top:1px solid #dce5ec;padding:7px 1px;font-size:11px';
   const title=node('strong',localTime(row.time));item.append(title);
   item.append(node('div',wind(row)+' · ráfagas '+number(row.gustKt,' kt')));
   item.append(node('div','Nubes '+number(row.cloudPct,' %')+' · lluvia '+number(row.precipitationMm,' mm')));
   details.append(item);
  }
  parent.append(details);
 }
 const source=node('a','Pronóstico: Open-Meteo (CC BY 4.0)');
 source.href='https://open-meteo.com/en/docs';source.target='_blank';source.rel='noopener noreferrer';
 source.style.cssText='display:block;margin-top:10px;font-size:11px;font-weight:bold;color:#1b5d8c';
 parent.append(source);
 const licence=node('a','Licencia de datos');licence.href='https://creativecommons.org/licenses/by/4.0/';
 licence.target='_blank';licence.rel='noopener noreferrer';
 licence.style.cssText='display:block;font-size:10px;color:#1b5d8c';
 parent.append(licence);
 const disclaimer=node('small','Pronóstico orientativo. Consultar meteorología aeronáutica oficial, NOTAM y condiciones reales antes de volar.');
 disclaimer.style.cssText='display:block;color:#566d7b;font-size:10px;margin-top:8px';
 parent.append(disclaimer);
}
function boot({map,L,onForecast,onPending,onForecastError,dockContainer=null}){
 if(!map||!L)throw Error('AeroLocator necesita Leaflet');
 const control=L.control({position:'topleft'});
 let requestId=0;
 // AeroMeteo dispone de un panel fijo dentro del mapa. AeroLocator conserva su popup original.
 const popup=dockContainer?null:L.popup({maxWidth:390,autoPan:true});
 let dock=null,dockBody=null;
 if(dockContainer){
  dock=node('section');
  dock.className='am-forecast-dock';
  dock.hidden=true;
  dock.setAttribute('aria-label','Pronóstico del punto consultado');
  const header=node('div');header.className='am-forecast-dock-heading';
  header.append(node('strong','Pronóstico del punto seleccionado'));
  const close=node('button','×');close.type='button';
  close.className='am-forecast-dock-close';
  close.setAttribute('aria-label','Cerrar tarjeta meteorológica del mapa');
  close.addEventListener('click',()=>{dock.hidden=true;});
  header.append(close);
  dockBody=node('div');
  dockBody.className='am-forecast-dock-content';
  dock.append(header,dockBody);
  dockContainer.append(dock);
  L.DomEvent.disableClickPropagation(dock);
  L.DomEvent.disableScrollPropagation(dock);
 }
 const showAt=async({lat,lon,name,icao}={})=>{
  const latitude=Number(lat),longitude=Number(lon);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||
     latitude<-56||latitude>-21||longitude<-75||longitude>-52)return false;
  const safeName=typeof name==='string'?name.slice(0,90):'punto seleccionado';
  const safeIcao=typeof icao==='string'&&/^SA[A-Z]{2}$/.test(icao.toUpperCase())?icao.toUpperCase():null;
  const selected={lat:latitude,lon:longitude,name:safeName,...(safeIcao?{icao:safeIcao}:{})};
  const id=++requestId;
  if(typeof onPending==='function')onPending(selected);
  const view=dock?dockBody:node('section');
  view.replaceChildren();
  if(dock){
   dock.hidden=false;
  }else{
   view.style.cssText='min-width:260px;max-width:350px;max-height:55dvh;overflow-y:auto;color:#163147;font:12px/1.5 Arial,sans-serif';
   view.append(node('strong','Pronóstico Open-Meteo · '+safeName));
  }
  const message=node('p','Consultando modelos meteorológicos…');
  view.append(message);
  if(popup)popup.setLatLng([latitude,longitude]).setContent(view).openOn(map);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const query=new URLSearchParams({lat:latitude.toFixed(5),lon:longitude.toFixed(5)});
   const response=await fetch(API+'?'+query,{headers:{Accept:'application/json'},signal:controller.signal});
   if(!response.ok)throw Error('Fuente no disponible');
   const data=await response.json();
   if(!data.ok||data.kind!=='model_forecast'||!data.current||data.isMetar!==false)
    throw Error('Respuesta de modelo no válida');
   if(id===requestId){
    render(view,data,safeName);
    if(typeof onForecast==='function')onForecast(data,selected);
   }
  }catch(_){
   if(id===requestId){
    message.textContent='No hay pronóstico disponible. No se muestran valores estimados sin respaldo.';
    if(typeof onForecastError==='function')onForecastError(selected);
   }
  }finally{clearTimeout(timer)}
  return true;
 };
 control.onAdd=()=>{
  const host=node('div');
  host.style.cssText='background:#18354de8;border:1px solid #90b2c9;border-radius:10px;padding:7px;max-width:220px;box-shadow:0 4px 16px #0007';
  const button=node('button','Pronóstico Open-Meteo');
  button.type='button';button.id='open-meteo-map-forecast';
  button.title='Consultar pronóstico para el centro visible del mapa';
  button.style.cssText='background:#315676;color:#fff;border:1px solid #81afd0;border-radius:7px;font:bold 12px/1.4 Arial,sans-serif;padding:9px 10px;cursor:pointer;width:100%';
  const caption=node('div','Consultá el centro del mapa · estimaciones, no METAR');
  caption.style.cssText='font:10px/1.3 Arial,sans-serif;color:#bfd8ed;margin:5px 1px 0';
  button.addEventListener('click',()=>{
   const pos=map.getCenter();
   void showAt({lat:pos.lat,lon:pos.lng,name:'centro del mapa'});
  });
  host.append(button,caption);
  L.DomEvent.disableClickPropagation(host);L.DomEvent.disableScrollPropagation(host);
  return host;
 };
 control.addTo(map);
 return {showAt,render,dock};
}
root.GDV_OPEN_METEO_FORECAST={boot,render,wind,localTime};
if(typeof module==='object'&&module.exports)module.exports={boot,render,wind,localTime};
})(typeof window!=='undefined'?window:globalThis);
