'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('assets/aerometeo-app.js');
const html=read('utilidades/aerometeo.html');
const css=read('assets/aerometeo.css');
const hourly=require('../assets/aerometeo-hourly-chart.js');

test('Mapa más grande: botón de ampliación, retorno y actualización Leaflet',()=>{
 assert.match(html,/id="aerometeo-expand-map"/);
 assert.match(html,/aria-pressed="false"/);
 assert.match(app,/setExpandedMap\(expanded\)/);
 assert.match(app,/am-map-expanded/);
 assert.match(app,/map\.invalidateSize/);
 assert.match(app,/event\.key==='Escape'/);
 assert.match(css,/\.am-layout\.am-map-expanded>/);
 assert.match(css,/max-width:1400px/);
 assert.match(css,/height:clamp\(560px,76dvh,920px\)/);
 assert.match(css,/leaflet-popup-content/);
 assert.match(css,/overflow:auto/);
});

test('Tarjetas y controles existentes preservados',()=>{
 for(const id of ['aerometeo-toggle-panel','aerometeo-country','am-detail-title',
  'am-source-stations','am-source-forecast','am-source-aviation','aerometeo-forecast-location'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(app,/GDV_WEATHER_STATIONS/);
 assert.match(app,/GDV_OPEN_METEO_FORECAST/);
 assert.doesNotMatch(app,/map\.on\('moveend'/);
 assert.doesNotMatch(app,/map\.on\('zoomend'/);
});

test('Curva utiliza únicamente muestras horarias realmente recibidas',()=>{
 const data={forecast:[
  {time:'2026-11-07T18:00:00Z',windKt:14,cloudPct:62,temperatureC:15,precipitationMm:0.3},
  {time:'2026-11-07T19:00:00Z',windKt:18,cloudPct:null,temperatureC:14,precipitationMm:0.8},
  {time:'2026-11-07T20:00:00Z',windKt:null,cloudPct:75,temperatureC:13,precipitationMm:0}
 ]};
 assert.deepEqual(hourly.series(data,'wind').map(row=>row.value),[14,18,null]);
 assert.deepEqual(hourly.series(data,'temperature').map(row=>row.value),[15,14,13]);
 assert.deepEqual(hourly.series(data,'rain').map(row=>row.value),[.3,.8,0]);
 assert.deepEqual(hourly.series(data,'cloud').map(row=>row.value),[62,null,75]);
 assert.equal(hourly.series(data,'invalid').length,0);
 assert.equal(hourly.series({forecast:[{time:'invalida',windKt:20}]},'wind').length,0);
});

test('Conmutar Viento, Lluvia, Nubes y Temperatura actualiza el gráfico sin fingir capas nacionales',()=>{
 assert.match(app,/GDV_AEROMETEO_HOURLY\?\.render\(hourlyChart,data,lastMetric\)/);
 assert.match(app,/GDV_AEROMETEO_HOURLY\?\.render\(chartTarget,currentForecast,lastMetric\)/);
 assert.match(app,/No existe una capa nacional cargada/);
 assert.match(html,/aerometeo-hourly-chart\.js/);
 assert.match(css,/\.am-hourly-chart svg/);
});

test('El gráfico identifica el modelo y no lo presenta como METAR u observación',()=>{
 const src=read('assets/aerometeo-hourly-chart.js');
 assert.match(src,/MODELO · Open-Meteo/);
 assert.match(src,/no mediciones ni METAR/);
 assert.match(src,/CC BY 4\.0/);
 assert.match(src,/America\/Argentina\/Buenos_Aires/);
});

test('El visualizador produce SVG accesible sin requerir gráficos externos',()=>{
 function dom(tag){
  return {
   tag,attributes:{},children:[],textContent:'',className:'',
   setAttribute(key,value){this.attributes[key]=value},
   append(...children){this.children.push(...children)},
   replaceChildren(...children){this.children=children}
  };
 }
 const previous=global.document;
 global.document={createElement:dom,createElementNS(_ns,tag){return dom(tag)}};
 try{
  const container=dom('section');
  const data={forecast:Array.from({length:6},(_,i)=>({
   time:'2026-11-07T'+String(14+i).padStart(2,'0')+':00:00Z',
   windKt:10+i,cloudPct:20+i*3,temperatureC:18-i,precipitationMm:0.1*i
  }))};
  assert.equal(hourly.render(container,data,'wind'),true);
  assert.ok(container.children.find(node=>node.tag==='svg'),'Debe dibujar SVG');
  const graphic=container.children.find(node=>node.tag==='svg');
  assert.equal(graphic.attributes.role,'img');
  assert.match(graphic.attributes['aria-label'],/Viento/);
  const empty=dom('section');
  assert.equal(hourly.render(empty,{forecast:[]},'rain'),false);
  assert.match(empty.children[1].textContent,/suficientes horarios/);
 }finally{global.document=previous;}
});

test('SMN: enlace institucional alternativo y acceso interno METAR/TAF',()=>{
 assert.match(html,/href="https:\/\/www\.argentina\.gob\.ar\/smn"/);
 assert.match(html,/class="am-official-main"/);
 assert.match(html,/id="aerometeo-smn-alternative"/);
 assert.match(html,/fuente NOAA\/AWC/);
 assert.match(html,/temporalmente inaccesibles/);
 assert.match(html,/href="https:\/\/ws2\.smn\.gob\.ar\/pronarea"/);
 assert.match(html,/href="https:\/\/ws2\.smn\.gob\.ar\/metar"/);
 assert.match(html,/href="https:\/\/ws2\.smn\.gob\.ar\/taf"/);
 assert.match(app,/'aerometeo-smn-alternative'\)\?\.addEventListener\('click'/);
 assert.match(app,/selectSource\('aviation',true\)/);
 assert.match(app,/showTab\('aviation'\)/);
 assert.match(css,/\.am-official-links \.am-official-main/);
});
test('La portada informativa compacta mantiene las piezas aprobadas',()=>{
 assert.match(css,/\.am-hero\{\s*height:100px/);
 assert.match(css,/\.am-hero h1\{font-size:clamp\(27px,2\.5vw,36px\)/);
 assert.match(html,/Meteorología aeronáutica para tu vuelo/);
 assert.match(html,/AeroMeteo/);
 assert.match(css,/aerometeo-hero\.svg/);
});
