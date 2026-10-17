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

test('PRONAREA rosa: an unlisted NIN group must not alter EZE/FDO wind for any leg', () => {
 const api = load();
 const routeAirports = {
  SAEZ: eze, SAAR: airports.SAAR,
  SADF: [-34.4545, -58.5909], SADP: [-34.61, -58.6125],
  SADM: [-34.6792, -58.6436], SABE: [-34.5589, -58.4164],
  SAAP: [-31.7947, -60.4803], SAAV: [-31.7108, -60.8114],
  SAAG: [-33.0056, -58.6128]
 };
 const pronarea = [
  'PRONAREA FIR EZE VALIDEZ 1022 SOBRE MAPA 0600 UTC.',
  'WIND/T: DIA FL030/16020P07 FL065/19015P03',
  'SVO-PAR-ROS-GUA FL030/17015P09 FL065/19015P01',
  'PAL-MOR-ENO-PTA-AER-EZE-FDO-CPO FL030/16015P06 FL065/18015M00',
  'NIN FL030/15015P06 FL065/18015P01',
  'GPI-LYE-PEH-OSA FL030/13010P06 FL065/16005M00',
  'FCST: DIA(EST) 1022 18010KT'
 ].join(' ');
 const entries = api.parse(pronarea);
 const fdoFl030 = entries.filter(x => x.station === 'FDO' && x.level_ft === 3000);
 assert.equal(fdoFl030.length, 1, 'NIN must not be misattributed to FDO');
 assert.equal(fdoFl030[0].direction_true_deg, 160);
 assert.equal(fdoFl030[0].speed_kt, 15);
 const midpointOf = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
 const flight = '2026-10-16T12:30:00Z';
 const first = api.pick(pronarea, 4500, midpointOf(eze, routeAirports.SAAR), routeAirports, flight,
  [eze, routeAirports.SAAR]);
 assert.equal(first.ok, true, first.reason);
 assert.equal(first.station, 'FDO');
 assert.equal(first.level_ft, 3000);
 assert.equal(first.direction_true_deg, 160);
 assert.equal(first.speed_kt, 15);
 const second = api.pick(pronarea, 3500, midpointOf(routeAirports.SAAR, routeAirports.SAAP), routeAirports,
  flight, [routeAirports.SAAR, routeAirports.SAAP]);
 assert.equal(second.ok, true, second.reason);
 assert.equal(second.direction_true_deg, 170);
 assert.equal(second.speed_kt, 15);
});

test('unknown 3- and 4-letter station codes always delimit subsequent WIND/T groups', () => {
 const api = load();
 const pronarea = [
  'PRONAREA FIR EZE VALIDEZ 1022 WIND/T:',
  'EZE FL030/09014P12 FL065/12020P08',
  'XXXX FL030/18012P12 FL065/20012P07',
  'ROS FL030/21025P10 FL065/24030P05',
  'CPO FL030/08010P10',
  'PAR FL030/26022P10 FCST: EZE 1022 CAVOK'
 ].join(' ');
 const entries = api.parse(pronarea);
 for (const [station, direction, speed] of [
  ['EZE', 90, 14], ['ROS', 210, 25], ['PAR', 260, 22]
 ]) {
  const rows = entries.filter(x => x.station === station && x.level_ft === 3000);
  assert.equal(rows.length, 1, station + ' must not inherit another station group');
  assert.equal(rows[0].direction_true_deg, direction);
  assert.equal(rows[0].speed_kt, speed);
 }
});

