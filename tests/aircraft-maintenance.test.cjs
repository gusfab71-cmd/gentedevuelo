const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../utilidades/mantenimiento-aeronaves.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const script = scripts.find(s => s.includes('const TABS='));
assert.ok(script, 'Se debe encontrar la lógica de mantenimiento');

const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '' });
  return nodes.get(id);
};
const alerts = [];
const sandbox = vm.createContext({
  document: { getElementById: node },
  window: {},
  crypto: { randomUUID: (() => { let i = 0; return () => 'id-' + ++i; })() },
  alert: message => alerts.push(message),
  confirm: () => true,
  console
});
vm.runInContext(script, sandbox, { filename: 'mantenimiento-aeronaves.html' });
const run = expression => vm.runInContext(expression, sandbox);

const oldBackup = {ac:[{id:'a1',reg:'LV-ABC',type:'C150',h:200,c:300}],sv:[],ct:[],lg:[],rc:[]};
assert.equal(run(`validData(${JSON.stringify(oldBackup)})`), true, 'Los respaldos anteriores deben continuar siendo válidos');
assert.match(run('tabA()'), /1 · Crear aeronave/, 'El primer ingreso debe mostrar el formulario');
run(`S.ac=${JSON.stringify(oldBackup.ac)};S.sel='a1'`);
assert.doesNotMatch(run('tabA()'), /1 · Crear aeronave/, 'Después de tener una aeronave, ocultar el formulario 1');
assert.doesNotMatch(run('tabA()'), /id="a_r"/, 'No debe permanecer el formulario oculto solamente por CSS');
assert.match(run('tabA()'), /Agregar otra aeronave/, 'Debe existir una acción para agregar otra aeronave');
assert.equal(run('opUse(A())'), 'unknown');
assert.match(run('regimeNotice(A())'), /Definí el uso/);

run(`A().operation={use:'private',compensation:'unknown',program:'Manual vigente'}`);
assert.doesNotMatch(run('tabX()'), /No se registró seguimiento de 100 horas/);
run(`A().operation={use:'mixed',compensation:'yes',program:'Manual vigente'}`);
assert.match(run('tabX()'), /No se registró seguimiento de 100 horas/);
assert.match(run('regimeNotice(A())'), /91\.409\(b\)/);

node('l_d').value='2026-10-01';node('l_p').value='Piloto';node('l_f').value='SABE';node('l_t').value='SADP';
node('l_h').value='1.2';node('l_c').value='2';node('l_use').value='instruction';
node('l_instructor').value='Instructor';node('l_n').value='Doble comando';
run('addLog()');
assert.equal(run('S.lg[0].use'), 'instruction');
assert.equal(run('S.lg[0].instructor'), 'Instructor');
assert.equal(run('S.ac[0].h'), 201.2, 'No deben separarse los contadores por modalidad');

node('dx_date').value='2026-10-01';node('dx_component').value='m';node('dx_use').value='instruction';
node('dx_who').value='Instructor';node('dx_desc').value='Vibración informada';
run('addDiscrepancy()');
assert.equal(run('S.dx.length'), 1);
assert.equal(run('S.dx[0].status'), 'open');
const id = run('S.dx[0].id');
node('dx_ref_' + id).value='';node('dx_tech_' + id).value='Técnico';node('dx_closed_' + id).value='2026-10-02';
run(`closeDiscrepancy('${id}')`);
assert.equal(run('S.dx[0].status'), 'open', 'La novedad no se cierra sin constancia');
node('dx_ref_' + id).value='Libreta N° 123';
run(`closeDiscrepancy('${id}')`);
assert.equal(run('S.dx[0].status'), 'closed');
assert.equal(run('S.dx[0].reference'), 'Libreta N° 123');

assert.equal(alerts.length, 1, 'Solo debe alertarse por falta de referencia documental');

