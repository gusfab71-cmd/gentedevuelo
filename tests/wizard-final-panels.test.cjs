const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
 assert.match(html, /flight-operations-wizard\.js\?v=20261015t/);
});

test('fuel chart displays a real time-versus-liters curve and labels a one-hour projection when the route is incomplete', () => {
 const from=wizard.indexOf('function fuelChartPoints(');
 const to=wizard.indexOf('\nfunction calcFuel(',from);
 assert.ok(from>0&&to>from);
 const nodes=Object.fromEntries(['flight-fuel-chart-svg','flight-fuel-chart-total','flight-fuel-chart-duration','flight-fuel-chart-note'].map(id=>[id,{
  textContent:'',innerHTML:'',attrs:{},setAttribute(name,value){this.attrs[name]=value;}
 }]));
 const {fuelChartPoints,renderFuelChart}=vm.runInNewContext(wizard.slice(from,to)+'\n({fuelChartPoints,renderFuelChart});',{
  $:id=>nodes[id],fmt:value=>String(Math.round(value*10)/10)
 });
 const legs=[{distance_nm:60,gs_kt:120},{distance_nm:90,gs_kt:90}];
 const points=fuelChartPoints(legs,30,5);
 assert.equal(points.length,3);
 assert.equal(points[1].minutes,30);
 assert.equal(points[1].liters,20);
 assert.equal(points[2].minutes,90);
 assert.equal(points[2].liters,50);
 assert.equal(fuelChartPoints([{distance_nm:12,gs_kt:0}],30,5),null);
 assert.equal(fuelChartPoints(legs,null,5),null);

 renderFuelChart([],30,5);
 assert.equal(nodes['flight-fuel-chart-total'].textContent,'35 L');
 assert.equal(nodes['flight-fuel-chart-duration'].textContent,'Referencia de 60 min');
 assert.match(nodes['flight-fuel-chart-note'].textContent,/No representa todavía los tramos/);

 renderFuelChart(legs,30,5);
 assert.equal(nodes['flight-fuel-chart-total'].textContent,'50 L');
 assert.equal(nodes['flight-fuel-chart-duration'].textContent,'90 min de vuelo');
 assert.match(nodes['flight-fuel-chart-svg'].innerHTML,/<path d="M/);
 assert.match(nodes['flight-fuel-chart-svg'].attrs['aria-label'],/90 minutos/);
 assert.match(nodes['flight-fuel-chart-note'].textContent,/No incluye contingencia, reserva final ni alternativo/);

 renderFuelChart([],null,5);
 assert.equal(nodes['flight-fuel-chart-total'].textContent,'— L');
 assert.match(nodes['flight-fuel-chart-svg'].innerHTML,/Tu curva de consumo aparecerá acá/);
 assert.match(wizard,/id="flight-fuel-chart"/);
 assert.match(wizard,/\$\('flight-fuel-details'\)\?\.textContent\|\|'Pendiente'/);
});

test('all five fuel inputs show permanent, working adjustment arrows while remaining manually editable', () => {
 const ids=['flight-fuel-burn','flight-fuel-available','flight-fuel-start','flight-fuel-contingency','flight-fuel-reserve'];
 for(const id of ids) assert.match(wizard, new RegExp("\\['"+id+"','"));
 assert.match(wizard, /flight-fuel-stepper/);
 assert.match(wizard, /data-fuel-direction="1"/);
 assert.match(wizard, /data-fuel-direction="-1"/);
 assert.match(wizard, /aria-label="Aumentar /);
 assert.match(wizard, /aria-label="Disminuir /);
 assert.match(wizard, /input\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
 const start=wizard.indexOf('function adjustFuelValue(');
 const end=wizard.indexOf('\nfuel.querySelectorAll(\'.flight-fuel-stepper button\')',start);
 assert.ok(start>0&&end>start);
 const fn=vm.runInNewContext(wizard.slice(start,end)+'\nadjustFuelValue;', {Event:class{constructor(type,options){this.type=type;this.bubbles=options.bubbles;}}});
 const input={value:'5',max:'10000',events:[],dispatchEvent(event){this.events.push(event);}};
 fn(input,1,1);
 assert.equal(input.value,'6');
 fn(input,-1,1);
 assert.equal(input.value,'5');
 input.value='45';
 fn(input,1,5);
 assert.equal(input.value,'50');
 input.value='0';
 fn(input,-1,5);
 assert.equal(input.value,'0');
 assert.equal(input.events.length,4);
 assert.equal(input.events.every(event=>event.type==='input'&&event.bubbles),true);
});

test('the shared footer does not link out to FlightPrep NAV from any wizard stage', () => {
 assert.doesNotMatch(html, /href="flightprep-nav\.html"/);
 assert.doesNotMatch(html, /abrir FlightPrep NAV en Utilidades/);
 assert.match(html, /<footer class="sitefoot">/);
});

test('meteorology renders the calculations shortcut once, under the evaluation', () => {
 assert.match(wizard, /for\(const section of \[\$\('ops-boletines'\)\]\.filter\(Boolean\)\)/);
 assert.doesNotMatch(wizard, /\[weather,\$\('ops-boletines'\)\]/);
 assert.match(wizard, /section\.append\(row\)/);
 assert.match(wizard, /await go\(3\)/);
});

test('calculations provide a bottom shortcut that saves and opens the essential report', () => {
 assert.match(wizard, /essentialButton\.textContent='Guardar y continuar al informe esencial →'/);
 assert.match(wizard, /essentialButton\.type='button'/);
 assert.match(wizard, /await go\(4\)/);
 assert.match(wizard, /essentialRow\.append\(essentialButton,essentialFeedback\);nav\.append\(essentialRow\)/);
});

test('magnetic courses above 360° are displayed as three-digit bearings', () => {
 const from = wizard.indexOf('const fmtBearing=');
 const to = wizard.indexOf('\nfunction fuelRemainder(', from);
 assert.ok(from > 0 && to > from);
 const bearing = vm.runInNewContext(wizard.slice(from,to)+'\nfmtBearing;');
 assert.equal(bearing(361.8), '001,8');
 assert.equal(bearing(332.8), '332,8');
 assert.equal(bearing(359.96), '000,0');
});

test('the magnetic heading follows the magnetic track, before NM, GS, ETE, ETA and fuel', () => {
 const header = wizard.slice(wizard.indexOf('const columns=['), wizard.indexOf('columns.forEach'));
 assert.match(header, /\['DM °M','Derrota magnética'\],\['RM °M'/);
 assert.ok(header.indexOf("['RM °M'") < header.indexOf("['NM'"));
 assert.ok(header.indexOf("['NM'") < header.indexOf("['GS kt'"));
 assert.ok(header.indexOf("['GS kt'") < header.indexOf("['ETE min'"));
 assert.ok(header.indexOf("['ETE min'") < header.indexOf("['ETA UTC'"));
 assert.ok(header.indexOf("['ETA UTC'") < header.indexOf("['Cons. L'"));
 const values = wizard.slice(wizard.indexOf('const vals=[r.name,fmtBearing(r.course_true_deg)'), wizard.indexOf('const row=document.createElement', wizard.indexOf('const vals=[r.name,fmtBearing(r.course_true_deg)')));
 assert.match(values, /fmtBearing\(r.magnetic_track_deg\),fmtBearing\(r.heading_magnetic_deg\),fmt\(r.distance_nm\),fmt\(r.gs_kt\)/);
 assert.match(wizard, /flight-magnetic-heading/);
});

test('PRONAREA gate checks validity without throwing when a bulletin is present', () => {
 const source = wizard.slice(wizard.indexOf('function gate(){'), wizard.indexOf('\nwindow.GDV_FLIGHT_PRONAREA_GATE'));
 const nodes = {'flight-pronarea':{value:'PRONAREA FIR EZE VALIDEZ 0416'},'flight-pronarea-confirm':{checked:true}};
 const context = {
  $: id => nodes[id],
  date: () => new Date('2026-10-15T12:00:00Z'),
  eta: () => '2026-10-15T13:00:00.000Z',
  document: {querySelectorAll: () => [{value:'SAEF'}]},
  window: {GDV_PRONAREA_WIND: {resolveWindow: () => ({start:Date.parse('2026-10-15T04:00:00Z'),end:Date.parse('2026-10-15T16:00:00Z')})}},
 };
 const gate = vm.runInNewContext(source+'\ngate;', context);
 assert.equal(gate().ok, true);
 context.eta = () => '2026-10-15T17:00:00.000Z';
 assert.match(gate().message, /no cubre el arribo estimado/);
});

test('a missing PRONAREA never traps the pilot in the calculations stage', () => {
 const source = wizard.slice(wizard.indexOf('function valid(){'), wizard.indexOf('\nfunction pack(){'));
 const context = {
  step: 3,
  $: id => ({value: id==='flight-fuel-burn'?'28':'80'}),
  gate: () => {throw new Error('Gate must only control AI, not stage navigation');},
  notify: () => {},
 };
 const valid = vm.runInNewContext(source+'\nvalid;', context);
 assert.equal(valid(), true);
});

test('alternate fuel is not estimated and the remaining fuel still includes contingency and reserve', () => {
 assert.doesNotMatch(wizard, /flight-fuel-alternate-gs|altNm|altFuel|Alternativo directo/);
 assert.match(wizard, /Remanente para alternativo \(sin calcular consumo\)/);
 const from = wizard.indexOf('function fuelRemainder(');
 const to = wizard.indexOf('\nfunction calcFuel(', from);
 assert.ok(from > 0 && to > from);
 const fn = vm.runInNewContext(wizard.slice(from, to) + '\nfuelRemainder;');
 assert.ok(Math.abs(fn(85, 43.4, 5, 4.34, 16.5).remainder - 15.76) < 1e-9);
 assert.equal(fn(60, 43.4, 5, 4.34, 16.5).remainder < 0, true);
 assert.equal(fn(85, null, 5, 4.34, 16.5).planned, null);
});
