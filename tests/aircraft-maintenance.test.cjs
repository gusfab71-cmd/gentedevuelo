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
console.log('PASS: regímenes privado/mixto, 100 h condicionada, respaldo anterior, bitácora única y novedades documentadas');