run("S.sv.push({id:'sv1',ac:'a1',name:'Motor'})");
node('c_s').value='sv1';node('c_oilkind').value='full';
for(const id of ['c_n','c_k','c_ih','c_ic','c_im','c_ld','c_lh','c_lc','c_basis','c_lastdoc'])node(id).value='';
run('prefillOilChange()');
assert.equal(node('c_ih').value, '50');
assert.equal(node('c_im').value, '4');
assert.equal(node('c_k').value, 'm');
assert.equal(node('c_ld').value, '', 'El preset no debe inventar un mantenimiento realizado');
run('addCt()');
assert.equal(run('S.ct.length'), 0, 'No se debe crear un cambio de aceite sin asiento original');
node('c_ld').value='2026-09-01';node('c_lh').value='180';node('c_lc').value='200';
node('c_basis').value='Manual aplicable / SB 480F verificada';node('c_lastdoc').value='Libreta motor 456';
run('addCt()');
assert.equal(run('S.ct[0].ivH'), 50);
assert.equal(run('S.ct[0].lastRef'), 'Libreta motor 456');
node('c_oilkind').value='screen';run('prefillOilChange()');
assert.equal(node('c_ih').value, '25');
assert.equal(run('S.ct.length'), 1, 'Cambiar la plantilla no guarda controles automáticamente');

assert.match(run('tabX()'), /12 meses o 100 horas/);
assert.match(run('tabX()'), /No se registró seguimiento de la inspección anual/);
run(`S.ip=[
 {id:'annual1',ac:'a1',kind:'anual',title:'Anual',ref:'RAAC',months:12,hours:0,applies:'yes'},
 {id:'hour100',ac:'a1',kind:'cien',title:'100 horas',ref:'RAAC',months:0,hours:100,applies:'yes'}
];S.ie=[{id:'insp1',ac:'a1',planId:'annual1',date:'2026-09-01',h:180,result:'approved'}]`);
assert.equal(run('inspectionState(S.ip[0],A()).nextDate'), '2027-09-01', 'La anual vence a los 12 meses');
assert.equal(run('inspectionState(S.ip[1],A()).nextH'), 280, 'La anual aprobada también cuenta para las siguientes 100 horas');
assert.match(run('tabX()'), /Última anual aprobada \(válida para 100 h\)/);
run('A().h=281');
assert.equal(run('inspectionState(S.ip[1],A()).label'), 'REVISAR VENCIMIENTO');
assert.notEqual(run('inspectionState(S.ip[0],A()).label'), 'REVISAR VENCIMIENTO', 'El límite por horas es independiente del calendario anual');
run(`S.ie.push({id:'insp2',ac:'a1',planId:'hour100',date:'2026-10-02',h:275,result:'approved'})`);
assert.equal(run('inspectionState(S.ip[1],A()).nextH'), 375);
assert.equal(run('inspectionState(S.ip[0],A()).nextDate'), '2027-09-01', 'La inspección de 100 h no reemplaza la anual');

assert.match(run('tabK()'), /La estructura no tiene un TBO general universal/);
assert.match(run('tabK()'), /recorrida propia, independiente del TBO del motor/);
for(const id of ['m_mod','m_ser','m_h','m_c','m_tso','m_tbo','m_y','m_oh','m_tboref'])node(id).value='';
node('m_mod').value='O-320';node('m_ser').value='M-123';node('m_h').value='281';node('m_c').value='320';
node('m_tso').value='100';node('m_tbo').value='1800';node('m_y').value='12';node('m_oh').value='2026-02-02';
run("setComp('m')");
assert.equal(run('CP(A()).m.tbo'), 0, 'No se permite TBO sin referencia al modelo y documento técnico');
node('m_tboref').value='Lycoming SI 1009BF / programa validado';
run("setComp('m')");
assert.equal(run('CP(A()).m.tbo'), 1800);
assert.equal(run('CP(A()).m.tboY'), 12);
assert.equal(run('tbos(A())[0].basis'), 'Lycoming SI 1009BF / programa validado');
assert.equal(run('tbos(A())[0].ivM'), 144, 'El TBO incorpora el calendario registrado');

assert.match(run('tabS()'), /Controles por componente/);
assert.match(run('tabS()'), /SIN CONSTANCIA/);
run("prefillComponentControl('structure')");
assert.equal(node('c_k').value, 'f');
assert.equal(node('c_s').value, 'new:f');
assert.equal(node('c_ih').value, '0', 'La estructura no recibe una cantidad de horas inventada');
assert.equal(node('c_ld').value, '', 'La plantilla no acredita una inspección previa');
node('c_basis').value='Programa estructural C150 vigente';
run('addCt()');
assert.equal(run('S.ct.length'), 1, 'No se puede guardar sin intervalos del manual');
node('c_ih').value='100';node('c_im').value='12';
run('addCt()');
assert.equal(run('S.ct.length'), 2);
assert.equal(run("S.sv.find(s=>s.id===S.ct[1].sv).name"), 'Estructura');
assert.equal(run('S.ct[1].lastRef'), '', 'Un control se puede planificar sin constancia, pero no dar por cumplido');
assert.equal(run('info(S.ct[1],A()).st'), 3);
assert.equal(run('info(S.ct[1],A()).by'), 'sin constancia');
assert.match(run('tabP()'), /No se calculan vencimientos ficticios/);

