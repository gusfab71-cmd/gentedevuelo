/* AeroMeteo · SIGMET internacionales con geometrías verificables. Solo lectura.
 * Fuente: NOAA Aviation Weather Center. Sin CORS de AWC: proxy con caché.
 * No se dibujan advertencias sin tiempo de validez o geometría confiables.
 */
'use strict';
const SOURCE='https://aviationweather.gov/api/data/isigmet?format=geojson&bbox=-56,-76,-21,-52';
const TTL=10*60*1000,MAX_BYTES=850000;
const BOUNDS={minLat:-56,maxLat:-21,minLon:-76,maxLon:-52};
let cache=null,pending=null,lastCall=0;
const HAZARDS={
 storms:/\b(?:TS|TSGR|EMBD\s*TS|FRQ\s*TS|SQL\s*TS|THUNDERSTORM(?:S)?)\b/i,
 turbulence:/\b(?:SEV\s+TURB|TURBULENCE|TURB)\b/i,
 icing:/\b(?:ICE|ICING|SEV\s+ICE)\b/i,
 ash:/\b(?:VA|VOLCANIC\s+ASH)\b/i
};
function parseTime(input){
 if(typeof input==='number'&&Number.isFinite(input)){
  const millis=input<20000000000?input*1000:input;
  return Number.isFinite(millis)?new Date(millis).toISOString():null;
 }
 if(typeof input!=='string'||!input.trim())return null;
 const m=Date.parse(input);
 return Number.isFinite(m)?new Date(m).toISOString():null;
}
function hazardOf(props){
 // El fenómeno estructurado tiene prioridad. El texto libre puede mencionar
 // otros peligros sin que formen parte de este SIGMET.
 const explicit=[props.hazard,props.hazardType,props.phenom,props.phenomenon,props.hazard_code]
  .find(x=>typeof x==='string'&&x.trim());
 const raw=[props.rawSigmet,props.rawText,props.raw,props.text]
  .find(x=>typeof x==='string'&&x.trim());
 const hazard=(explicit||raw||'').slice(0,4000);
 return Object.keys(HAZARDS).find(key=>HAZARDS[key].test(hazard))||null;
}
function inRegion([lon,lat]){
 return lon>=BOUNDS.minLon&&lon<=BOUNDS.maxLon&&lat>=BOUNDS.minLat&&lat<=BOUNDS.maxLat;
}
function normalizeGeometry(geom){
 if(!geom||!['Polygon','MultiPolygon'].includes(geom.type))return null;
 const parts=geom.type==='Polygon'?[geom.coordinates]:geom.coordinates;
 if(!Array.isArray(parts)||parts.length>30)return null;
 let hasPoint=false,total=0;
 let minLat=90,maxLat=-90,minLon=180,maxLon=-180;
 const clean=[];
 for(const polygon of parts){
  if(!Array.isArray(polygon)||!polygon.length||polygon.length>12)return null;
  const rings=[];
  for(const ring of polygon){
   if(!Array.isArray(ring)||ring.length<4||ring.length>800)return null;
   const coords=[];
   for(const pair of ring){
    if(!Array.isArray(pair)||pair.length<2)return null;
    const lon=pair[0],lat=pair[1];
    if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)return null;
    minLon=Math.min(minLon,lon);maxLon=Math.max(maxLon,lon);
    minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);
    coords.push([lon,lat]);hasPoint=true;if(++total>3500)return null;
   }
   // Ensure GeoJSON closed ring; source may omit closure.
   if(coords[0][0]!==coords.at(-1)[0]||coords[0][1]!==coords.at(-1)[1])coords.push([...coords[0]]);
   rings.push(coords);
  }
  clean.push(rings);
 }
 // Un polígono puede cruzar Argentina sin tener vértices dentro del país.
 // La intersección de cajas evita descartarlo; Leaflet conserva el contorno real.
 const intersectsRegion=minLon<=BOUNDS.maxLon&&maxLon>=BOUNDS.minLon&&
  minLat<=BOUNDS.maxLat&&maxLat>=BOUNDS.minLat;
 if(!hasPoint||!intersectsRegion)return null;
 return geom.type==='Polygon'?{type:'Polygon',coordinates:clean[0]}:
  {type:'MultiPolygon',coordinates:clean};
}
function normalizeAwcGeojson(input,now=Date.now()){
 if(!input||input.type!=='FeatureCollection'||!Array.isArray(input.features))
  throw Error('Formato SIGMET no reconocido');
 const features=[],stats={missingValidity:0,unsupportedGeometry:0};
 for(const feature of input.features.slice(0,400)){
  const p=feature?.properties||{};
  const kind=hazardOf(p);
  if(!kind)continue;
  const validFrom=parseTime(p.validTimeFrom||p.validFrom||p.validStart||p.startTime||p.valid_from);
  const validTo=parseTime(p.validTimeTo||p.validTo||p.validEnd||p.endTime||p.valid_to);
  if(!validFrom||!validTo){stats.missingValidity++;continue;}
  if(Date.parse(validFrom)>now||Date.parse(validTo)<=now)continue;
  const geometry=normalizeGeometry(feature.geometry);
  if(!geometry){stats.unsupportedGeometry++;continue;}
  const raw=[p.rawSigmet,p.raw_sigmet,p.rawText,p.raw,p.text].find(x=>typeof x==='string'&&x.trim())||'';
  const label={storms:'Tormentas',turbulence:'Turbulencia',icing:'Engelamiento',ash:'Ceniza volcánica'}[kind];
  features.push({
   type:'Feature',geometry,properties:{
    kind,label,validFrom,validTo,
    fir:String(p.firId||p.fir_id||p.fir||p.icaoId||'').slice(0,32),
    raw:raw.trim().slice(0,1500)
   }
  });
  if(features.length>=75)break;
 }
 return {type:'FeatureCollection',features,stats};
}
function send(res,status,body){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control',status===200?'public, s-maxage=600, stale-while-revalidate=120':'no-store');
 return res.status(status).json(body);
}
async function load(){
 const response=await fetch(SOURCE,{
  headers:{Accept:'application/geo+json, application/json','User-Agent':'GenteDeVuelo-AeroMeteo/1.0 (+https://gentedevuelo.com)'},
  signal:AbortSignal.timeout(11000)
 });
 if(response.status===204)return {type:'FeatureCollection',features:[]};
 if(!response.ok)throw Error('No se pudo obtener SIGMET de AWC');
 if(Number(response.headers.get('content-length')||0)>MAX_BYTES)throw Error('Exceso de datos SIGMET');
 const body=await response.text();
 if(body.length>MAX_BYTES)throw Error('Exceso de datos SIGMET');
 return JSON.parse(body);
}
async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{ok:false,error:'Solo GET'});
 const now=Date.now();
 if(cache&&now-cache.at<TTL)return send(res,200,cache.payload);
 if(!pending){
  if(now-lastCall<15000)return send(res,429,{ok:false,error:'Reintentá en unos segundos'});
  lastCall=now;
  pending=load().then(data=>{
   const normalized=normalizeAwcGeojson(data);
   const payload={ok:true,source:'NOAA Aviation Weather Center · SIGMET internacionales',
    checkedAt:new Date().toISOString(),...normalized};
   cache={at:Date.now(),payload};
   return payload;
  }).finally(()=>{pending=null});
 }
 try{return send(res,200,await pending)}
 catch(_){return send(res,502,{ok:false,error:'Servicio SIGMET temporalmente no disponible'})}
}
module.exports=handler;
module.exports._test={parseTime,hazardOf,normalizeGeometry,normalizeAwcGeojson,BOUNDS,SOURCE};
