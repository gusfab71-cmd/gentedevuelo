/* AeroMeteo · consulta puntual METAR/TAF de Aviation Weather Center (NWS).
 * Consulta de solo lectura, identificadores argentinos y cuota defensiva.
 * No sustituye informacion oficial de SMN/ANAC ni permite vuelo por sí sola.
 * Fuente y restricciones: https://aviationweather.gov/data/api/
 */
'use strict';
const API='https://aviationweather.gov/api/data';
const TYPE=new Set(['metar','taf']);
const ICAO=/^SA[A-Z]{2}$/;
const cache=new Map();
const pending=new Map();
const calls=[];
const TTL={metar:10*60000,taf:20*60000};
function chooseTime(value){
 if(typeof value==='number'){
  if(!Number.isFinite(value)||value<0)return null;
  const epoch=value<2e10?value*1000:value;
  const time=new Date(epoch);
  return Number.isFinite(time.getTime())?time.toISOString():null;
 }
 if(typeof value!=='string')return null;
 const time=new Date(value);
 return Number.isFinite(time.getTime())?time.toISOString():null;
}
function normalizeAwc(data,type,icao,now=Date.now()){
 if(!Array.isArray(data)||!data.length)return {
  found:false,raw:null,issuedAt:null,ageMinutes:null,stale:true,
  note:'No se encontró un mensaje para ese aeródromo.'
 };
 const record=data.find(x=>{
  const station=String(x?.icaoId||x?.stationId||x?.id||'').toUpperCase();
  return station===icao;
 });
 if(!record)return {
  found:false,raw:null,issuedAt:null,ageMinutes:null,stale:true,
  note:'El servicio no devolvió un mensaje correspondiente al aeródromo consultado.'
 };
 const raw=type==='metar'?(record.rawOb||record.rawMETAR||record.rawText):
  (record.rawTAF||record.rawText);
 if(typeof raw!=='string'||!raw.trim())return {
  found:false,raw:null,issuedAt:null,ageMinutes:null,stale:true,
  note:'La fuente no entregó el texto original.'
 };
 const message=raw.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,' ').trim().slice(0,2600);
 if(!new RegExp('^(?:METAR\\s+|SPECI\\s+|TAF(?:\\s+AMD|\\s+COR)?\\s+)?'+icao+'\\b').test(message))
  return {found:false,raw:null,issuedAt:null,ageMinutes:null,stale:true,note:'El mensaje no coincide con el aeródromo solicitado.'};
 const issuedAt=chooseTime(type==='metar'?(record.obsTime||record.reportTime):
  (record.issueTime||record.reportTime||record.validTimeFrom));
 const ageMinutes=issuedAt?Math.floor((now-Date.parse(issuedAt))/60000):null;
 const stale=ageMinutes===null||ageMinutes< -15||(type==='metar'?ageMinutes>180:ageMinutes>1440);
 return {
  found:true,raw:message,issuedAt,ageMinutes,stale,
  note:stale?'Fecha de emisión ausente o posiblemente desactualizada. Revisar producto en SMN y fuente original.':
   'Mensaje aeronáutico obtenido del Aviation Weather Center; verificar vigencia y producto original.'
 };
}
function send(res,code,body){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control',code===200?'public, s-maxage=600, stale-while-revalidate=180':'no-store');
 return res.status(code).json(body);
}
async function fetchOne(type,icao){
 const url=API+'/'+type+'?'+new URLSearchParams({ids:icao,format:'json'});
 const response=await fetch(url,{
  headers:{Accept:'application/json','User-Agent':'GenteDeVuelo-AeroMeteo/1.0 (+https://gentedevuelo.com)'},
  signal:AbortSignal.timeout(11000)
 });
 if(response.status===204)return [];
 if(!response.ok)throw Error('Servicio externo no disponible');
 if(Number(response.headers.get('content-length')||0)>120000)throw Error('Exceso de datos');
 const body=await response.text();
 if(body.length>120000)throw Error('Exceso de datos');
 const json=JSON.parse(body);
 if(!Array.isArray(json))throw Error('Formato del servicio no reconocido');
 return json;
}
async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{ok:false,error:'Solo GET'});
 const icao=typeof req.query?.icao==='string'?req.query.icao.trim().toUpperCase():'';
 const type=typeof req.query?.type==='string'?req.query.type.toLowerCase():'';
 if(!ICAO.test(icao)||!TYPE.has(type))
  return send(res,400,{ok:false,error:'Ingresá un código OACI argentino válido (SAxx) y METAR o TAF'});
 const key=type+':'+icao,now=Date.now(),prior=cache.get(key);
 if(prior&&now-prior.at<TTL[type])return send(res,200,prior.payload);
 if(!pending.has(key)){
  while(calls.length&&calls[0]<now-60000)calls.shift();
  if(calls.length>=30)return send(res,429,{ok:false,error:'Demasiadas consultas. Probá más tarde.'});
  calls.push(now);
  pending.set(key,fetchOne(type,icao).then(rows=>{
   const detail=normalizeAwc(rows,type,icao);
   const payload={ok:true,type,icao,source:'Aviation Weather Center (NOAA/NWS)',
    sourceUrl:'https://aviationweather.gov/data/api/',
    smnUrl:type==='metar'?'https://ws2.smn.gob.ar/metar':'https://ws2.smn.gob.ar/taf',
    checkedAt:new Date().toISOString(),...detail};
   if(cache.size>=150)cache.delete(cache.keys().next().value);
   cache.set(key,{at:Date.now(),payload});
   return payload;
  }).finally(()=>pending.delete(key)));
 }
 try{return send(res,200,await pending.get(key))}
 catch(_){return send(res,502,{ok:false,error:'No se pudo consultar el servicio aeronáutico internacional'})}
}
module.exports=handler;
module.exports._test={chooseTime,normalizeAwc,ICAO,TYPE};