run("prefillComponentControl('propeller')");
assert.equal(node('c_k').value, 'p');
assert.equal(node('c_s').value, 'new:p');
assert.equal(node('c_ih').value, '0', 'La hélice no hereda el intervalo del motor');
node('c_ih').value='200';node('c_im').value='6';
node('c_basis').value='Manual de hélice / programa aprobado';
node('c_ld').value='2026-09-10';node('c_lh').value='190';node('c_lc').value='200';node('c_lastdoc').value='Libreta hélice 777';
run('addCt()');
assert.equal(run('S.ct[2].cp'), 'p');
assert.equal(run("S.sv.find(s=>s.id===S.ct[2].sv).name"), 'Hélice');
assert.equal(run('S.ct[2].lastRef'), 'Libreta hélice 777');
assert.equal(run('info(S.ct[2],A()).st'), 0);
assert.equal(run('info(S.ct[2],A()).by'), 'calendario', 'Se respeta el primer límite aplicable para la hélice');

for(const id of ['p_mod','p_ser','p_h','p_c','p_tso','p_tbo','p_y','p_oh','p_tboref'])node(id).value='';
node('p_mod').value='Hélice modelo propio';node('p_ser').value='P-123';node('p_h').value='201.2';
node('p_c').value='302';node('p_tso').value='50';node('p_tbo').value='1500';node('p_y').value='6';node('p_oh').value='2026-09-10';
node('p_tboref').value='Manual y boletín del fabricante de la hélice';
run("setComp('p')");
assert.equal(run('CP(A()).p.tbo'), 1500, 'La recorrida de hélice tiene su propio TBO');
assert.equal(run('CP(A()).m.tbo'), 1800, 'No se modifica el TBO de motor');
assert.equal(run("tbos(A()).find(x=>x.cp==='p').ivM"), 72);

run('showAircraftForm=true');
assert.match(run('tabA()'), /1 · Crear aeronave/, 'La acción permite volver a abrir el formulario');
node('a_r').value='LV-DEF';node('a_t').value='Cessna 172';node('a_use').value='private';
node('a_h').value='1000';node('a_c').value='500';node('a_hm').value='20';node('a_cm').value='20';
run('addAc()');
assert.equal(run('S.ac.length'), 2, 'La segunda aeronave se agrega sin perder la primera');
assert.equal(run('S.sel'), run('S.ac[1].id'), 'La nueva aeronave queda seleccionada');
assert.equal(run('showAircraftForm'), false, 'Crear otra aeronave vuelve a ocultar el formulario');
assert.doesNotMatch(run('tabA()'), /id="a_r"/);
run('S.ac=[];S.sel=null');
assert.match(run('tabA()'), /1 · Crear aeronave/, 'Sin aeronaves, el formulario reaparece automáticamente');

// Los vencimientos por calendario no deben saltar de febrero a marzo al partir del 31 de enero.
const endMonthControl = {id:'control-fecha',cp:'f',ivH:0,ivC:0,ivM:1,lastDate:'2026-01-31',lastRef:'Libreta fuselaje 10'};
const fixtureAircraft = {h:191,c:315,hpm:0,cpm:0};
assert.equal(
  run(`info(${JSON.stringify(endMonthControl)},${JSON.stringify(fixtureAircraft)}).calD`),
  new Date('2026-02-28T00:00:00').getTime(),
  'Un mes desde el 31 de enero vence el último día de febrero'
);

