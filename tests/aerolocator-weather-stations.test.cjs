const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const handler=require('../api/aerolocator-weather-stations.js');
const {parseChords,catalog}=handler._test;
const base=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(base,'utilidades/pistas-no-oficiales.html'),'utf8');
const meteoHtml=fs.readFileSync(path.join(base,'utilidades/aerometeo.html'),'utf8');
const meteoApp=fs.readFileSync(path.join(base,'assets/aerometeo-app.js'),'utf8');
const ui=fs.readFileSync(path.join(base,'assets/aerolocator-weather-stations.js'),'utf8');

test('Se catalogan siete ubicaciones argentinas, sin duplicaciones ni posiciones inventadas',()=>{
 assert.equal(catalog.stations.length,7);
 assert.equal(new Set(catalog.stations.map(x=>x.id)).size,7);
 assert.equal(new Set(catalog.stations.map(x=>x.lat+':'+x.lon)).size,7);
 for(const x of catalog.stations){
  assert.ok(Number.isFinite(x.lat)&&x.lat<-20&&x.lat>-56);
  assert.ok(Number.isFinite(x.lon)&&x.lon<-52&&x.lon>-76);
  assert.equal(x.sourceUrl,'https://3d-argentina.icdp.ucar.edu/instruments/'+x.instrumentId);
 }
 assert.equal(catalog.stations.find(x=>x.id==='3dpaws-13')?.name,'Club de Planeadores Cañuelas');
});

test('AeroMeteo retira la capa sin acceso, conservando solo su módulo aislado',()=>{
 assert.doesNotMatch(meteoHtml,/aerolocator-weather-stations\.js\?v=/);
 assert.doesNotMatch(meteoApp,/GDV_WEATHER_STATIONS/);
 assert.doesNotMatch(meteoApp,/onSelected:showStation,onObservation:showObservation/);
 assert.match(ui,/weather-stations-toggle/);
 assert.match(ui,/L\.featureGroup\(\)/);
 assert.match(ui,/Estaciones meteorológicas/);
 assert.match(ui,/Ver todas las estaciones/);
 assert.match(ui,/map\.removeLayer\(layer\)/);
 assert.match(meteoApp,/const map=L\.map\('map'/);
});

test('CHORDS normaliza observación: m/s a kt y UTC a edad sin confundir unidades',()=>{
 const now=Date.parse('2026-11-06T18:00:00Z');
 const x=parseChords({measurements:[{
  at:'2026-11-06T17:52:00Z',ws:6,wg:9,wd:155,st1:24.2,sh1:65,bp1:1015.5
 }]},now);
 assert.equal(x.status,'recent');
 assert.equal(x.ageMinutes,8);
 assert.equal(x.windKt,11.7);
 assert.equal(x.gustKt,17.5);
 assert.equal(x.windDirection,155);
 assert.equal(x.temperatureC,24.2);
 assert.equal(x.humidityPct,65);
 assert.equal(x.pressureHpa,1015.5);
});

test('Un valor antiguo nunca se presenta como reciente',()=>{
 const now=Date.parse('2026-11-06T18:00:00Z');
 const x=parseChords({features:[{properties:{at:'2026-11-06T16:45:00Z',ws:4}}]},now);
 assert.equal(x.status,'stale');
 assert.equal(x.ageMinutes,75);
});

test('Se descartan timestamps futuros, números imposibles y ausencia de medición',()=>{
 const now=Date.parse('2026-11-06T18:00:00Z');
 assert.equal(parseChords([{at:'2026-11-07T19:00:00Z',ws:4}],now),null);
 assert.equal(parseChords([{at:'2026-11-06T17:50:00Z',ws:999,st1:300,bp1:-100}],now),null);
 assert.equal(parseChords([],now),null);
});

test('Se toleran filas CHORDS separadas por variable con igual hora',()=>{
 const now=Date.parse('2026-11-06T18:00:00Z');
 const x=parseChords([
  {at:'2026-11-06T17:50:00Z',short_name:'ws',value:5},
  {at:'2026-11-06T17:50:00Z',short_name:'wg',value:7},
  {at:'2026-11-06T17:45:00Z',short_name:'ws',value:2}
 ],now);
 assert.equal(x.windKt,9.7);assert.equal(x.gustKt,13.6);
});

test('La API bloquea métodos de escritura y estaciones no autorizadas',async()=>{
 const output=()=>({headers:{},code:0,payload:null,setHeader(k,v){this.headers[k]=v},
  status(v){this.code=v;return this},json(v){this.payload=v;return this}});
 const noWrite=output();
 await handler({method:'POST',query:{id:'3dpaws-13'}},noWrite);
 assert.equal(noWrite.code,405);
 const noProxy=output();
 await handler({method:'GET',query:{id:'https://evil.example'}},noProxy);
 assert.equal(noProxy.code,400);
});

test('La interfaz no inventa observaciones y declara claramente que no son METAR',()=>{
 assert.match(ui,/no es METAR oficial/);
 assert.match(ui,/Sin una medición reciente verificable/);
 assert.match(ui,/Consultando la última observación/);
 assert.match(ui,/Desactualizada|DESACTUALIZADA/);
 assert.doesNotMatch(ui,/api\.open-meteo\.com/);
});

test('La estación Cañuelas distingue HTTP 403 de un dato meteorológico faltante',async()=>{
 const prior=global.fetch;
 let requested='';
 global.fetch=async url=>{
  requested=String(url);
  return {ok:false,status:403};
 };
 try{
  const output={code:0,body:null,setHeader(){},status(code){this.code=code;return this},json(data){this.body=data;return this}};
  await handler({method:'GET',query:{id:'3dpaws-13'}},output);
  assert.equal(output.code,200);
  assert.equal(output.body.id,'3dpaws-13');
  assert.equal(output.body.available,false);
  assert.equal(output.body.observation,null);
  assert.equal(output.body.issue,'provider_access_denied');
  assert.match(output.body.note,/denegó la descarga/);
  assert.equal(requested,'https://3d-argentina.icdp.ucar.edu/api/v1/data/13.geojson?last');
 }finally{
  global.fetch=prior;
 }
 assert.match(ui,/data\.issue==='provider_access_denied'/);
 assert.match(meteoApp,/issue==='provider_access_denied'/);
 assert.match(meteoApp,/No se sustituyen lecturas por modelos/);
});
