const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const wizard = fs.readFileSync(path.join(__dirname, '../assets/flight-operations-wizard.js'), 'utf8');

test('returning to an earlier stage works without connectivity or field validation', async () => {
 const start = wizard.indexOf('async function go(n){');
 const end = wizard.indexOf("\n$('flight-wizard-next').onclick", start);
 assert.ok(start >= 0 && end > start);
 const messages = [];
 let saves = 0;
 let validations = 0;
 const state = {
  step: 4,
  busy: false,
  titles: ['Datos', 'Piernas', 'Meteorología', 'Cálculos', 'Informe'],
  notify: message => messages.push(message),
  display: n => { state.step = n; },
  valid: () => { validations++; return true; },
  save: async () => { saves++; throw new Error('Sin conexión'); }
 };
 const go = vm.runInNewContext(wizard.slice(start, end) + '\ngo;', state);

 await go(1); // Desde informe final hacia planificación de piernas.
 assert.equal(state.step, 1);
 assert.equal(saves, 0);
 assert.equal(validations, 0);
 assert.match(messages.at(-1), /Revisá o modificá/);

 await go(2); // Avanzar conserva la validación y el guardado obligatorio.
 assert.equal(validations, 1);
 assert.equal(saves, 1);
 assert.equal(state.step, 1);
 assert.match(messages.at(-1), /Sin conexión/);
});

test('every stage after the first provides a visible bottom back control', () => {
 assert.match(wizard, /bottomBackRows=\[plan,\$\('ops-boletines'\),nav,\$\('ops-cartas'\)\]/);
 assert.match(wizard, /button\.textContent='← Volver a la etapa anterior'/);
 assert.match(wizard, /button\.addEventListener\('click',\(\)=>\{void go\(step-1\);\}\)/);
 assert.match(wizard, /bottomBackRows\.forEach\(\(row,i\)=>\{if\(row\)row\.hidden=/);
 assert.match(wizard, /if\(n<step\)\{display\(n\);/);
});

test('edits mark an existing AI report as outdated without making a new AI request', () => {
 assert.match(wizard, /reportStale\.hidden=true/);
 assert.match(wizard, /Se modificaron datos del vuelo después de generar este informe/);
 assert.match(wizard, /if\(!\$\('flight-essential-result'\)\?\.hidden\)reportStale\.hidden=false/);
 assert.match(wizard, /\.observe\(\$\('flight-essential-analysis'\)/);
});
