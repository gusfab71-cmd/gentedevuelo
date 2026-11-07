const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(base,'utilidades/aerometeo.html'),'utf8');
const app=fs.readFileSync(path.join(base,'assets/aerometeo-app.js'),'utf8');
const css=fs.readFileSync(path.join(base,'assets/aerometeo.css'),'utf8');
const aviationUi=fs.readFileSync(path.join(base,'assets/aerometeo-aviation-ui.js'),'utf8');
const locator=fs.readFileSync(path.join(base,'utilidades/pistas-no-oficiales.html'),'utf8');
const forecast=require('../api/aerolocator-open-meteo.js');
const aviation=require('../api/aerometeo-aviation-weather.js');

test('AeroMeteo es una aplicación separada; AeroLocator no ejecuta sus capas',()=>{
 assert.match(html,/<title>AeroMeteo · Developed by Gente de Vuelo<\/title>/);
 assert.match(html,/id="aerometeo-app"/);
 assert.match(html,/id="map"/);
 assert.match(html,/assets\/aerometeo-app\.js/);
 assert.match(html,/assets\/aerometeo\.css/);
 assert.doesNotMatch(html,/aerolocator-weather-stations\.js/);
 assert.match(html,/aerolocator-open-meteo-ui\.js/);
 assert.match(locator,/href="aerometeo\.html"/);
 assert.doesNotMatch(locator,/GDV_WEATHER_STATIONS\?\.boot/);
 assert.doesNotMatch(locator,/GDV_OPEN_METEO_FORECAST\?\.boot/);
 assert.match(css,/\.am-layout/);
 assert.match(app,/loadMetarObservation/);
 assert.match(app,/map\.on\('click'/);
});

test('El diseño distingue pronóstico de observación real y productos oficiales',()=>{
 assert.match(html,/Observación METAR|Observaciones METAR/i);
 assert.match(html,/Pronóstico/);
 assert.match(html,/Un pronóstico de modelo no reemplaza una observación/i);
 assert.match(html,/enlaces externos sujetos a disponibilidad/);
 assert.match(html,/no se obtienen automáticamente al mover el mapa/);
 assert.match(aviationUi,/posiblemente DESACTUALIZADO/);
 assert.match(app,/No es observación real ni METAR/);
});

test('Se retira la tarjeta SMN y se mantienen referencias oficiales discretas',()=>{
 assert.doesNotMatch(html,/id="am-source-smn"/);
 assert.doesNotMatch(html,/id="am-smn-tools"/);
 assert.match(html,/href="https:\/\/www\.argentina\.gob\.ar\/smn"/);
 assert.match(html,/href="https:\/\/ws2\.smn\.gob\.ar\/pronarea"/);
 assert.match(html,/https:\/\/aviationweather\.gov\//);
 assert.doesNotMatch(app,/aerometeo-smn-alternative/);
});

test('Open-Meteo verifica coordenadas, entrada y limita el ámbito argentino',async()=>{
 const {coordinate,sourceUrl}=forecast._test;
 assert.equal(coordinate('-35.11453',-56,-21),-35.11);
 assert.equal(coordinate('-58.72725',-75,-52),-58.73);
 for(const invalid of ['0','100','-90','-30;evil','NaN','undefined','https://evil.test',''])assert.equal(coordinate(invalid,-56,-21),null);
 const parsed=new URL(sourceUrl(-35.11,-58.73));
 assert.equal(parsed.origin,'https://api.open-meteo.com');
 assert.equal(parsed.searchParams.get('timezone'),'UTC');
 assert.equal(parsed.searchParams.get('wind_speed_unit'),'kn');
 assert.equal(parsed.searchParams.get('forecast_hours'),'6');
 assert.match(parsed.searchParams.get('current'),/wind_gusts_10m/);
 const output=()=>({code:0,setHeader(){},status(n){this.code=n;return this},json(x){this.payload=x;return this}});
 const reject=output();
 await forecast({method:'GET',query:{lat:'-35.11',lon:'http://internal.invalid'}},reject);
 assert.equal(reject.code,400);
 const post=output();
 await forecast({method:'POST',query:{lat:'-35.11',lon:'-58.73'}},post);
 assert.equal(post.code,405);
});

test('Open-Meteo normaliza modelo en nudos y no etiqueta ningún pronóstico como METAR',()=>{
 const now=Date.parse('2026-11-06T18:00:00Z');
 const data={
  utc_offset_seconds:0,latitude:-35.1,longitude:-58.7,
  current_units:{wind_speed_10m:'kn',wind_gusts_10m:'kn'},
  current:{time:'2026-11-06T18:00',wind_speed_10m:12.7,
   wind_direction_10m:170,wind_gusts_10m:19.2,temperature_2m:22,
   relative_humidity_2m:65,pressure_msl:1014,cloud_cover:70,precipitation:0},
  hourly:{time:['2026-11-06T18:00','2026-11-06T19:00'],
   wind_speed_10m:[12.7,14],wind_direction_10m:[170,180],
   wind_gusts_10m:[19.2,22],temperature_2m:[22,23],cloud_cover:[70,80]}
 };
 const out=forecast._test.normalizeForecast(data,{lat:-35.11,lon:-58.73},now);
 assert.equal(out.kind,'model_forecast');
 assert.equal(out.isMetar,false);
 assert.equal(out.current.windKt,12.7);
 assert.equal(out.current.gustKt,19.2);
 assert.equal(out.forecast.length,2);
 assert.ok(out.warning.includes('no es observación'));
 assert.throws(()=>forecast._test.normalizeForecast({
  ...data,current_units:{wind_speed_10m:'km/h',wind_gusts_10m:'km/h'}
 },{lat:-35.11,lon:-58.73},now),/nudos/);
 assert.throws(()=>forecast._test.normalizeForecast({
  ...data,current:{...data.current,time:'2026-10-01T18:00'}
 },{lat:-35.11,lon:-58.73},now),/fuera de rango/);
});

test('METAR/TAF se consultan únicamente por código OACI argentino',async()=>{
 assert.equal(aviation._test.ICAO.test('SAAV'),true);
 assert.equal(aviation._test.ICAO.test('SAEZ'),true);
 for(const bad of ['SA','KJFK','../../etc','SAAV,SAEZ','SAAV;','SAAV%0D'])
  assert.equal(aviation._test.ICAO.test(bad),false);
 const output=()=>({code:0,setHeader(){},status(n){this.code=n;return this},json(x){this.payload=x;return this}});
 const unknown=output();await aviation({method:'GET',query:{icao:'KJFK',type:'metar'}},unknown);
 assert.equal(unknown.code,400);
 const post=output();await aviation({method:'POST',query:{icao:'SAAV',type:'metar'}},post);
 assert.equal(post.code,405);
});

test('METAR y TAF preservan texto original, fecha y advertencia de antigüedad',()=>{
 const now=Date.parse('2026-11-06T19:00:00Z');
 const metar=aviation._test.normalizeAwc([{icaoId:'SAAV',
  rawOb:'SAAV 061800Z 17012G18KT 9999 SCT030 22/13 Q1015',
  obsTime:'2026-11-06T18:00:00Z'}],'metar','SAAV',now);
 assert.equal(metar.found,true);
 assert.equal(metar.stale,false);
 assert.equal(metar.ageMinutes,60);
 const stale=aviation._test.normalizeAwc([{icaoId:'SAAV',
  rawOb:'SAAV 060100Z 17012KT 9999 22/13 Q1015',
  obsTime:'2026-11-06T01:00:00Z'}],'metar','SAAV',now);
 assert.equal(stale.stale,true);
 const taf=aviation._test.normalizeAwc([{icaoId:'SAEZ',
  rawTAF:'TAF SAEZ 061700Z 0618/0718 18010KT 9999 FEW030',
  issueTime:'2026-11-06T17:00:00Z'}],'taf','SAEZ',now);
 assert.equal(taf.found,true);
 assert.equal(taf.stale,false);
 const wrong=aviation._test.normalizeAwc([{icaoId:'SAEZ',
  rawOb:'SAEZ 061800Z 19012KT 9999 Q1015'}],'metar','SAAV',now);
 assert.equal(wrong.found,false);
 const missing=aviation._test.normalizeAwc([], 'metar','SAAV',now);
 assert.equal(missing.found,false);
});

test('No hay API key secreta ni solicitudes automáticas al mover mapa',()=>{
 for(const code of [app,aviationUi])assert.doesNotMatch(code,/apiKey\s*[:=]/i);
 assert.doesNotMatch(app,/map\.on\('moveend'/);
 assert.match(app,/map\.on\('zoomend',refreshAirportMarkers\)/);
 assert.match(app,/aerometeo-forecast-center/);
 assert.doesNotMatch(app,/aerometeo-show-stations/);
 assert.match(html,/CC BY 4\.0/);
 assert.match(html,/Uso informativo y educativo/);
});

test('La pantalla de inicio sigue la maqueta aprobada sin fabricar lecturas',()=>{
 for(const text of ['AeroMeteo','Meteorología aeronáutica para tu vuelo','Fuentes y productos',
  'Pronósticos Open-Meteo','SMN','METAR / TAF',
  'Mapa meteorológico – Argentina','Viento','Precipitación','Nubosidad','Temperatura',
  'Observación','Pronóstico','se presentan de forma diferenciada'])
  assert.ok(html.includes(text),text);
 for(const id of ['am-source-forecast','am-source-aviation',
  'am-detail-observation','am-detail-forecast','am-detail-aviation','am-detail-title',
  'am-value-wind','am-value-gust','am-value-temperature','am-value-pressure',
  'am-value-humidity','am-value-cloud','am-detail-status','am-detail-updated',
  'am-detail-condition','am-detail-forecast-action'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/aerometeo-logo\.svg/);
 assert.match(css,/aerometeo-hero\.svg/);
 assert.match(css,/grid-template-columns:/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(html,/Actualización: sin datos/);
 assert.match(html,/Sin observación aeronáutica verificada/);
 assert.doesNotMatch(html,/(?:\d{2,3}°\s*\/\s*)?\d{1,2}\s*kt\s*<\/strong>/);
});

test('El panel no atribuye lecturas de estaciones 3D-PAWS a aeropuertos sin un METAR válido',()=>{
 assert.doesNotMatch(app,/GDV_WEATHER_STATIONS/);
 assert.match(app,/loadMetarObservation\(point\)/);
 assert.match(app,/data\.icao!==icao/);
 assert.match(app,/onForecast:showForecastResult/);
 assert.match(app,/no se reemplaza con el pronóstico/);
 assert.match(app,/capa nacional cargada/);
 assert.match(html,/no garantizan operación ni METAR/i);
 assert.match(app,/icao:'SABE'/); // Aeroparque, no SAAR.
 assert.match(app,/icao:'SAAR'/); // Rosario.
 assert.ok(!html.includes('SAAR – Aeroparque'));
});


test('AeroMeteo aparece en el portal institucional para todos los roles sin otorgar permisos nuevos',()=>{
 const portal=fs.readFileSync(path.join(base,'utilidades/gestion-aeronautica/portal-escuela.html'),'utf8');
 const link=portal.match(/<a[^>]+id="aerosuiteAeroMeteoLink"[^>]+>[\s\S]*?<\/a>/);
 assert.ok(link,'Existe tarjeta AeroMeteo en el portal institucional');
 assert.match(link[0],/data-visible-role="administrador secretaria instructor alumno piloto"/);
 assert.match(link[0],/href="\.\.\/aerometeo\.html\?desde=portal-escuela"/);
 assert.match(link[0],/target="_blank"/);
 assert.match(link[0],/rel="noopener noreferrer"/);
 assert.match(link[0],/\shidden>/);
 assert.doesNotMatch(link[0],/data-module=/);
 assert.match(portal,/card\.hidden=!card\.dataset\.visibleRole\.split\(\/\\s\+\/\)\.includes\(school\.my_role\)/);
 assert.match(portal,/if\(!school\.can_access\)/);
 assert.match(app,/get\('desde'\)==='portal-escuela'/);
 assert.match(app,/back\.href='gestion-aeronautica\/portal-escuela\.html'/);
});

test('AeroMeteo aparece también en la demo de Alumno, Instructor y Administración',()=>{
 const demo=fs.readFileSync(path.join(base,'utilidades/gestion-aeronautica/portal.html'),'utf8');
 assert.equal((demo.match(/\['aerometeo','AeroMeteo'\]/g)||[]).length,3);
 assert.match(demo,/aerometeo:aeroMeteoScreen/);
 assert.match(demo,/function aeroMeteoScreen\(\)/);
 assert.match(demo,/href="'\+url\+'" target="_blank" rel="noopener noreferrer">Abrir AeroMeteo/);
});
