/* AeroLocator / Flight Operations: SIGMET GeoJSON exclusivamente bajo solicitud.
 * Fuente NOAA Aviation Weather Center. Sin persistencia de datos operacionales.
 * No implica cobertura completa ni reemplaza los SIGMET oficiales SMN/AIP.
 */
'use strict';
const SOURCE_URL='https://aviationweather.gov/api/data/sigmet?format=geojson';
const CACHE_MS=300000;
let cache=null;
const LAT_MIN=-56,LAT_MAX=-21,LON_MIN=-75,LON_MAX=-52;

function isCoordPoint(value){
 return Array.isArray(value)&&value.length>=2&&
  Number.isFinite(Number(value[0]))&&Number.isFinite(Number(value[1]))&&
  Number(value[0])>=-180&&Number(value[0])<=180&&
  Number(value[1])>=-90&&Number(value[1])<=90;
}
function coordBounds(geometry){
 if(!geometry||!['Polygon','MultiPolygon','Point','LineString','MultiLineString'].includes(geometry.type))return null;
 let n=0,minLon=180,maxLon=-180,minLat=90,maxLat=-90;
 function inspect(v,depth){
  if(n>20000)return;
  if(isCoordPoint(v)){n++;minLon=Math.min(minLon,+v[0]);maxLon=Math.max(maxLon,+v[0]);minLat=Math.min(minLat,+v[1]);maxLat=Math.max(maxLat,+v[1]);return}
  if(depth>5||!Array.isArray(v))return;
  for(const child of v)inspect(child,depth+1);
 }
 inspect(geometry.coordinates,0);
 return n?{minLon,maxLon,minLat,maxLat,n}:null;
}
function inside(b){return b&&b.maxLat>=LAT_MIN&&b.minLat<=LAT_MAX&&b.maxLon>=LON_MIN&&b.minLon<=LON_MAX}
function trim(value,max=2000){return value==null?'':String(value).slice(0,max)}
function cleanFeature(row){
 const geom=row?.geometry;
 if(!geom||!['Polygon','MultiPolygon','LineString','Point'].includes(geom.type))return null;
 const b=coordBounds(geom);if(!inside(b)||b.n>20000)return null;
 const p=row.properties||{};
 const safe={};
 for(const k of ['hazard','severity','base','top','bottom','firId','fir','icaoId','validTimeFrom','validTimeTo','issueTime','raw','rawSigmet','rawText','text','name','phenomenon','dir','speed','qualifier','id']){
  if(typeof p[k]==='string'||typeof p[k]==='number')safe[k]=trim(p[k],k.startsWith('raw')||k==='text'?1800:200);
 }
 return {type:'Feature',properties:safe,geometry:geom};
}
function send(res,status,body){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','public, max-age=0, s-maxage=240');
 res.setHeader('X-Content-Type-Options','nosniff');
 return res.status(status).json(body);
}
async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{ok:false,error:'Método no permitido.'});
 if(cache&&Date.now()<cache.until)return send(res,200,cache.payload);
 let response;
 try{response=await fetch(SOURCE_URL,{
  headers:{Accept:'application/geo+json,application/json', 'User-Agent':'AeroLocator-GenteDeVuelo/1.0 (gentedevuelo@gmail.com)'},
  signal:AbortSignal.timeout(12000)
 })}catch(_){return send(res,503,{ok:false,error:'NOAA no respondió. Comprobar SIGMET oficiales del SMN.'})}
 if(response.status===204){
  const payload={ok:true,features:[],source:'NOAA Aviation Weather Center',checkedUtc:new Date().toISOString(),notice:'Sin SIGMET informados por esta consulta parcial; no confirma ausencia de avisos.'};
  cache={until:Date.now()+CACHE_MS,payload};return send(res,200,payload);
 }
 if(!response.ok)return send(res,503,{ok:false,error:'El servicio SIGMET externo no está disponible.'});
 let data;
 try{data=await response.json()}catch(_){return send(res,502,{ok:false,error:'Formato de respuesta meteorológica no válido.'})}
 const features=Array.isArray(data.features)?data.features:(Array.isArray(data.entries)?data.entries:[]);
 if(!Array.isArray(features))return send(res,502,{ok:false,error:'Respuesta meteorológica no reconocida.'});
 const selected=features.map(cleanFeature).filter(Boolean).slice(0,150);
 const payload={ok:true,features:selected,source:'NOAA Aviation Weather Center',checkedUtc:new Date().toISOString(),
  notice:'Cobertura internacional parcial. Validar siempre SIGMET del SMN; la geometría y niveles proceden de la fuente.'};
 cache={until:Date.now()+CACHE_MS,payload};
 return send(res,200,payload);
}
module.exports=handler;
module.exports._test={coordBounds,inside,cleanFeature};
