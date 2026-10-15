const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../utilidades/meteorologia-aeronautica.html'), 'utf8');
const wizard = fs.readFileSync(path.join(__dirname, '../assets/flight-operations-wizard.js'), 'utf8');

test('official directory and weather charts appear after the pilot consultation in the final screen', () => {
 const report = html.indexOf('id="ops-meteo"');
 const pilot = html.indexOf('id="ops-piloto"');
 const directory = html.indexOf('id="fuentes"');
 const charts = html.indexOf('id="ops-cartas"');
 assert.ok(report > 0 && report < pilot && pilot < directory && directory < charts);

 const show = wizard.match(/const visible=([^;]+);/);
 assert.ok(show);
 const [meteorology, final] = show[1].split(':s===3?[nav]:');
 assert.ok(meteorology);
 assert.doesNotMatch(meteorology, /\$\('fuentes'\)|\$\('ops-cartas'\)/);
 assert.match(final, /\[report,\$\('ops-piloto'\),\$\('fuentes'\),\$\('ops-cartas'\)\]/);
});

test('official links and chart controls remain intact', () => {
 for(const id of ['flight-chart-figure', 'flight-chart-image', 'flight-chart-refresh', 'flight-chart-source']){
  assert.match(html, new RegExp('id="'+id+'"'));
 }
 assert.match(html, /https:\/\/ais\.anac\.gob\.ar\//);
 assert.match(html, /https:\/\/redemet\.decea\.mil\.br\//);
 assert.match(html, /flight-operations-wizard\.js\?v=20261015l/);
});

test('meteorology renders the calculations shortcut once, under the evaluation', () => {
 assert.match(wizard, /for\(const section of \[\$\('ops-boletines'\)\]\.filter\(Boolean\)\)/);
 assert.doesNotMatch(wizard, /\[weather,\$\('ops-boletines'\)\]/);
 assert.match(wizard, /section\.append\(row\)/);
 assert.match(wizard, /await go\(3\)/);
});