test('end to end: changing a leg course refreshes navigation and GS from endpoint WIND/T', () => {
 const elements = new Map();
 const makeElement = props => ({value: '', dataset: {}, hidden: false, children: [],
  append(...items) {this.children.push(...items);},addEventListener() {},
  replaceChildren(...items) {this.children=[...items];},setAttribute() {}, ...props});
 const pronarea = 'PRONAREA FIR EZE VALIDEZ 0416\nWIND/T: EZE FL030/27020P18\nCBA FL030/27010P17\nFCST:';
 elements.set('flight-pronarea', makeElement({value: pronarea}));
 elements.set('flight-time', makeElement({value: '2026-10-15T12:00'}));
 elements.set('flight-pronarea-confirm', makeElement({checked: true}));
 elements.set('flight-pronarea-validity', makeElement({dataset: {}}));
 elements.set('flight-origin', makeElement({value: 'SAEZ'}));
 elements.set('flight-dest', makeElement({value: 'SACO'}));
 elements.set('flight-nav-ias', makeElement({value: '100'}));
 elements.set('flight-essential-result', makeElement({hidden: false}));
 elements.set('flight-essential-navigation-content', makeElement());
 elements.set('flight-nav-wind-legs', makeElement());
 const altitudeInput = makeElement({value: '4500'});
 const trueCourseInput = makeElement({value: '', dataset: {estimated: 'false'}});
 const legRow = makeElement({querySelector: selector => selector==='.flight-true-track'
  ?trueCourseInput:altitudeInput});
 const legListeners = {};
 elements.set('flight-legs-list', makeElement({querySelectorAll: () => [legRow],
  addEventListener: (type,handler) => {legListeners[type]=handler;}}));
 elements.set('flight-waypoints', makeElement({querySelectorAll: () => []}));
 const context = {
  window: {GDV_WMM2025: {magneticVariation: () => 7},
   GDV_FLIGHT_FIR_GEODATA: {airports},GDV_FLIGHT_DISTANCE: {get: () => 354.8}},
  document: {getElementById: id => elements.get(id) || null,
   createElement: () => makeElement(),addEventListener() {}},
  MutationObserver: class {observe() {}},queueMicrotask: fn => fn()
 };
 vm.runInNewContext(source, context);
 vm.runInNewContext(navigationSource, context);
 const [pending] = context.window.GDV_FLIGHT_NAV.snapshot();
 assert.equal(pending.course_true_deg, null);
 assert.equal(pending.gs_kt, undefined);
 assert.match(pending.wind_source, /Ingresá el curso verdadero/);
 trueCourseInput.value = '300';
 legListeners.input();
 const [leg] = context.window.GDV_FLIGHT_NAV.snapshot();
 assert.equal(leg.name, 'SAEZ → SACO');
 assert.ok(leg.tas_kt > 100 && leg.tas_kt < 115);
 assert.ok(leg.gs_kt > 90 && leg.gs_kt < 105, `GS should account for altitude-adjusted TAS, got ${leg.gs_kt}`);
 assert.match(leg.wind_source, /promedio vectorial/);
 assert.ok(leg.heading_true_deg > 290 && leg.heading_true_deg < 315);
 assert.ok(Number.isFinite(leg.wind_correction_deg));
 assert.equal(leg.wind_true_from_deg, 270);
 assert.equal(leg.wind_speed_kt, 15);
 const navText = () => elements.get('flight-essential-navigation-content').children
  .flatMap(row => row.children.map(child => child.textContent)).join(' ');
 assert.match(navText(), /Curso verdadero manual: 300/);
 // La entrada manual es °T (no °M). La variación Este se resta para rumbo °M.
 trueCourseInput.value = '90';
 trueCourseInput.dataset.estimated = 'false';
 legListeners.input();
 const [manual] = context.window.GDV_FLIGHT_NAV.snapshot();
 assert.equal(manual.course_source, 'Curso verdadero ingresado por el piloto');
 assert.equal(manual.course_true_deg, 90);
 assert.equal(manual.magnetic_track_deg, 83);
 assert.equal(manual.heading_true_deg, 90);
 assert.equal(manual.heading_magnetic_deg, 83);
 assert.ok(Math.abs(manual.gs_kt-(manual.tas_kt+15)) < 0.0001);
 assert.ok(Math.abs(manual.wind_correction_deg) < 0.0001);
 assert.match(navText(), /Curso verdadero manual: 90/);
 assert.doesNotMatch(navText(), /Curso verdadero manual: 300/);
});
