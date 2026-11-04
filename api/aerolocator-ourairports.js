/* AeroLocator · Catálogo de aeropuertos, pistas y helipuertos de Argentina.
 * Fuente: OurAirports, datos de dominio público, mantenidos por la comunidad.
 * NO acredita habilitación operacional ni sustituye AIP, MADHEL, ANAC o NOTAM.
 * Solo incluye registros de Argentina (iso_country = AR); datos originales intactos.
 */
'use strict';
const COUNTRY_URL='https://ourairports.com/countries/AR/airports.csv';
const AIRPORTS_URL='https://davidmegginson.github.io/ourairports-data/airports.csv';
const RUNWAYS_URL='https://davidmegginson.github.io/ourairports-data/runways.csv';
const FREQUENCIES_URL='https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv';
const CACHE_MS=6*60*60*1000;
let cache=null,loading=null;
function csvRows(text,visit){
 if(typeof text!=='string'||text.length>18000000)throw Error('Archivo CSV demasiado grande o inválido');
 let row=[],field='',quoted=false,skipStart=true;
 for(let i=0;i<text.length;i++){
  let ch=text[i];
  if(skipStart){skipStart=false;if(ch==='\ufeff')continue}
  if(quoted){
   if(ch==='"'){
    if(text[i+1]==='"'){field+='"';i++;}else quoted=false;
   }else field+=ch;
   continue;
  }
  if(ch==='"'&&field===''){quoted=true;continue}
  if(ch===','){row.push(field);field='';continue}
  if(ch==='\n'||ch==='\r'){
   row.push(field);field='';
   if(row.some(x=>x!==''))visit(row);
   row=[];
   if(ch==='\r'&&text[i+1]==='\n')i++;
   continue;
  }
  field+=ch;
 }
 if(quoted)throw Error('CSV sin cierre de comillas');
 if(field!==''||row.length){row.push(field);visit(row)}
}
function readCSV(text,consume){
 let header=null,count=0;
 csvRows(text,row=>{
  if(!header){
   header=row.map(c=>String(c||'').trim().replace(/^\ufeff/,''));
   if(!header.includes('id')||!header.includes('ident'))throw Error('Encabezado CSV incompatible');
   return;
  }
  const record=Object.create(null);
  for(let i=0;i<header.length;i++)record[header[i]]=row[i]??'';
  count++;consume(record);
 });
 return count;
}
function safe(v,max=180){return String(v??'').replace(/[\u0000-\u001F\u007F]/g,' ').trim().slice(0,max)}
function num(v){if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function validCoords(lat,lon){return lat!==null&&lon!==null&&lat>=-90&&lat<=0&&lon>=-85&&lon<=-25}
function airportRow(row){
 if(safe(row.iso_country,3).toUpperCase()!=='AR')return null;
 const id=Number(row.id),lat=num(row.latitude_deg),lon=num(row.longitude_deg);
 if(!Number.isSafeInteger(id)||id<1||!validCoords(lat,lon))return null;
 const ident=safe(row.ident,30),type=safe(row.type,40),name=safe(row.name,160);
 if(!ident||!name)return null;
 const codes={icao:safe(row.icao_code,8),iata:safe(row.iata_code,8),gps:safe(row.gps_code,12),local:safe(row.local_code,20)};
 return {
  id,ident,type,name,lat,lon,region:safe(row.iso_region,24),
  municipality:safe(row.municipality,90),elevationFt:num(row.elevation_ft),
  scheduled:safe(row.scheduled_service,5)==='yes',
  icao:codes.icao,iata:codes.iata,gps:codes.gps,local:codes.local,
  keywords:safe(row.keywords,280),closed:/^closed(?:_airport)?$/i.test(type),
  runways:[],frequencies:[]
 };
}
async function fetchCSV(url,timeout=18000){
 const response=await fetch(url,{
  headers:{'Accept':'text/csv,text/plain;q=0.9,*/*;q=0.5',
   'User-Agent':'GenteDeVuelo-AeroLocator/1.0 (aviation-geodata-review; gentedevuelo.com)'},
  signal:AbortSignal.timeout(timeout),
  redirect:'follow'
 });
 if(!response.ok)throw Error('HTTP '+response.status+' al descargar catálogo');
 const len=Number(response.headers.get('content-length')||0);
 if(len>18000000)throw Error('Archivo externo demasiado grande');
 return response.text();
}
function normalizeRunway(r){
 const id=num(r.id);
 if(id===null)return null;
 return {
  id,ident:[safe(r.le_ident,8),safe(r.he_ident,8)].filter(Boolean).join('/'),
  lengthFt:num(r.length_ft),widthFt:num(r.width_ft),surface:safe(r.surface,42),
  lighted:r.lighted==='1',closed:r.closed==='1',
  ends:[
   {ident:safe(r.le_ident,8),lat:num(r.le_latitude_deg),lon:num(r.le_longitude_deg)},
   {ident:safe(r.he_ident,8),lat:num(r.he_latitude_deg),lon:num(r.he_longitude_deg)}
  ]
 };
}
function normalizeFrequency(r){
 const mhz=num(r.frequency_mhz);
 if(mhz!==null&&(mhz<1||mhz>1000))return null;
 return {type:safe(r.type,28),description:safe(r.description,100),mhz};
}
function send(res,status,payload){
 res.setHeader('Cache-Control',status===200?'public, max-age=0, s-maxage=21600, stale-while-revalidate=3600':'no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 return res.status(status).json(payload);
}
async function compileCatalog(){
 const start=Date.now(),warnings=[],byId=new Map(),byIdent=new Map();
 let airportFile='OurAirports · Argentina';
 let sourceText;
 try{
  sourceText=await fetchCSV(COUNTRY_URL,14000);
  let n=readCSV(sourceText,r=>{const item=airportRow(r);if(item)byId.set(item.id,item)});
  if(!n||!byId.size)throw Error('Descarga por país sin registros');
 }catch(e){
  warnings.push('Descarga por país no disponible; se utilizó el catálogo mundial filtrado por Argentina.');
  sourceText=await fetchCSV(AIRPORTS_URL,19000);
  byId.clear();readCSV(sourceText,r=>{const item=airportRow(r);if(item)byId.set(item.id,item)});
  airportFile='OurAirports · airports.csv mundial filtrado AR';
 }
 if(!byId.size)throw Error('No se identificaron registros argentinos válidos');
 for(const item of byId.values())byIdent.set(item.ident,item);
 let runwayRows=0,frequencyRows=0;
 const aux=await Promise.allSettled([fetchCSV(RUNWAYS_URL,17000),fetchCSV(FREQUENCIES_URL,17000)]);
 if(aux[0].status==='fulfilled'){
  try{readCSV(aux[0].value,r=>{
   const item=byId.get(num(r.airport_ref))||byIdent.get(safe(r.airport_ident,30));
   if(!item)return;
   const runway=normalizeRunway(r);
   if(runway&&!item.runways.some(x=>x.id===runway.id)){item.runways.push(runway);runwayRows++}
  })}catch(_){warnings.push('No se pudieron interpretar todos los datos de pistas de OurAirports.')}
 }else warnings.push('Superficies y pistas adicionales no disponibles en esta consulta.');
 if(aux[1].status==='fulfilled'){
  try{readCSV(aux[1].value,r=>{
   const item=byId.get(num(r.airport_ref))||byIdent.get(safe(r.airport_ident,30));
   if(!item)return;
   const freq=normalizeFrequency(r);
   if(freq){item.frequencies.push(freq);frequencyRows++}
  })}catch(_){warnings.push('No se pudieron interpretar todas las frecuencias de OurAirports.')}
 }else warnings.push('Frecuencias comunitarias adicionales no disponibles en esta consulta.');
 const records=[...byId.values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));
 const totalClosed=records.filter(x=>x.closed).length;
 const sourceTimestamp=new Date().toISOString();
 return {ok:true,source:'OurAirports · dominio público / datos comunitarios',
  sourceUrl:'https://ourairports.com/data/',
  checkedUtc:sourceTimestamp,downloadType:airportFile,
  counts:{records:records.length,closed:totalClosed,heliports:records.filter(x=>x.type==='heliport').length,
   runways:runwayRows,frequencies:frequencyRows,elapsedMs:Date.now()-start},
  warnings,
  notice:'Catálogo para investigación. No acredita existencia actual, legalidad, servicios, superficie operativa ni combustible. Pistas y frecuencias requieren comprobar AIP/MADHEL/ANAC.',
  records};
}
async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{ok:false,error:'Solo GET'});
 if(cache&&Date.now()<cache.until)return send(res,200,cache.data);
 if(!loading)loading=compileCatalog().then(data=>{
  cache={until:Date.now()+CACHE_MS,data};return data;
 }).finally(()=>{loading=null});
 try{return send(res,200,await loading)}
 catch(e){return send(res,503,{ok:false,error:'No fue posible cargar el catálogo abierto de OurAirports: '+String(e.message||e).slice(0,160)})}
}
module.exports=handler;
module.exports._test={csvRows,readCSV,airportRow,normalizeRunway,normalizeFrequency,validCoords};
