const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/flight-vfr-altitude.js'), 'utf8');

function firstScreen(altitudeValue) {
 const altitude = {
  value: altitudeValue, validationMessage: '',
  setCustomValidity(message) {this.validationMessage = message;},
  setAttribute() {}, removeAttribute() {},
 };
 const legAltitude = {value: altitudeValue};
 const track = {value: '', dataset: {estimated: 'false'}};
 const row = {querySelector: selector => selector === '.field input[type="number"]' ? legAltitude :
  selector === '.flight-vfr-track' ? track : null};
 const feedback = {dataset: {}, textContent: ''};
 const apply = {hidden: true, textContent: '', onclick: null};
 let previewCalls = 0;
 const nodes = {'flight-waypoints': {querySelectorAll: () => [], querySelector: () => null}};
 const sandbox = {
  legs: {querySelectorAll: () => [row]},
  $: id => nodes[id],
  mainAltitude: altitude, mainFeedback: feedback, mainApply: apply,
  document: {activeElement: null},
  context: {value: 'standard'}, rules: {value: 'VFR'},
  continuation: [],
  positionNames: () => ['SAEZ','SAAP'],
  resolve: name => ({SAEZ: [-34.8222,-58.5358], SAAP: [-31.7947,-60.4803]})[name],
  plannedDate: () => new Date('2026-10-15T12:00:00Z'),
  estimatedTrack(from,to) {
   previewCalls++;
   assert.equal(from[0], -34.8222);
   assert.equal(to[0], -31.7947);
   return {track: 335.2, ambiguous: false};
  },
  nearLimit: () => false,
  fmt: n => Math.round(n).toLocaleString('es-AR') + ' ft',
 };
 const start = source.indexOf('function evaluate(');
 const end = source.indexOf('function updateOverview()', start);
 const update = vm.runInNewContext(source.slice(start,end)+'\nupdateMainAltitude;',sandbox);
 return {update, altitude, legAltitude, track, feedback, apply, sandbox, previewCalls: () => previewCalls};
}

test('first screen warns that 3500 ft is incompatible with estimated Ezeiza–Paraná track', () => {
 const screen = firstScreen('3500');
 screen.update();
 assert.equal(screen.previewCalls(), 1);
 assert.match(screen.feedback.textContent, /ALTITUD NO COMPATIBLE \(estimación inicial\)/);
 assert.match(screen.feedback.textContent, /Derrota magnética 335\.2°/);
 assert.match(screen.altitude.validationMessage, /NO corresponde/);
 assert.equal(screen.apply.hidden, false);
 assert.match(screen.apply.textContent, /4\.500 ft/);
 assert.equal(screen.track.value, '', 'the second-stage true course must remain manual');
});

test('4500 ft is shown as compatible and declared VFR exceptions do not block', () => {
 const screen = firstScreen('4500');
 screen.update();
 assert.match(screen.feedback.textContent, /Coincide con la serie VFR/);
 assert.equal(screen.altitude.validationMessage, '');
 screen.sandbox.context.value = 'below';
 screen.altitude.value = '3500';
 screen.legAltitude.value = '3500';
 screen.update();
 assert.match(screen.feedback.textContent, /declaraste una excepción/);
 assert.equal(screen.altitude.validationMessage, '');
});

test('the versioned script enables fresh first-screen validation', () => {
 const html = fs.readFileSync(path.join(__dirname, '../utilidades/meteorologia-aeronautica.html'), 'utf8');
 assert.match(html, /flight-vfr-altitude\.js\?v=20261015i/);
});

test('the actual route geometry and WMM2025 place Ezeiza–Paraná in the western VFR series', () => {
 const model = fs.readFileSync(path.join(__dirname, '../assets/flight-wmm2025.js'), 'utf8');
 const modelSandbox = {window: {}};
 vm.runInNewContext(model, modelSandbox);
 const start = source.indexOf('function initialBearing(');
 const end = source.indexOf('function evaluate(', start);
 const sandbox = {
  rad: Math.PI / 180, deg: 180 / Math.PI,
  normalize: angle => (angle % 360 + 360) % 360,
  geomag: modelSandbox.window.GDV_WMM2025,
 };
 const estimate = vm.runInNewContext(source.slice(start,end)+'\nestimatedTrack;', sandbox);
 const route = estimate([-34.8222,-58.5358],[-31.7947,-60.4803],new Date('2026-10-15T12:00:00Z'));
 assert.ok(route.track > 180 && route.track < 360);
 assert.equal(route.ambiguous, false);
});
