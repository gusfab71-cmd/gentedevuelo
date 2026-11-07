'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const {explain}=require('../assets/aerometeo-messages-es.js');
const html=fs.readFileSync(path.join(base,'utilidades/aerometeo.html'),'utf8');
const app=fs.readFileSync(path.join(base,'assets/aerometeo-app.js'),'utf8');
const css=fs.readFileSync(path.join(base,'assets/aerometeo.css'),'utf8');
const forecastUi=fs.readFileSync(path.join(base,'assets/aerolocator-open-meteo-ui.js'),'utf8');

test('METAR: lenguaje sencillo para viento, visibilidad, nubosidad, temperatura y QNH',()=>{
 const lines=explain('METAR SAEZ 072000Z 16008G17KT 9999 FEW025 20/11 Q1018 NOSIG','metar');
 assert.ok(lines.some(x=>/160°.*8 nudos.*17 nudos/.test(x)));
 assert.ok(lines.some(x=>/10 km o más/.test(x)));
 assert.ok(lines.some(x=>/2\.500 pies/.test(x)));
 assert.ok(lines.some(x=>/20 °C.*11 °C/.test(x)));
 assert.ok(lines.some(x=>/1018 hPa/.test(x)));
 assert.ok(lines.some(x=>/NOSIG/.test(x)));
 assert.doesNotMatch(lines.join(' '),/apto para volar|vuelo seguro/i);
});

test('METAR: precipitación débil, nubosidad, baja visibilidad y temperaturas negativas',()=>{
 const lines=explain('METAR SAAR 072000Z 00000KT 3000 -RA BKN012 M02/M05 Q1012','metar');
 assert.ok(lines.some(x=>/Viento en calma/.test(x)));
 assert.ok(lines.some(x=>/3 km/.test(x)));
 assert.ok(lines.some(x=>/lluvia.*débil/.test(x)));
 assert.ok(lines.some(x=>/1\.200 pies/.test(x)));
 assert.ok(lines.some(x=>/-2 °C.*-5 °C/.test(x)));
});

test('TAF: distingue base, cambios temporales, cambio gradual y grupo FM en UTC',()=>{
 const raw='TAF SAEZ 071800Z 0718/0818 18010KT 9999 FEW030 '+
  'TEMPO 0720/0802 4000 SHRA BKN015 BECMG 0803/0805 22012KT '+
  'FM080900 19008KT 9999 SCT020';
 const lines=explain(raw,'taf');
 assert.ok(lines.some(x=>/Período del TAF.*día 07.*día 08/.test(x)));
 assert.ok(lines.some(x=>/Previsión inicial.*180°.*10 nudos/.test(x)));
 assert.ok(lines.some(x=>/Temporalmente.*chubascos de lluvia/.test(x)));
 assert.ok(lines.some(x=>/Cambio gradual.*220°/.test(x)));
 assert.ok(lines.some(x=>/Desde el día 08, 09:00 UTC/.test(x)));
 assert.doesNotMatch(lines.join(' '),/vuelos permitidos|apto para volar|TAF vigente/i);
});

test('Interpretación parcial: sin suposiciones para códigos desconocidos o sin datos',()=>{
 assert.deepEqual(explain('','metar'),[]);
 assert.deepEqual(explain('METAR SAAV 072000Z XYZ','metar'),
  ['Este reporte contiene códigos que no podemos explicar con suficiente seguridad.']);
 assert.deepEqual(explain('TAF SAEZ 071800Z 0718/0818 XXYY','taf'),
  ['Período del TAF indicado en el texto: desde el día 07, 18:00 UTC hasta el día 08, 18:00 UTC.']);
 assert.deepEqual(explain('METAR SAEZ 072000Z 00000KT','otro'),[]);
});

test('AeroMeteo: sin menú duplicado, cada mensaje original seguido de interpretación',()=>{
 assert.doesNotMatch(html,/id="am-source-aviation"|id="am-aviation-tools"|id="aerometeo-icao"/);
 assert.doesNotMatch(html,/aerometeo-aviation-ui\.js/);
 assert.match(html,/aerometeo-messages-es\.js/);
 assert.match(html,/id="am-detail-aviation"/);
 for(const type of ['metar','taf']){
  const original=html.indexOf('id="am-auto-'+type+'-raw"');
  const interpretation=html.indexOf('id="am-auto-'+type+'-explanation"');
  assert.ok(original>=0&&interpretation>original);
  assert.match(html,new RegExp('id="am-auto-'+type+'-explanation-lines"'));
 }
 assert.match(app,/GDV_AEROMETEO_MESSAGES\?\.explain\(raw,type\)/);
 assert.match(app,/list\.replaceChildren\(\)/);
 assert.match(css,/\.am-report-explanation/);
});

test('La tarjeta Open-Meteo compacta solo afecta AeroMeteo, no AeroLocator',()=>{
 assert.match(forecastUi,/function renderCompact\(parent,data,location\)/);
 assert.match(forecastUi,/if\(dock\)renderCompact\(view,data,safeName\)/);
 assert.match(forecastUi,/else render\(view,data,safeName\)/);
 assert.match(forecastUi,/Más datos y próximas horas/);
 assert.match(forecastUi,/am-compact-metrics/);
 assert.match(css,/\.am-forecast-dock\{\s*width:min\(278px/);
 assert.match(css,/\.am-compact-metrics\{display:grid/);
 assert.match(html,/aerolocator-open-meteo-ui\.js\?v=20261107compactcard1/);
 assert.match(html,/aerometeo\.css\?v=20261107compactcard1/);
 assert.match(html,/aerometeo-app\.js\?v=20261107explain1/);
});
