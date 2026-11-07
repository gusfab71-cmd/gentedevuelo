'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const airports=require('../assets/aerometeo-airports-provinces.json');
const originals=require('../assets/aerolocator-ourairports-ar.json');
const app=fs.readFileSync(path.join(base,'assets/aerometeo-app.js'),'utf8');
const html=fs.readFileSync(path.join(base,'utilidades/aerometeo.html'),'utf8');
const css=fs.readFileSync(path.join(base,'assets/aerometeo.css'),'utf8');

test('46 aeropuertos en 23 provincias y CABA, sin duplicados, y uno principal por jurisdicción',()=>{
 assert.equal(airports.schema,'aerometeo-airports-provinces-v1');
 assert.equal(airports.jurisdictions,24);
 assert.equal(airports.primaryCount,24);
 assert.equal(airports.count,46);
 assert.equal(airports.records.length,46);
 const provinces=new Set(airports.records.map(x=>x.province));
 assert.equal(provinces.size,24);
 assert.ok(provinces.has('Ciudad Autónoma de Buenos Aires'));
 const codes=airports.records.map(x=>x.icao);
 assert.equal(new Set(codes).size,46);
 for(const province of provinces){
  const places=airports.records.filter(x=>x.province===province);
  assert.equal(places.filter(x=>x.primary).length,1,province);
 }
});

test('Coordenadas y provincias coinciden con fuente local OurAirports',()=>{
 for(const place of airports.records){
  assert.match(place.icao,/^SA[A-Z]{2}$/);
  assert.ok(Number.isFinite(place.lat)&&place.lat>=-56&&place.lat<=-21,place.icao);
  assert.ok(Number.isFinite(place.lon)&&place.lon>=-75&&place.lon<=-52,place.icao);
  assert.ok(typeof place.label==='string'&&place.label.length>=3,place.icao);
  const source=originals.records.find(x=>x.icao===place.icao||x.ident===place.icao);
  assert.ok(source,'Sin fuente '+place.icao);
  assert.equal(source.closed,false,'Aeropuerto cerrado '+place.icao);
  assert.equal(source.region,place.region,place.icao);
  assert.ok(Math.abs(source.lat-place.lat)<.000001,place.icao);
  assert.ok(Math.abs(source.lon-place.lon)<.000001,place.icao);
 }
});

test('Panel provincial, fuente y acceso por OACI preservados',()=>{
 assert.match(html,/id="aerometeo-province"/);
 assert.match(html,/id="am-airports-status"/);
 assert.match(html,/aerometeo-airports-provinces\.json|provincias/);
 assert.match(html,/OurAirports/);
 assert.match(app,/aerometeo-airports-provinces\.json/);
 assert.match(app,/L\.latLngBounds/);
 assert.match(app,/airportPlaces\[locations\.value\]/);
 assert.match(app,/void loadMetarObservation\(point\)/);
 assert.match(app,/void loadTafObservation\(point\)/);
 assert.match(app,/forecast\?\.showAt\(place\)/);
 assert.match(app,/map\.on\('zoomend',refreshAirportMarkers\)/);
 assert.match(app,/const visible=zoom>=7\?points:points\.filter\(p=>p\.primary!==false\)/);
 assert.match(css,/\.am-airport-compact/);
 assert.doesNotMatch(html,/Estaciones 3D-PAWS/);
 assert.doesNotMatch(app,/GDV_WEATHER_STATIONS/);
});

test('La selección regional no solicita pronósticos masivos',()=>{
 assert.match(app,/void loadProvincialAirports\(\)/);
 assert.match(app,/fetch\('\.\.\/assets\/aerometeo-airports-provinces\.json'/);
 assert.doesNotMatch(app,/for\s*\(const place of catalogAirports\)\s*forecast/);
 assert.match(app,/marker\.on\('click'/);
});
