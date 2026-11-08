/* Comprobación en vivo NO operativa: verifica accesibilidad/contrato de proveedores.
 * Corre bajo demanda o al cambiar las fuentes, nunca entrega información de vuelo.
 * No llama a Vercel, Supabase ni usa secretos.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {normalizeAwcGeojson}=require('../api/aerometeo-sigmet.js')._test;

const urls={
 openMeteo:'https://api.open-meteo.com/v1/forecast?latitude=-34.82&longitude=-58.53&hourly=weather_code%2Cvisibility&forecast_hours=8&timezone=UTC',
 awc:'https://aviationweather.gov/api/data/isigmet?format=geojson&bbox=-56,-76,-21,-52'
};
async function query(source,url){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(url,{
   signal:controller.signal,
   headers:{Accept:'application/json,application/geo+json',
    'User-Agent':'GenteDeVuelo-AeroMeteo-ContractTest/1.0 (+https://gentedevuelo.com)'}
  });
  console.log(source+': HTTP '+response.status);
  assert.ok(response.ok||source==='AWC'&&response.status===204,
   source+' API no responde correctamente (HTTP '+response.status+')');
  if(response.status===204)return null;
  const body=await response.text();
  assert.ok(body.length<1000000,source+': respuesta demasiado grande');
  return JSON.parse(body);
 }finally{clearTimeout(timer)}
}
try{
 const forecast=await query('Open-Meteo',urls.openMeteo);
 assert.ok(forecast&&forecast.utc_offset_seconds===0,'Open-Meteo debe responder en UTC');
 assert.ok(Array.isArray(forecast.hourly?.time)&&forecast.hourly.time.length,
  'Open-Meteo no devuelve horas');
 assert.ok(Array.isArray(forecast.hourly?.weather_code)&&
  forecast.hourly.weather_code.length===forecast.hourly.time.length,
  'Open-Meteo no devuelve códigos WMO completos');
 assert.ok(Array.isArray(forecast.hourly?.visibility)&&
  forecast.hourly.visibility.length===forecast.hourly.time.length,
  'Open-Meteo no devuelve visibilidad horaria completa');
 console.log('Open-Meteo: horarios='+forecast.hourly.time.length+
  ', muestra meteorológica='+forecast.hourly.time[0]+
  ' (no son observaciones).');
 const sigmets=await query('AWC',urls.awc);
 if(sigmets===null){
  console.log('AWC: 204 significa respuesta válida sin SIGMET disponible.');
 }else{
  assert.equal(sigmets.type,'FeatureCollection','AWC no devolvió GeoJSON FeatureCollection');
  assert.ok(Array.isArray(sigmets.features),'AWC no devuelve lista de geometrías');
  console.log('AWC: '+sigmets.features.length+' avisos GeoJSON en respuesta.');
  if(sigmets.features.length){
   const p=sigmets.features[0]?.properties||{};
   console.log('AWC: campos del primer aviso: '+Object.keys(p).sort().slice(0,36).join(', '));
   console.log('AWC: geometría: '+(sigmets.features[0].geometry?.type||'sin geometría'));
   const normalized=normalizeAwcGeojson(sigmets);
   assert.equal(normalized.type,'FeatureCollection','El normalizador debe conservar GeoJSON');
   console.log('AeroMeteo: SIGMET vigentes representables en la región: '+normalized.features.length);
   console.log('AeroMeteo: descartados sin fecha='+normalized.stats.missingValidity+
    ', sin polígono regional compatible='+normalized.stats.unsupportedGeometry);
   console.log('AeroMeteo: 0 zonas puede ser normal si no hay avisos vigentes en Argentina.');
  }else console.log('AWC: no hubo polígonos; no se valida la representación visual.');
 }
 console.log('CONTRATO PROVEEDORES: OK. No es una validación operativa aeronáutica.');
}catch(error){
 console.error('CONTRATO PROVEEDORES: FALLO — '+error.message);
 process.exitCode=1;
}
