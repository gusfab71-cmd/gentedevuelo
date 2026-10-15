const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../assets/flight-pronarea-wind.js'), 'utf8');
const navigationSource = fs.readFileSync(path.join(__dirname, '../assets/flight-essential-navigation.js'), 'utf8');
const eze = [-34.8222, -58.5358];
const cba = [-31.31, -64.2083];
const airports = {SAEZ: eze, SACO: cba, SAAR: [-32.9036, -60.7844]};
const midpoint = [(eze[0] + cba[0]) / 2, (eze[1] + cba[1]) / 2];
const departure = '2026-10-15T12:00:00Z';

function load(confirmed = true) {
 const nodes = {
  'flight-pronarea': {value: '', addEventListener() {}},
  'flight-time': {value: '', addEventListener() {}},
  'flight-pronarea-confirm': {checked: confirmed, addEventListener() {}},
  'flight-pronarea-validity': {dataset: {}, textContent: '', hidden: true}
 };
 const context = {window: {}, document: {getElementById: id => nodes[id] || null}};
 vm.runInNewContext(source, context);
 return context.window.GDV_PRONAREA_WIND;
}

test('SAEZ–SACO: use official endpoint WIND/T despite midpoint being over 300 km away', () => {
 const api = load();
 const pronarea = 'PRONAREA FIR EZE VALIDEZ 0416\nWIND/T: EZE FL030/27020P18\nCBA FL030/27010P17\nFCST: EZE 0416 CAVOK';
 const previous = api.pick(pronarea, 4500, midpoint, airports, departure);
 assert.equal(previous.ok, false);
 assert.match(previous.reason, /300|centro/);

 const result = api.pick(pronarea, 4500, midpoint, airports, departure, [eze, cba]);
 assert.equal(result.ok, true);
 assert.equal(result.reference_type, 'route_endpoints_average');
 assert.equal(result.station, 'EZE + CBA');
 assert.equal(result.level_ft, 3000);
 assert.equal(Math.round(result.direction_true_deg), 270);
 assert.ok(Math.abs(result.speed_kt - 15) < 0.0001);
 assert.match(result.notice, /NO un pronóstico confirmado/);
});

test('one endpoint station yields an estimated wind without inventing destination data', () => {
 const api = load();
 const pronarea = 'PRONAREA FIR EZE VALIDEZ 0416\nWIND/T: EZE FL030/18012P15\nFCST:';
 const result = api.pick(pronarea, 4500, midpoint, airports, departure, [eze, cba]);
 assert.equal(result.ok, true);
 assert.equal(result.reference_type, 'route_endpoint');
 assert.equal(result.station, 'EZE');
 assert.equal(result.speed_kt, 12);
 assert.equal(result.direction_true_deg, 180);
});

test('direction averaging takes the shortest angular arc across north', () => {
 const api = load();
 const pronarea = 'PRONAREA FIR EZE VALIDEZ 0416\nWIND/T: EZE FL030/35020P10\nCBA FL030/01020P10\nFCST:';
 const result = api.pick(pronarea, 4500, midpoint, airports, departure, [eze, cba]);
 assert.equal(result.ok, true);
 assert.ok(result.direction_true_deg < 1 || result.direction_true_deg > 359);
 assert.ok(result.speed_kt > 19);
});

test('does not take remote off-route stations or unconfirmed PRONAREA as valid wind', () => {
 const pronarea = 'PRONAREA FIR EZE VALIDEZ 0416\nWIND/T: ROS FL030/09020P10\nFCST:';
 const api = load();
 const result = api.pick(pronarea, 4500, midpoint, {...airports, SAAR: [-20,-50]}, departure, [eze, cba]);
 assert.equal(result.ok, false);
 assert.match(result.reason, /no corresponde al origen o destino/);
 const unconfirmed = load(false).pick('PRONAREA FIR EZE VALIDEZ 0416\nWIND/T: EZE FL030/09020P10\nFCST:', 4500, midpoint, airports, departure, [eze, cba]);
 assert.equal(unconfirmed.ok, false);
 assert.equal(unconfirmed.status, 'fecha_sin_confirmar');
});

test('conflicting reports from the same endpoint station cannot yield an automatic GS', () => {
 const api = load();
 const pronarea = 'PRONAREA FIR EZE VALIDEZ 0416\nWIND/T: EZE FL030/09020P15 EZE FL030/18020P15\nFCST:';
 const result = api.pick(pronarea, 4500, midpoint, airports, departure, [eze, cba]);
 assert.equal(result.ok, false);
 assert.match(result.reason, /contradictorios/);
});

test('end to end: the navigation snapshot calculates GS from TAS and endpoint WIND/T', () => {
 const elements = new Map();
 const makeElement = props => ({value: '', dataset: {}, hidden: false, append() {},
  addEventListener() {}, replaceChildren() {}, setAttribute() {}, ...props});
 const pronarea = 'PRONAREA FIR EZE VALIDEZ 0416\nWIND/T: EZE FL030/27020P18\nCBA FL030/27010P17\nFCST:';
 elements.set('flight-pronarea', makeElement({value: pronarea}));
 elements.set('flight-time', makeElement({value: '2026-10-15T12:00'}));
 elements.set('flight-pronarea-confirm', makeElement({checked: true}));
 elements.set('flight-pronarea-validity', makeElement({dataset: {}}));
 elements.set('flight-origin', makeElement({value: 'SAEZ'}));
 elements.set('flight-dest', makeElement({value: 'SACO'}));
 elements.set('flight-nav-tas', makeElement({value: '100'}));
 elements.set('flight-essential-result', makeElement({hidden: true}));
 elements.set('flight-essential-navigation-content', makeElement());
 elements.set('flight-nav-wind-legs', makeElement());
 const altitudeInput = makeElement({value: '4500'});
 const legRow = makeElement({querySelector: selector => selector==='.flight-vfr-track'
  ?makeElement({value:'',dataset:{estimated:'true'}}):altitudeInput});
 elements.set('flight-legs-list', makeElement({querySelectorAll: () => [legRow]}));
 elements.set('flight-waypoints', makeElement({querySelectorAll: () => []}));
 const context = {
  window: {GDV_WMM2025: {magneticVariation: () => 0},
   GDV_FLIGHT_FIR_GEODATA: {airports},GDV_FLIGHT_DISTANCE: {get: () => 354.8}},
  document: {getElementById: id => elements.get(id) || null,
   createElement: () => makeElement(),addEventListener() {}},
  MutationObserver: class {observe() {}},queueMicrotask: fn => fn()
 };
 vm.runInNewContext(source, context);
 vm.runInNewContext(navigationSource, context);
 const [leg] = context.window.GDV_FLIGHT_NAV.snapshot();
 assert.equal(leg.name, 'SAEZ → SACO');
 assert.ok(leg.gs_kt > 86 && leg.gs_kt < 89, `GS should be about 87.5 kt, got ${leg.gs_kt}`);
 assert.match(leg.wind_source, /promedio vectorial/);
 assert.ok(leg.heading_true_deg > 290 && leg.heading_true_deg < 315);
});
