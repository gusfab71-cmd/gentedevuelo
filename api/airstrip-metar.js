/* AeroSuite / Gente de Vuelo: METAR cercano bajo consulta explícita.
   Referencia meteorológica de otra estación, nunca un METAR de la pista no oficial.
   Endpoint servidor: AviationWeather.gov restringe CORS a navegadores. */
'use strict';

const METAR_URL='https://aviationweather.gov/api/data/metar';
const MAX_NEARBY_NM=120;
const FRESH_MINUTES=120;
const MAX_AGE_MINUTES=720;
const MIN_REQUEST_GAP_MS=0;
const CACHE_TTL_MS=300000;
const cache=new Map();

function nmBetween(a,b,c,d){
 const r=Math.PI/180, p1=a*r,p2=c*r,delta1=(c-a)*r,delta2=(d-b)*r;
 const h=Math.sin(delta1/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(delta2/2)**2;
 return 3440.065*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
function validCoordinate(lat,lon){
 return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-56&&lat<=-21&&lon>=-74&&lon<=-53;
}
function parseObservationTime(value){
 if(typeof value==='number'&&Number.isFinite(value)&&value>0){
  const v=value>1e12?value:value*1000;
  return Number.isFinite(v)?v:null;
 }
 if(typeof value==='string'&&value.trim()){
  const v=Date.parse(value);
  return Number.isFinite(v)?v:null;
 }
 return null;
}
function pickNearest(reports,latitude,longitude,now=Date.now()){
 if(!Array.isArray(reports))return null;
 let selected=null;
 for(const row of reports){
  if(!row||typeof row!=='object')continue;
  const lat=Number(row.lat),lon=Number(row.lon);
  const icao=String(row.icaoId||'').trim().toUpperCase();
  const raw=String(row.rawOb||'').trim();
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||!/^[A-Z0-9]{4}$/.test(icao)||!raw||raw.length>5000)continue;
  const observation=parseObservationTime(row.obsTime??row.reportTime);
  if(observation===null)continue;
  const age=(now-observation)/60000;
  // No reportes sin sello horario, absurdamente futuros o de jornadas pasadas.
  if(age< -15||age>MAX_AGE_MINUTES)continue;
  const distance=nmBetween(latitude,longitude,lat,lon);
  if(distance>MAX_NEARBY_NM)continue;
  if(!selected||distance<selected.distanceNm){
   selected={
    station:icao,
    distanceNm:Number(distance.toFixed(1)),
    observationUtc:new Date(observation).toISOString(),
    ageMinutes:Math.max(0,Math.round(age)),
    freshness:age<=FRESH_MINUTES?'recent':'stale',
    raw:raw.slice(0,1800).replace(/[\x00-\x1F]/g,''),
    source:'NOAA Aviation Weather Center (AWC)'
   };
  }
 }
 return selected;
}
function bboxAround(lat,lon){
 // Limitar la consulta a ~135 NM a cada lado, cerca de 120 NM radiales.
 const radius=2.27;
 const lonRadius=Math.min(6,radius/Math.max(.37,Math.cos(lat*Math.PI/180)));
 const south=Math.max(-90,lat-radius),north=Math.min(90,lat+radius);
 const west=Math.max(-180,lon-lonRadius),east=Math.min(180,lon+lonRadius);
 return [south,west,north,east].map(x=>x.toFixed(3)).join(',');
}
function send(res,status,data){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','public, max-age=0, s-maxage=240, stale-while-revalidate=60');
 res.setHeader('X-Content-Type-Options','nosniff');
 return res.status(status).json(data);
}
async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{ok:false,error:'Método no permitido.'});
 const lat=Number(req.query?.lat),lon=Number(req.query?.lon);
 if(!req.query||typeof req.query.lat!=='string'||typeof req.query.lon!=='string'||!validCoordinate(lat,lon)){
  return send(res,400,{ok:false,error:'Coordenadas de la pista no válidas.'});
 }
 const key=Math.round(lat*200)/200+','+Math.round(lon*200)/200;
 const cached=cache.get(key);
 if(cached&&Date.now()<cached.until)return send(res,200,cached.data);
 if(cache.size>220)cache.clear();
 const url=new URL(METAR_URL);
 url.searchParams.set('bbox',bboxAround(lat,lon));
 url.searchParams.set('format','json');
 let response;
 try{
  response=await fetch(url.toString(),{
   headers:{'Accept':'application/json','User-Agent':'AeroSuite-GenteDeVuelo/1.0 (gentedevuelo@gmail.com)'},
   signal:AbortSignal.timeout(10000)
  });
 }catch(_){
  return send(res,503,{ok:false,error:'El servicio meteorológico no responde por el momento.'});
 }
 if(response.status===204){
  const data={ok:true,available:false,reason:'No se encontró un METAR emitido en la zona consultada.',maxDistanceNm:MAX_NEARBY_NM};
  cache.set(key,{data,until:Date.now()+CACHE_TTL_MS});
  return send(res,200,data);
 }
 if(!response.ok){
  return send(res,503,{ok:false,error:response.status===429?'El proveedor meteorológico limitó temporalmente las consultas.':'No se pudo obtener el METAR del proveedor.'});
 }
 let body;
 try{body=await response.json()}catch(_){return send(res,502,{ok:false,error:'El proveedor devolvió un formato de METAR inesperado.'})}
 if(!Array.isArray(body))return send(res,502,{ok:false,error:'Respuesta meteorológica no reconocida.'});
 const nearest=pickNearest(body,lat,lon);
 const data=nearest?
  {ok:true,available:true,...nearest,warning:'Observación de otra estación, no necesariamente representativa de la pista consultada. Verificar fuente oficial, hora, distancia, condiciones locales y NOTAM.'}:
  {ok:true,available:false,reason:'No hay METAR reciente o verificable de una estación dentro de '+MAX_NEARBY_NM+' NM.',maxDistanceNm:MAX_NEARBY_NM};
 cache.set(key,{data,until:Date.now()+CACHE_TTL_MS});
 return send(res,200,data);
}
module.exports=handler;
module.exports._test={nmBetween,validCoordinate,parseObservationTime,pickNearest,bboxAround};
