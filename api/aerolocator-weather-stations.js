/* AeroLocator · mediciones 3D-PAWS / CHORDS. Solo lectura.
 * La disponibilidad, autenticacion y licencia de redistribucion de cada
 * proveedor deben revisarse antes de la publicacion en produccion.
 */
'use strict';
const catalog=require('../assets/aerolocator-weather-stations-ar.json');
const ALLOWED=new Map(catalog.stations.map(st=>[st.id,st]));
const BASE='https://3d-argentina.icdp.ucar.edu';
const TTL_MS=5*60*1000;
const MAX_AGE_MS=30*60*1000;
const cache=new Map();
function numeric(value,low,high){
 if(value===null||value===undefined||value==='')return null;
 const number=typeof value==='number'?value:Number(value);
 return Number.isFinite(number)&&number>=low&&number<=high?number:null;
}
function validDate(value){
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const text=String(value).trim();
 const date=new Date(/^\d{4}-\d{2}-\d{2}T\d\d:\d\d:\d\d(?:\.\d+)?$/.test(text)?text+'Z':text);
 return Number.isFinite(date.getTime())?date.toISOString():null;
}
function rowsFromChords(data){
 if(Array.isArray(data))return data;
 if(!data||typeof data!=='object')return [];
 if(Array.isArray(data.features))
  return data.features.map(x=>({...x.properties,...(x.properties?.measurements||{})}));
 for(const name of ['measurements','data','records','observations','results'])
  if(Array.isArray(data[name]))return data[name];
 if(data.data&&typeof data.data==='object')return rowsFromChords(data.data);
 return [data];
}
function parseChords(data,now=Date.now()){
 const rows=rowsFromChords(data);
 let latest=null,stamp=0;
 for(const row of rows){
  if(!row||typeof row!=='object')continue;
  const timestamp=validDate(row.at||row.time||row.timestamp||row.observed_at||row.date||row.measured_at);
  if(!timestamp)continue;
  const time=Date.parse(timestamp);
  if(time>now+5*60*1000||time<now-365*24*3600000)continue;
  if(time>stamp){latest={};stamp=time}
  if(time!==stamp)continue;
  const values=row.values&&typeof row.values==='object'?row.values:row;
  for(const key of ['ws','wg','wd','st1','sh1','bp1']){
   if(values[key]!==undefined)latest[key]=values[key];
  }
  // Algunas versiones de CHORDS envian una fila por variable.
  const short=values.short_name||values.shortName||values.variable;
  if(typeof short==='string'&&['ws','wg','wd','st1','sh1','bp1'].includes(short))
   latest[short]=values.value;
 }
 if(!latest||!stamp)return null;
 const windMs=numeric(latest.ws,0,80);
 const gustMs=numeric(latest.wg,0,100);
 const windDirection=numeric(latest.wd,0,360);
 const temperature=numeric(latest.st1,-70,65);
 const humidity=numeric(latest.sh1,0,100);
 const pressure=numeric(latest.bp1,650,1150);
 if([windMs,gustMs,windDirection,temperature,humidity,pressure].every(v=>v===null))return null;
 return {
  observedAt:new Date(stamp).toISOString(),ageMinutes:Math.max(0,Math.floor((now-stamp)/60000)),
  status:now-stamp<=MAX_AGE_MS?'recent':'stale',
  windKt:windMs===null?null:Math.round(windMs*1.943844*10)/10,
  gustKt:gustMs===null?null:Math.round(gustMs*1.943844*10)/10,
  windDirection,temperatureC:temperature,humidityPct:humidity,pressureHpa:pressure
 };
}
function send(res,status,body){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=120');
 res.setHeader('X-Content-Type-Options','nosniff');
 return res.status(status).json(body);
}
async function readObservation(station){
 const url=BASE+'/api/v1/data/'+station.instrumentId+'.geojson?last';
 const response=await fetch(url,{
  headers:{Accept:'application/json','User-Agent':'GenteDeVuelo-AeroLocator/1.0'},
  signal:AbortSignal.timeout(8000)
 });
 if(!response.ok)throw Error('La fuente no entrego datos');
 const declaredSize=Number(response.headers.get('content-length')||0);
 if(declaredSize>800000)throw Error('Respuesta demasiado grande');
 const body=await response.text();
 if(body.length>800000)throw Error('Respuesta demasiado grande');
 return parseChords(JSON.parse(body));
}
async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{ok:false,error:'Solo consultas GET'});
 if(!req.query||typeof req.query.id!=='string'||!ALLOWED.has(req.query.id))
  return send(res,400,{ok:false,error:'Estación no reconocida'});
 const station=ALLOWED.get(req.query.id);
 const prior=cache.get(station.id);
 if(prior&&Date.now()-prior.checkedAt<TTL_MS)
  return send(res,200,prior.body);
 let observation=null,available=false;
 try{observation=await readObservation(station);available=observation!==null}
 catch(_){/* No exhibir cifras sin verificarlas; mantener enlace a la fuente. */}
 const body={ok:true,id:station.id,source:'3D-PAWS / CHORDS',
  sourceUrl:station.sourceUrl,checkedAt:new Date().toISOString(),
  observation,available,note:available
   ?'Observación local, no METAR oficial. Verificar antigüedad y condiciones del aeródromo.'
   :'No se pudo confirmar una lectura válida. Consultar la estación original; no se sustituyen datos por pronósticos.'};
 cache.set(station.id,{checkedAt:Date.now(),body});
 return send(res,200,body);
}
module.exports=handler;
module.exports._test={parseChords,rowsFromChords,validDate,numeric,catalog};
