'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const server=require('../api/aerometeo-sigmet.js')._test;
const point=require('../api/aerometeo-phenomena-point.js')._test;
const ui=require('../assets/aerometeo-phenomena.js');
const html=fs.readFileSync(path.join(base,'utilidades/aerometeo.html'),'utf8');
const app=fs.readFileSync(path.join(base,'assets/aerometeo-app.js'),'utf8');
const css=fs.readFileSync(path.join(base,'assets/aerometeo.css'),'utf8');
const now=Date.parse('2026-11-08T00:00:00Z');
const area={type:'Polygon',coordinates:[[
 [-60,-32],[-59,-32],[-59,-31],[-60,-31],[-60,-32]
]]};
function feature(phenom,begin='2026-11-07T23:00:00Z',end='2026-11-08T03:00:00Z',geometry=area){
 return {type:'Feature',properties:{phenomenon:phenom,validTimeFrom:begin,validTimeTo:end,rawSigmet:'SIGMET aeronáutico'},
 geometry};
}
test('SIGMET: reconoce solo amenazas explícitas y polígonos válidos de Argentina',()=>{
 const collection={type:'FeatureCollection',features:[
  feature('TS'),feature('SEV TURB'),feature('SEV ICE'),feature('VA'),
  feature('NONE')
 ]};
 const normalized=server.normalizeAwcGeojson(collection,now);
 assert.deepEqual(normalized.features.map(x=>x.properties.kind),['storms','turbulence','icing','ash']);
 assert.equal(normalized.type,'FeatureCollection');
 assert.equal(normalized.features[0].properties.validTo,'2026-11-08T03:00:00.000Z');
 assert.equal(normalized.features[0].geometry.type,'Polygon');
 assert.match(server.SOURCE,/isigmet\?format=geojson&bbox=/);
});
test('No presenta como SIGMET vigente un aviso vencido, futuro, sin fecha o sin geometría',()=>{
 const bad={type:'FeatureCollection',features:[
  feature('TS','2026-11-07T18:00:00Z','2026-11-07T22:00:00Z'),
  feature('TURB','2026-11-08T01:00:00Z','2026-11-08T04:00:00Z'),
  feature('ICE',undefined,null),
  feature('VA','2026-11-07T23:00:00Z','2026-11-08T03:00:00Z',null),
  feature('TS','2026-11-07T23:00:00Z','2026-11-08T03:00:00Z',
   {type:'Polygon',coordinates:[[[-90,-10],[-89,-10],[-89,-9],[-90,-9],[-90,-10]]]})
 ]};
 bad.features[2].properties.validTimeFrom=null;
 bad.features[2].properties.validTimeTo=null;
 const out=server.normalizeAwcGeojson(bad,now);
 assert.equal(out.features.length,0);
 assert.ok(out.stats.missingValidity>=1);
 assert.ok(out.stats.unsupportedGeometry>=1);
 assert.throws(()=>server.normalizeAwcGeojson({type:'FeatureCollection',features:undefined},now));
});
test('Fenómenos puntuales: solo estimación WMO, sin crear zonas de niebla',()=>{
 const raw=(code,vis)=>({utc_offset_seconds:0,hourly:{
   time:['2026-11-08T00:00'],weather_code:[code],visibility:[vis]
 }});
 const location={lat:-34.8,lon:-58.5};
 const storm=point.normalize(raw(95,11000),location,now);
 assert.equal(storm.storm,true);assert.equal(storm.fog,false);
 const fog=point.normalize(raw(45,700),location,now);
 assert.equal(fog.fog,true);assert.equal(fog.lowVisibility,true);
 assert.throws(()=>point.normalize(raw(null,null),location,now),/No hay pronóstico puntual cercano/);
 assert.equal(point.coordinate('-34.800000',-56,-21),-34.8);
 assert.equal(point.coordinate('-99.99',-56,-21),null);
 assert.match(point.urlFor(-34.8,-58.5),/weather_code%2Cvisibility/);
});
test('Fenómenos: panel plegable, capas independientes y consultas bajo demanda',()=>{
 for(const id of ['am-phenomena-toggle','am-phenomena-panel','am-phenomena-status',
  'am-phenomena-refresh','am-phenomena-pick','am-phenomena-point-result'])
  assert.match(html,new RegExp('id="'+id+'"'));
 const a=html.indexOf('id="am-radar-panel"');
 const b=html.indexOf('id="am-phenomena-toggle"');
 const c=html.indexOf('class="am-map-section"');
 assert.ok(a>=0&&b>a&&c>b,'Fenómenos se ubica debajo del radar, en la izquierda');
 assert.match(html,/id="am-phenomena-panel"[^>]*hidden/);
 for(const kind of ['storms','fog','turbulence','icing','ash'])
  assert.match(html,new RegExp('data-phenomenon="'+kind+'"'));
 assert.match(html,/aerometeo-phenomena\.js/);
 assert.match(app,/GDV_AEROMETEO_PHENOMENA\?\.boot\(\{map,L\}\)/);
 assert.match(app,/phenomena\?\.inspectPoint\?\.\(place\)/);
 assert.match(css,/\.am-sidebar \.am-phenomena-panel\{/);
 assert.match(css,/\.am-sidebar \.am-phenomena-panel\[hidden\]/);
 assert.match(html,/aerometeo\.css\?v=20261108phenomena1/);
 assert.equal(ui.validPoint({lat:-34.8,lon:-58.5}),true);
 assert.equal(ui.validPoint({lat:47,lon:10}),false);
});
test('Fuente oficial separada de las estimaciones y sin afirmaciones operativas',()=>{
 assert.match(html,/SIGMET son avisos aeronáuticos/);
 assert.match(html,/estimaciones puntuales/);
 assert.match(html,/no implica tiempo seguro/i);
 assert.match(html,/Confirmá SMN, PRONAREA y SIGMET oficiales/);
 assert.doesNotMatch(app,/for\s*\(const\s+airport.*fetch\(/);
});
