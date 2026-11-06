/* AeroLocator · Open-Meteo Forecast API, lectura no comercial en pruebas.
 * No es una estacion, METAR ni observacion de superficie certificada.
 * La API gratuita exige uso no comercial y credito CC BY 4.0.
 * Verificar permiso antes de publicar junto a AeroSuite comercial.
 * Fuente: https://open-meteo.com/en/docs | Terminos: https://open-meteo.com/en/terms
 */
'use strict';
const SOURCE='https://api.open-meteo.com/v1/forecast';
const FIELDS=['temperature_2m','relative_humidity_2m','pressure_msl',
 'wind_speed_10m','wind_direction_10m','wind_gusts_10m','cloud_cover','precipitation'];
const TTL_MS=15*60*1000;
const MAX_CACHE=200;
const cache=new Map();
const pending=new Map();
const upstreamCalls=[];
const NUMBER_PATTERN=/^-?\d{1,2}(?:\.\d{1,6})?$/;
function coordinate(value,min,max){
 if(typeof value!=='string'||!NUMBER_PATTERN.test(value.trim()))return null;
 const x=Number(value);
 return Number.isFinite(x)&&x>=min&&x<=max?Math.round(x*100)/100:null;
}
function numeric(value,min,max){
 if(value===null||value===undefined||value===''||typeof value==='boolean')return null;
 const x=Number(value);
 return Number.isFinite(x)&&x>=min&&x<=max?x:null;
}
function utcTime(value){
 if(typeof value!=='string')return null;
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(value))return null;
 const time=new Date(value+'Z');
 return Number.isFinite(time.getTime())?time.toISOString():null;
}
function normalizeRow(values,time){
 if(!values||typeof values!=='object'||!time)return null;
 const row={
  time,
  temperatureC:numeric(values.temperature_2m,-90,65),
  humidityPct:numeric(values.relative_humidity_2m,0,100),
  pressureHpa:numeric(values.pressure_msl,650,1150),
  windKt:numeric(values.wind_speed_10m,0,250),
  directionDeg:numeric(values.wind_direction_10m,0,360),
  gustKt:numeric(values.wind_gusts_10m,0,300),
  cloudPct:numeric(values.cloud_cover,0,100),
  precipitationMm:numeric(values.precipitation,0,400)
 };
 if(Object.keys(row).slice(1).every(key=>row[key]===null))return null;
 return row;
}
function normalizeForecast(data,location,now=Date.now()){
 if(!data||typeof data!=='object'||data.error||data.utc_offset_seconds!==0)
  throw Error('Modelo con zona horaria incompatible o datos invalidos');
 if(data.current_units?.wind_speed_10m!=='kn'||data.current_units?.wind_gusts_10m!=='kn')
  throw Error('Unidad de viento distinta de nudos');
 const instant=utcTime(data.current?.time);
 if(!instant||Math.abs(now-Date.parse(instant))>6*3600000)
  throw Error('Hora del pronostico actual fuera de rango');
 const current=normalizeRow(data.current,instant);
 if(!current)throw Error('Pronostico sin variables utilizables');
 const hourly=data.hourly;
 const forecast=[];
 if(hourly&&Array.isArray(hourly.time)){
  const count=Math.min(hourly.time.length,6);
  for(let i=0;i<count;i++){
   const time=utcTime(hourly.time[i]);
   if(!time||Math.abs(now-Date.parse(time))>24*3600000)continue;
   const source={};
   for(const field of FIELDS)source[field]=Array.isArray(hourly[field])?hourly[field][i]:null;
   const item=normalizeRow(source,time);
   if(item)forecast.push(item);
  }
 }
 return {
  ok:true,source:'Open-Meteo',kind:'model_forecast',isMetar:false,
  sourceUrl:'https://open-meteo.com/en/docs',
  attribution:'Pronóstico: Open-Meteo (CC BY 4.0)',
  licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
  checkedAt:new Date(now).toISOString(),
  point:{lat:location.lat,lon:location.lon},
  grid:{lat:numeric(data.latitude,-90,90),lon:numeric(data.longitude,-180,180)},
  current,forecast,
  warning:'Estimación de modelos meteorológicos: no es observación de estación ni METAR oficial. No usar como único dato para decidir un vuelo.'
 };
}
function sourceUrl(lat,lon){
 const params=new URLSearchParams({
  latitude:lat.toFixed(2),longitude:lon.toFixed(2),
  current:FIELDS.join(','),hourly:FIELDS.join(','),
  forecast_hours:'6',timezone:'UTC',wind_speed_unit:'kn',temperature_unit:'celsius',
  precipitation_unit:'mm'
 });
 return SOURCE+'?'+params.toString();
}
function send(res,code,body){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control',code===200?'public, s-maxage=900, stale-while-revalidate=300':'no-store');
 return res.status(code).json(body);
}
async function requestForecast(lat,lon){
 const response=await fetch(sourceUrl(lat,lon),{
  headers:{Accept:'application/json','User-Agent':'GenteDeVuelo-AeroLocator/1.0'},
  signal:AbortSignal.timeout(9000)
 });
 if(!response.ok)throw Error('Pronostico externo no disponible');
 if(Number(response.headers.get('content-length')||0)>350000)
  throw Error('Respuesta excesiva');
 const text=await response.text();
 if(text.length>350000)throw Error('Respuesta excesiva');
 return normalizeForecast(JSON.parse(text),{lat,lon});
}
async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{ok:false,error:'Solo GET'});
 const lat=coordinate(req.query?.lat,-56,-21),lon=coordinate(req.query?.lon,-75,-52);
 if(lat===null||lon===null)return send(res,400,{ok:false,error:'Coordenadas no válidas para Argentina'});
 const key=lat.toFixed(2)+','+lon.toFixed(2),now=Date.now();
 const saved=cache.get(key);
 if(saved&&now-saved.savedAt<TTL_MS)return send(res,200,saved.data);
 if(!pending.has(key)){
  // Cuota defensiva local, adicional a la cache CDN (por instancia de servidor).
  while(upstreamCalls.length&&upstreamCalls[0]<now-60000)upstreamCalls.shift();
  if(upstreamCalls.length>=30)return send(res,429,{ok:false,error:'Demasiadas consultas. Reintentar más tarde.'});
  upstreamCalls.push(now);
  pending.set(key,requestForecast(lat,lon).then(data=>{
   if(cache.size>=MAX_CACHE)cache.delete(cache.keys().next().value);
   cache.set(key,{data,savedAt:Date.now()});
   return data;
  }).finally(()=>pending.delete(key)));
 }
 try{return send(res,200,await pending.get(key))}
 catch(_){return send(res,502,{ok:false,error:'Open-Meteo no está disponible o no devolvió un pronóstico válido'})}
}
module.exports=handler;
module.exports._test={coordinate,numeric,utcTime,normalizeForecast,normalizeRow,sourceUrl,FIELDS};
