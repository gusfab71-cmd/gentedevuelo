/* AeroLocator · OurAirports radio navigation aids (Argentina), review-only.
 * No confirmation of operation, frequencies or applicability to flight.
 * Source is public-domain community data; AIP/NOTAM remain authoritative.
 */
'use strict';
const SOURCE='https://davidmegginson.github.io/ourairports-data/navaids.csv';
const TYPES=new Set(['NDB','NDB-DME','VOR','VOR-DME','DME','VORTAC','TACAN']);
const TTL=6*60*60*1000;
let cache=null,loading=null;
function safe(value,max=120){
 return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
}
function csvRows(input,visit){
 if(typeof input!=='string'||input.length>8000000)throw Error('El CSV supera el límite permitido');
 let row=[],field='',quoted=false;
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(quoted){
   if(c==='"'&&input[i+1]==='"'){field+='"';i++}
   else if(c==='"')quoted=false;
   else field+=c;
  }else if(c==='"'&&field==='')quoted=true;
  else if(c===','){row.push(field);field=''}
  else if(c==='\n'||c==='\r'){
   row.push(field);field='';
   if(row.some(Boolean))visit(row);
   row=[];
   if(c==='\r'&&input[i+1]==='\n')i++;
  }else field+=c;
 }
 if(quoted)throw Error('CSV mal formado: comillas sin cerrar');
 if(row.length||field){row.push(field);visit(row)}
}
function parseNavaids(input){
 const records=[];let columns=null;
 csvRows(input,row=>{
  if(!columns){
   columns=row.map(x=>safe(x,70).replace(/^\ufeff/,''));
   for(const required of ['id','ident','type','iso_country','latitude_deg','longitude_deg'])
    if(!columns.includes(required))throw Error('Formato de OurAirports incompatible: '+required);
   return;
  }
  const r=Object.create(null);
  columns.forEach((key,index)=>{r[key]=row[index]??''});
  if(r.iso_country!=='AR'||!TYPES.has(r.type))return;
  const lat=Number(r.latitude_deg),lon=Number(r.longitude_deg),id=Number(r.id);
  if(!Number.isSafeInteger(id)||id<1||!String(r.latitude_deg).trim()||
     !String(r.longitude_deg).trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||
     Math.abs(lat)>90||Math.abs(lon)>180)return;
  const raw=Number(r.frequency_khz),dmeRaw=Number(r.dme_frequency_khz);
  const ndb=r.type.startsWith('NDB');
  const freq=Number.isFinite(raw)&&raw>0? (ndb?raw:raw/1000):null;
  const dmeFreq=Number.isFinite(dmeRaw)&&dmeRaw>0?dmeRaw/1000:null;
  records.push({
   id,ident:safe(r.ident,8).toUpperCase(),name:safe(r.name,120),
   type:r.type,lat,lon,frequency:freq,unit:ndb?'kHz':'MHz',
   dmeChannel:safe(r.dme_channel,12),dmePairMHz:dmeFreq,
   airport:safe(r.associated_airport,20),source:'OurAirports',
   verification:'pending',operationalStatus:'unknown'
  });
 });
 records.sort((a,b)=>a.type.localeCompare(b.type)||a.ident.localeCompare(b.ident)||a.id-b.id);
 return records;
}
async function fetchCatalog(){
 const response=await fetch(SOURCE,{
  headers:{Accept:'text/csv,text/plain','User-Agent':'GenteDeVuelo-AeroLocator/1.0'},
  signal:AbortSignal.timeout(19000)
 });
 if(!response.ok)throw Error('Fuente externa HTTP '+response.status);
 const size=Number(response.headers.get('content-length')||0);
 if(size>8000000)throw Error('El archivo excede el máximo permitido');
 const text=await response.text();
 const records=parseNavaids(text);
 if(!records.length)throw Error('No se recibieron radioayudas argentinas válidas');
 return {ok:true,source:'OurAirports',sourceUrl:SOURCE,checkedAt:new Date().toISOString(),
  counts:{total:records.length,ndb:records.filter(r=>r.type.startsWith('NDB')).length,
   vor:records.filter(r=>r.type.includes('VOR')||r.type==='VORTAC').length,
   dme:records.filter(r=>r.type.includes('DME')||r.type==='VORTAC'||r.type==='TACAN').length},
  warning:'Datos comunitarios sin verificación operativa. Comprobar AIP Argentina vigente, NOTAM, cartas y condiciones de servicio antes de cada vuelo.',
  records};
}
function send(res,status,payload){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control',status===200?'public, s-maxage=21600, stale-while-revalidate=3600':'no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 return res.status(status).json(payload);
}
async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{ok:false,error:'Solo GET'});
 if(cache&&Date.now()<cache.until)return send(res,200,cache.data);
 if(!loading)loading=fetchCatalog().then(data=>{
  cache={data,until:Date.now()+TTL};return data;
 }).finally(()=>{loading=null});
 try{return send(res,200,await loading)}
 catch(_){if(cache)return send(res,200,{...cache.data,stale:true,
  warning:'Datos en caché; fuente no disponible. No usar para navegación.'});
  return send(res,503,{ok:false,error:'Fuente de radioayudas temporalmente no disponible'});}
}
module.exports=handler;
module.exports._test={csvRows,parseNavaids};
