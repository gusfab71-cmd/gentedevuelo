const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../assets/flight-pronarea-wind.js'), 'utf8');

function load(confirmed = true) {
  const nodes = {
    'flight-pronarea': { value: '', addEventListener() {} },
    'flight-time': { value: '', addEventListener() {} },
    'flight-pronarea-confirm': { checked: confirmed, addEventListener() {} },
    'flight-pronarea-validity': { dataset: {}, textContent: '', hidden: true },
  };
  const context = {
    window: {},
    document: { getElementById: id => nodes[id] || null },
  };
  vm.runInNewContext(source, context);
  return context.window.GDV_PRONAREA_WIND;
}

test('PRONAREA uses departure UTC date without a separate date input', () => {
  const api = load();
  const text = 'PRONAREA FIR EZE VALIDEZ 0416';
  assert.equal(api.validity(text, '2026-10-15T15:00:00Z').ok, true);
  assert.equal(api.validity(text, '2026-10-15T17:00:00Z').status, 'fuera_del_horario');
});

test('PRONAREA crossing midnight resolves the previous UTC day', () => {
  const api = load();
  const window = api.resolveWindow('2004', '2026-10-16T02:00:00Z');
  assert.equal(new Date(window.start).toISOString(), '2026-10-15T20:00:00.000Z');
  assert.equal(new Date(window.end).toISOString(), '2026-10-16T04:00:00.000Z');
  assert.equal(api.validity('PRONAREA FIR EZE VALIDEZ 2004', '2026-10-16T02:00:00Z').ok, true);
  assert.equal(api.validity('PRONAREA FIR EZE VALIDEZ 2004', '2026-10-16T05:00:00Z').ok, false);
});

test('PRONAREA requires confirmation of the official bulletin', () => {
  const api = load(false);
  assert.equal(api.validity('PRONAREA FIR EZE VALIDEZ 0416', '2026-10-15T15:00:00Z').status, 'fecha_sin_confirmar');
});

test('all included FIR windows must cover the departure', () => {
  const api = load();
  const text = 'PRONAREA FIR EZE VALIDEZ 0416\nPRONAREA FIR CBA VALIDEZ 0408';
  assert.equal(api.validity(text, '2026-10-15T07:00:00Z').ok, true);
  assert.equal(api.validity(text, '2026-10-15T10:00:00Z').status, 'fuera_del_horario');
});
