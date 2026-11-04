/* AeroLocator / Flight Operations | SIGMET geográficos de NOAA AWC.
 * Solo muestra geometrías realmente entregadas por el proveedor.
 * No reemplaza SMN / AIP / NOTAM / planificación meteorológica oficial.
 */
'use strict';
const SOURCE_URL='https://aviationweather.gov/api/data/sigmet?format=geojson';
const CACHE_MS=300000;
const LAT_MIN=-56,LAT_MAX=-21,LON_MIN=-75,LON_MAX=-52;
let cache=null;
const wanted=['Polygon','MultiPolygon','Point','LineString','MultiLineString'];

function coordinatePoint(v){
 return Array.isArray(v)&&v.length>=2&&
 Number.isFinite(v[0])&&Number.isFinite(v[1])&&
 v[0]>=-180&&v[0]<=180&&v[1]>=-90&&v[1]<=90;
}
function boundsOf(geom){
 if(!geom||!wanted.includes(geom.type))return null;
 const bounds={west:180,east:-180,south:90,north:-90,count:0,invalid:false};
 function walk(input,depth){
  if(bounds.invalid||depth>9)return;
  if(Array.isArray(input)&&input.length>=2&&typeof input[0]==='number'&&typeof input[1]==='number'){
   if(!coordinatePoint(input)){bounds.invalid=true;return}
   bounds.count++;if(bounds.count>6000){bounds.invalid=true;return}
   bounds.west=Math.min(bounds.west,input[0]);bounds.east=Math.max(bounds.east,input[0]);
   bounds.south=Math.min(bounds.south,input[1]);bounds.north=Math.max(bounds.north,input[1]);return;
  }
  if(!Array.isArray(input)){bounds.invalid=true;return}
  for(const item of input)walk(item,depth+1);
 }
 walk(geom.coordinates,0);
 return bounds.invalid||!bounds.count?null:bounds;
}
function overlapsArgentina(b){
 return b&&b.east>=LON_MIN&&b.west<=LON_MAX&&b.north>=LAT_MIN&&b.south<=LAT_MAX;
}
function firstValue(p,names){
 for(const name of names)if(p[name]!==undefined&&p[name]!==null&&p[name]!=='')return p[name];
 return null;
}
function safeText(v,max=900){
 if(v===null||v===undefined)return null;
 const t=String(v).replace(/[\u0000-\u001F\u007F]+/g,' ').trim();
 return t?t.slice(0,max):null;
}
function parseTime(value){
 if(value===null||value===undefined||value==='')return null;
 let ts;
 if(typeof value==='number'||(typeof value==='string'&&/^\d{10,13}$/.test(value))){
  const n=Number(value);ts=n<1e12?n*1000:n;
 }else if(typeof value==='string'){ts=Date.parse(value);}
 return Number.isFinite(ts)&&ts>0?ts:null;
}
function isoTime(value){
 const time=parseTime(value);return time===null?null:new Date(time).toISOString();
}
function numericAltitude(v){
 if(v===null||v===undefined||v==='')return null;
 if(typeof v==='number'&&Number.isFinite(v))return v;
 if(typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v.trim()))return Number(v.trim());
 return null;
}
function altitudeText(value){
 if(value===null||value===undefined||value==='')return null;
 if(typeof value==='string'&&/^\s*(?:FL|SFC|GND)\b/i.test(value))return safeText(value,35);
 const n=numericAltitude(value);
 return n!==null?n.toLocaleString('en-US',{maximumFractionDigits:0})+' ft (NOAA)':safeText(value,35);
}
function normalizeRow(feature,now=Date.now()){
 const geom=feature?.geometry;
 const bounds=boundsOf(geom);
 if(!overlapsArgentina(bounds))return null;
 const p={...(feature?.properties||{})};
 const id=safeText(firstValue(p,['id','sigmetId','sigmet_id','seriesId','series_id'])??feature?.id,120);
 const issuer=safeText(firstValue(p,['icaoId','icao_id','firId','fir','issuingOffice','issuing_office']),50);
 const start=isoTime(firstValue(p,['validTimeFrom','valid_time_from','startTime','start_time']));
 const end=isoTime(firstValue(p,['validTimeTo','valid_time_to','endTime','end_time']));
 const endMs=end?Date.parse(end):null;
 const startMs=start?Date.parse(start):null;
 // Don't show expired notices as active polygons. Future notices are not current either.
 if(endMs!==null&&endMs<now-60000)return {expired:true};
 if(startMs!==null&&startMs>now+60000)return {future:true};
 const hazard=safeText(firstValue(p,['hazard','phenomenon','sigmetType','sigmet_type']),80)||'Fenómeno sin clasificar';
 const severity=safeText(firstValue(p,['severity','qualifier']),60);
 const lower=altitudeText(firstValue(p,['altitudeLow','altitude_low','base','bottom','altitudeLow1']));
 const upper=altitudeText(firstValue(p,['altitudeHi','altitude_hi','top','altitudeHi1']));
 const direction=safeText(firstValue(p,['movementDir','movement_dir','dir']),50);
 const speed=safeText(firstValue(p,['movementSpd','movement_spd','speed']),50);
 const issued=isoTime(firstValue(p,['issueTime','issue_time','issuedTime','issued_time']));
 const raw=safeText(firstValue(p,['rawSigmet','raw_sigmet','raw','rawText','raw_text','text']),2000);
 return {type:'Feature',geometry:geom,properties:{
  id,icaoId:issuer,hazard,severity,qualifier:safeText(firstValue(p,['qualifier']),60),
  lowerLevel:lower,upperLevel:upper,
  validTimeFrom:start,validTimeTo:end,issueTime:issued,
  movementDir:direction,movementSpeed:speed,raw,
  geometryType:geom.type,areaType:geom.type==='Polygon'||geom.type==='MultiPolygon'?'sector':'referencia_no_areal',
  timeStatus:start&&end?'vigencia_expresa':'vigencia_incompleta',
  source:'NOAA Aviation Weather Center'
 }};
}
function send(res,status,data){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','public, max-age=0, s-maxage=240');
 res.setHeader('X-Content-Type-Options','nosniff');
 return res.status(status).json(data);
}
async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{ok:false,error:'Método no permitido'});
 if(cache&&Date.now()<cache.until)return send(res,200,cache.payload);
 let response;
 try{
  response=await fetch(SOURCE_URL,{
   headers:{Accept:'application/geo+json,application/json',
    'User-Agent':'AeroLocator-GenteDeVuelo/1.0 (gentedevuelo@gmail.com)'},
   signal:AbortSignal.timeout(12000)
  });
 }catch(_){return send(res,503,{ok:false,error:'No se pudo consultar NOAA. Revisá avisos oficiales del SMN.'});}
 if(response.status===204){
  const payload={ok:true,features:[],counts:{sectors:0,references:0,withoutGeometry:0,expired:0,unclassified:0},
   source:'NOAA Aviation Weather Center',checkedUtc:new Date().toISOString(),
   notice:'No se recibieron áreas. Esto NO garantiza ausencia de SIGMET.'};
  cache={payload,until:Date.now()+CACHE_MS};return send(res,200,payload);
 }
 if(!response.ok)return send(res,503,{ok:false,error:'El servicio externo SIGMET no está disponible ('+response.status+').'});
 let data;
 try{data=await response.json()}catch(_){return send(res,502,{ok:false,error:'NOAA devolvió una respuesta que no es JSON.'});}
 if(!data||!Array.isArray(data.features))
  return send(res,502,{ok:false,error:'NOAA no devolvió un GeoJSON de tipo FeatureCollection verificable.'});
 const counts={sectors:0,references:0,withoutGeometry:0,expired:0,future:0,unclassified:0};
 const seen=new Set(),features=[];
 const now=Date.now();
 for(const sourceFeature of data.features){
  if(features.length>=150)break;
  const out=normalizeRow(sourceFeature,now);
  if(out?.expired){counts.expired++;continue}
  if(out?.future){counts.future++;continue}
  if(!out){
   // Some SIGMET may not have usable cartographic geometry; never invent it.
   counts.withoutGeometry++;continue;
  }
  const p=out.properties;
  const dedupKey=[p.id,p.icaoId,p.hazard,p.validTimeFrom,p.validTimeTo,JSON.stringify(out.geometry).slice(0,200)].join('|');
  if(seen.has(dedupKey))continue;
  seen.add(dedupKey);
  if(p.areaType==='sector')counts.sectors++;else counts.references++;
  if(p.timeStatus==='vigencia_incompleta')counts.unclassified++;
  features.push(out);
 }
 const payload={ok:true,features,counts,source:'NOAA Aviation Weather Center',
  checkedUtc:new Date().toISOString(),
  notice:'Cartografía parcial de avisos SIGMET recibidos por NOAA. Los sectores son geometrías de la fuente, no FIR completas. Verificar vigencia, fuente primaria y avisos del SMN; falta de polígonos no significa ausencia de riesgos.'};
 cache={payload,until:Date.now()+CACHE_MS};
 return send(res,200,payload);
}
module.exports=handler;
module.exports._test={boundsOf,overlapsArgentina,parseTime,altitudeText,normalizeRow};
