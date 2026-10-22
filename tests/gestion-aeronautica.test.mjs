import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {minutes,validDate,intersects,createReservation,closeFlight,flightTotals,stockMove} from '../utilidades/gestion-aeronautica/src/operacion.js';

assert.equal(minutes('09:30'),570);
assert.throws(()=>minutes('25:61'),/Hora inválida/);
assert.equal(validDate('2026-10-30'),true);
assert.equal(validDate('2026-02-30'),false);
const fleet=[{id:'LV-ABC',model:'Cessna 172',blocked:false,insuranceUntil:'2027-01-01',rate:95000},
 {id:'LV-XYZ',model:'Piper PA-11',blocked:false,insuranceUntil:'2027-01-01',rate:70000}];
const members=[{id:'p1',kind:'piloto',licenseUntil:'2027-01-01',cmaUntil:'2027-01-01'},
 {id:'p2',kind:'alumno',licenseUntil:'2027-01-01',cmaUntil:'2027-01-01'},
 {id:'i1',kind:'instructor',licenseUntil:'2027-01-01',cmaUntil:'2027-01-01'}];
const req={date:'2026-10-30',aircraft:'LV-ABC',pilot:'p1',instructor:'i1',start:'10:00',end:'11:00'};
const reservation=createReservation(req,[],fleet,members);
assert.equal(reservation.status,'confirmada');
assert.ok(reservation.id);
assert.equal(intersects(req,{...req,start:'11:00',end:'12:00'}),false);
assert.throws(()=>createReservation({...req,start:'10:30',end:'11:30'},[reservation],fleet,members),/Conflicto/);
assert.throws(()=>createReservation({...req,aircraft:'LV-XYZ',start:'10:30',end:'11:30'},[reservation],fleet,members),/Conflicto/);
assert.throws(()=>createReservation({...req,pilot:'p2',instructor:''},[],fleet,members),/instructor/);
assert.throws(()=>createReservation(req,[],[{...fleet[0],blocked:true}],members),/bloqueada/);
assert.throws(()=>createReservation(req,[],[{...fleet[0],insuranceUntil:'2026-01-01'}],members),/Seguro/);
assert.throws(()=>createReservation(req,[],fleet,[{...members[0],cmaUntil:'2026-01-01'},members[2]]),/CMA/);
assert.throws(()=>createReservation(req,[],fleet,[members[0],{...members[2],licenseUntil:'2026-01-01'}]),/Instructor/);

const data={from:'SADF',to:'SADF',start:'10:02',end:'11:08',tachStart:'1200.0',tachEnd:'1200.8',landings:2};
const flight=closeFlight(data,reservation,[],fleet);
assert.equal(flight.blockHours,1.1);
assert.equal(flight.tachDifference,0.8);
assert.equal(flight.landings,2);
assert.equal(flight.cost,104500);
assert.throws(()=>closeFlight(data,reservation,[flight],fleet),/ya tiene un vuelo/);
assert.throws(()=>closeFlight({...data,tachEnd:1199.9},reservation,[],fleet),/tacómetro inválidas/);
assert.throws(()=>closeFlight({...data,landings:-1},reservation,[],fleet),/aterrizajes/);
assert.deepEqual(flightTotals([flight],'aircraft'),{'LV-ABC':1.1});
assert.equal(stockMove({qty:20},4,'salida'),16);
assert.equal(stockMove({qty:20},4,'entrada'),24);
assert.throws(()=>stockMove({qty:20},25,'salida'),/stock/);

const html=fs.readFileSync(new URL('../utilidades/gestion-aeronautica/index.html',import.meta.url),'utf8');
const matches=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
assert.equal(matches.length,1);
const script=matches[0][1].replace(/^\s*import[^\n]*\n/,'');
new vm.Script(script,{filename:'gestion-aeronautica/index.html'});
assert.match(html,/site_admins/,'Primera versión es solo administrador');
assert.match(html,/Acceso exclusivo del administrador/);
assert.match(html,/Datos ficticios/);
assert.match(html,/No hay reservas multiusuario reales/);
assert.match(html,/RAV oficial/);
for(const label of ['Agenda y reservas','Vuelos y RAV','Aeronaves y mantenimiento','Pilotos y alumnos','Contabilidad y horas','Combustible y aceite','Academia y Simu PPA','Documentos y avisos'])
 assert.ok(html.includes(label),'Falta sección '+label);
console.log('PASS: gestión integrada, fechas, conflictos, cierre idempotente, stock, UX y acceso admin');
