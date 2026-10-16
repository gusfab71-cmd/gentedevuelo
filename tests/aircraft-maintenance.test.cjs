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
run(`S.ac=${JSON.stringify(oldBackup.ac)};S.sel='a1'`);
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

assert.match(run('tabK()'), /El TBO no es universal/);
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

console.log('PASS: uso, respaldo, bitácora, novedades, aceite 50/25 h, anual/100 h y TBO documentado');
