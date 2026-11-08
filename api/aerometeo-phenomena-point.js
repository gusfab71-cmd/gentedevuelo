/* AeroMeteo · consulta puntual de fenómenos ESTIMADOS por Open-Meteo.
 * No se dibuja una "zona" de niebla/tormenta inferida de un único punto.
 * Usar solo para planificación informativa; no sustituye METAR ni SIGMET.
 */
'use strict';
const SOURCE='https://api.open-meteo.com/v1/forecast';
const TTL=15*60*1000,MAX_CACHE=150;
const cache=new Map(),pending=new Map(),calls=[];
function coordinate(x,min,max){
 if(typeof x!=='string'||!/^[-]?\d{1,2}(?:\.\d{1,6})?$/.test(x.trim()))return null;
 const n=Number(x);
 return Number.isFinite(n)&&n>=min&&n<=max?Math.round(n*100)/100:null;
}
function utcTime(t){
 if(typeof t!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(t))return null;
 const value=new Date(t+'Z');
 return Number.isFinite(value.getTime())?value.toISOString():null;
}
function number(x,min,max){
 if(x===null||x===undefined||typeof x!=='number'||!Number.isFinite(x))return null;
 return x>=min&&x<=max?x:null;
}
function normalize(data,point,now=Date.now()){
 if(!data||data.error||data.utc_offset_seconds!==0||!data.hourly||!Array.isArray(data.hourly.time))
  throw Error('Datos meteorológicos incompletos');
 const h=data.hourly;
 const options=[];
 for(let i=0;i<Math.min(h.time.length,12);i++){
  const time=utcTime(h.time[i]);
  if(!time||Math.abs(Date.parse(time)-now)>6*3600000)continue;
  const code=Array.isArray(h.weather_code)?number(h.weather_code[i],0,99):null;
  const visibilityM=Array.isArray(h.visibility)?number(h.visibility[i],0,100000):null;
  if(code!==null||visibilityM!==null)options.push({time,code,visibilityM});
 }
 options.sort((a,b)=>Math.abs(Date.parse(a.time)-now)-Math.abs(Date.parse(b.time)-now));
 const row=options[0];
 if(!row)throw Error('No hay pronóstico puntual cercano');
 // Código OMM: 45/48 niebla; 95/96/97/99 tormenta.
 // Visibilidad baja sin código de niebla NO se denomina niebla.
 const storm=row.code===null?null:[95,96,97,99].includes(row.code);
 const fog=row.code===null?null:[45,48].includes(row.code);
 const lowVisibility=row.visibilityM===null?null:row.visibilityM<1500;
 return {ok:true,kind:'point_model_estimate',source:'Open-Meteo (estimación, no observación)',
  sourceUrl:'https://open-meteo.com/en/docs',checkedAt:new Date(now).toISOString(),
  forecastAt:row.time,point,weatherCode:row.code,visibilityM:row.visibilityM,
  storm,fog,lowVisibility,
  note:'Estimación puntual de modelo: no describe áreas completas ni confirma ausencia de fenómenos. Consultar información aeronáutica oficial.'};
}
function urlFor(lat,lon){
 return SOURCE+'?'+new URLSearchParams({
  latitude:lat.toFixed(2),longitude:lon.toFixed(2),
  hourly:'weather_code,visibility',forecast_hours:'8',timezone:'UTC'
 });
}
function send(res,code,body){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control',code===200?'public, s-maxage=900, stale-while-revalidate=180':'no-store');
 return res.status(code).json(body);
}
async function load(lat,lon){
 const resp=await fetch(urlFor(lat,lon),{
  headers:{Accept:'application/json','User-Agent':'GenteDeVuelo-AeroMeteo/1.0 (+https://gentedevuelo.com)'},
  signal:AbortSignal.timeout(9000)
 });
 if(!resp.ok)throw Error('Open-Meteo no respondió');
 if(Number(resp.headers.get('content-length')||0)>220000)throw Error('Datos excesivos');
 const text=await resp.text();if(text.length>220000)throw Error('Datos excesivos');
 return normalize(JSON.parse(text),{lat,lon});
}
async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{ok:false,error:'Solo GET'});
 const lat=coordinate(req.query?.lat,-56,-21),lon=coordinate(req.query?.lon,-76,-52);
 if(lat===null||lon===null)return send(res,400,{ok:false,error:'Coordenadas fuera de Argentina'});
 const key=lat.toFixed(2)+','+lon.toFixed(2),now=Date.now();
 const prior=cache.get(key);
 if(prior&&now-prior.at<TTL)return send(res,200,prior.data);
 if(!pending.has(key)){
  while(calls.length&&calls[0]<now-60000)calls.shift();
  if(calls.length>=20)return send(res,429,{ok:false,error:'Demasiadas consultas'});
  calls.push(now);
  pending.set(key,load(lat,lon).then(data=>{
   if(cache.size>=MAX_CACHE)cache.delete(cache.keys().next().value);
   cache.set(key,{at:Date.now(),data});
   return data;
  }).finally(()=>pending.delete(key)));
 }
 try{return send(res,200,await pending.get(key))}
 catch(_){return send(res,502,{ok:false,error:'No se pudo consultar el modelo para este punto'})}
}
module.exports=handler;
module.exports._test={coordinate,utcTime,normalize,urlFor};
