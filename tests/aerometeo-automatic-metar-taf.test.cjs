'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const api=require('../api/aerometeo-aviation-weather.js');
const app=fs.readFileSync(path.join(base,'assets/aerometeo-app.js'),'utf8');
const html=fs.readFileSync(path.join(base,'utilidades/aerometeo.html'),'utf8');
const css=fs.readFileSync(path.join(base,'assets/aerometeo.css'),'utf8');
const catalog=require('../assets/aerometeo-airports-provinces.json');

test('Los 46 aeropuertos tienen OACI y las consultas son por selección, no masivas',()=>{
 assert.equal(catalog.records.length,46);
 for(const p of catalog.records)assert.match(p.icao,/^SA[A-Z]{2}$/);
 assert.match(app,/marker\.on\('click'/);
 assert.match(app,/void forecast\?\.showAt\(place\)/);
 assert.match(app,/void loadMetarObservation\(point\)/);
 assert.match(app,/void loadTafObservation\(point\)/);
 assert.match(app,/if\(\/\^SA\[A-Z\]\{2\}\$\/\.test\(point\.icao\|\|''\)\)/);
 assert.doesNotMatch(app,/for\s*\(const\s+place\s+of\s+catalogAirports\)\s*\{?\s*void\s+load/);
 assert.doesNotMatch(app,/map\.on\('moveend'/);
});

test('Cada tarjeta tiene estado, emisión y mensaje original independiente',()=>{
 for(const type of ['metar','taf']){
  for(const suffix of ['badge','status','date','raw']){
   assert.match(html,new RegExp('id="am-auto-'+type+'-'+suffix+'"'));
  }
 }
 assert.match(html,/id="am-auto-taf-validity"/);
 assert.match(html,/id="am-automatic-products"/);
 assert.match(html,/Pronóstico numérico por ubicación · Open-Meteo/);
 assert.match(html,/Aviation Weather Center/);
 assert.match(css,/\.am-auto-flight-strip/);
 assert.match(css,/\.am-automatic-product pre/);
 assert.match(app,/showAutomaticReport\('metar'/);
 assert.match(app,/showAutomaticReport\('taf'/);
});

test('Una selección sin ICAO no usa METAR ni TAF de aeropuertos vecinos',()=>{
 assert.match(app,/resetAutomaticReports\(point\)/);
 assert.match(app,/Punto sin código OACI asociado: no se consulta un METAR ni TAF de otro aeródromo/);
 assert.match(app,/tafRequest\+\+; \/\/ Invalida cualquier TAF anterior/);
 assert.match(app,/observationRequest\+\+;/);
 assert.match(app,/id!==tafRequest\|\|selectedPoint\?\.icao!==icao/);
 assert.match(app,/id!==observationRequest\|\|selectedPoint\?\.icao!==icao/);
 assert.match(app,/showTab\('forecast'\)/);
});

test('La fecha y vigencia de TAF se leen de AWC y no se infieren de la emisión',()=>{
 const now=Date.parse('2026-11-07T20:00:00Z');
 const rec={
  icaoId:'SAEZ',rawTAF:'TAF SAEZ 071800Z 0718/0818 18010KT 9999 FEW030',
  issueTime:'2026-11-07T18:00:00Z',
  validTimeFrom:'2026-11-07T18:00:00Z',validTimeTo:'2026-11-08T18:00:00Z'
 };
 const active=api._test.normalizeAwc([rec],'taf','SAEZ',now);
 assert.equal(active.found,true);
 assert.equal(active.stale,false);
 assert.equal(active.validNow,true);
 assert.equal(active.validFrom,new Date(rec.validTimeFrom).toISOString());
 assert.equal(active.validTo,new Date(rec.validTimeTo).toISOString());
 const future=api._test.normalizeAwc([{...rec,validTimeFrom:'2026-11-08T00:00:00Z'}],'taf','SAEZ',now);
 assert.equal(future.validNow,false);
 const old=api._test.normalizeAwc([rec],'taf','SAEZ',Date.parse('2026-11-09T01:00:00Z'));
 assert.equal(old.validNow,false);
 assert.equal(old.stale,true);
 const noPeriod=api._test.normalizeAwc([{icaoId:'SAEZ',rawTAF:rec.rawTAF,issueTime:rec.issueTime}],
  'taf','SAEZ',now);
 assert.equal(noPeriod.validNow,null);
 assert.equal(noPeriod.validFrom,null);
 assert.equal(noPeriod.validTo,null);
 assert.doesNotMatch(app,/vigente\s*:\s*true/);
});

test('No sustituye observaciones ni afirma TAF vigente sin período',()=>{
 assert.match(app,/Período de validez no verificado en la respuesta/);
 assert.match(app,/TAF recibido; validez a verificar/);
 assert.match(app,/data\.validNow===true/);
 assert.match(app,/No se reemplaza por pronósticos/);
 assert.match(app,/Confirmá vigencia en SMN\/ANAC/);
 assert.match(html,/Los mensajes pueden faltar o estar desactualizados/);
});