// Sin proyección mensual, el sistema debe alertar si faltan pocas horas o ciclos.
const nearHours = {id:'control-horas',cp:'f',ivH:50,ivC:0,ivM:0,lastDate:'2026-09-01',lastH:150,lastRef:'Libreta fuselaje 11'};
const nearCycles = {id:'control-ciclos',cp:'f',ivH:0,ivC:20,ivM:0,lastDate:'2026-09-01',lastC:300,lastRef:'Libreta fuselaje 12'};
assert.equal(run(`info(${JSON.stringify(nearHours)},${JSON.stringify(fixtureAircraft)}).st`), 1, 'Advertir si faltan 9 horas aunque no exista una proyección');
assert.equal(run(`info(${JSON.stringify(nearCycles)},${JSON.stringify(fixtureAircraft)}).st`), 1, 'Advertir si faltan 5 ciclos aunque no exista una proyección');
assert.equal(run(`info(${JSON.stringify(nearHours)},${JSON.stringify({...fixtureAircraft,h:155})}).st`), 0, 'Sin horizonte y lejos del límite no generar una alerta inventada');

// Guías por modelo: 36 combinaciones (3 aeronaves, 4 tipos de control y 3 componentes).
assert.equal(run('Object.keys(GUIDE_MODELS).length'), 3);
assert.equal(run('Object.keys(GUIDE_PERIODS).length'), 4);
assert.equal(run('Object.keys(GUIDE_COMPONENTS).length'), 3);
assert.equal(run("detectGuideModel('Cessna 150M')"), 'c150');
assert.equal(run("detectGuideModel('C-172SP')"), 'c172');
assert.equal(run("detectGuideModel('Piper PA-11 Cub')"), 'pa11');
assert.equal(run("detectGuideModel('Cessna 182')"), '', 'No sugerir modelo incorrecto');
run("S.ac=[{id:'ref-a',reg:'LV-XXX',type:'Cessna 172N',h:300,c:450,hpm:20,cpm:20}];S.sel='ref-a';S.tab='x'");
assert.doesNotMatch(run('tabX()'), /id="guide_model"/, 'No cargar el selector de plantillas al entrar');
assert.doesNotMatch(run('tabX()'), /class="maint-guide-sheet"/, 'Todas las planillas quedan ocultas por defecto');
assert.match(run('tabX()'), /Configurar inspección reglamentaria \(abrir cuando se necesite\)/);
run('toggleMaintenanceGuides()');
assert.match(run('tabX()'), /id="guide_model"/);
assert.doesNotMatch(run('tabX()'), /class="maint-guide-sheet"/, 'Abrir el catálogo no abre una planilla');
node('guide_model').value='c172';node('guide_period').value='p100';node('guide_component').value='f';
run('showMaintenanceGuide()');
assert.match(run('tabX()'), /class="maint-guide-sheet"/);
assert.match(run('tabX()'), /Rieles y anclajes de asientos/, 'La planilla debe corresponder al modelo elegido');
assert.match(run('tabX()'), /RAAC 43/, 'La referencia normativa debe mostrarse');
assert.equal(run('Object.keys(guideChecked).length'),0,'No marcar controles automáticamente');
run('updateGuideCheck(0,true)');
assert.equal(run('Object.keys(guideChecked).length'),1,'El usuario puede marcar una consulta temporal');
assert.match(node('guide_count').textContent,/1 \/ /);
node('c_n').focus=()=>{};
run('prepareGuideControl(0)');
assert.equal(run('S.tab'),'s', 'Preparar un control lleva a la pestaña correspondiente');
assert.equal(node('c_k').value,'f');
assert.equal(node('c_ih').value,'0', 'No asumir intervalos de inspección');
assert.equal(node('c_basis').value,'','El manual concreto debe consignarse por el usuario');
assert.equal(run('S.ct.length'),3,'Una guía no debe generar un control sin datos confirmados');
run("S.tab='x';S.ac.push({id:'ref-b',reg:'LV-YYY',type:'Piper PA-11',h:100,c:100,hpm:0,cpm:0});S.sel='ref-b'");
assert.doesNotMatch(run('tabX()'), /class="maint-guide-sheet"/,'No mostrar checklist de otra aeronave tras cambiar de matrícula');
run('toggleMaintenanceGuides()');
assert.doesNotMatch(run('tabX()'), /id="guide_model"/,'Cerrar oculta incluso el selector de planillas');

console.log('PASS: formularios condicionales, uso, bitácora, aceite, inspecciones y mantenimiento por componente alertas preventivas y guías por modelo');
