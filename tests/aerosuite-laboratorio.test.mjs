// Laboratorio offline: solo datos ficticios, motores DEMO en memoria.
// No se conecta a Supabase, Vercel, Auth ni sistemas reales.
import test from 'node:test';
import assert from 'node:assert/strict';
import {requestStudentBooking,takeStudentBooking,studentPortalProjection,instructorPortalProjection} from '../utilidades/gestion-aeronautica/src/portales.js';
import {closeFlight} from '../utilidades/gestion-aeronautica/src/operacion.js';
import {buildLesson,submitLesson,reviewLesson} from '../utilidades/gestion-aeronautica/src/formacion.js';
import {flightActivityProjection} from '../utilidades/gestion-aeronautica/src/vuelos.js';
import {makeLogbookDetail,logbookSummary} from '../utilidades/gestion-aeronautica/src/libro-vuelo.js';
import {createRavDraft,submitRavForReview,institutionalReviewRav,ravFlightTotals} from '../utilidades/gestion-aeronautica/src/rav-institucional.js';
import {cents,makeFinanceEntry,financeBalances} from '../utilidades/gestion-aeronautica/src/finanzas.js';

const DATE='2026-10-15';
const institution='ESCUELA-FICTICIA-UNO';
const student={id:'ALUMNO-FICTICIO-01',kind:'alumno',licenseUntil:'2028-01-01',cmaUntil:'2028-01-01',institution};
const otherStudent={...student,id:'ALUMNO-FICTICIO-02'};
const instructor={id:'INSTRUCTOR-FICTICIO-01',kind:'instructor',licenseUntil:'2028-01-01',cmaUntil:'2028-01-01',institution};
const fleet=[{id:'LV-TST',model:'Cessna 152 (simulación)',blocked:false,insuranceUntil:'2028-01-01',rate:100000}];
const members=[student,otherStudent,instructor];
const request={date:DATE,start:'08:30',end:'10:00',type:'flight',aircraft:'LV-TST',pilot:student.id};
const reserve=()=>requestStudentBooking(request,student,[],fleet);
const assigned=()=>{const b=reserve();return takeStudentBooking(b,instructor,[b],members,undefined,fleet);};
function flown(){
 const booking=assigned();
 const flight=closeFlight({from:'SAAV',to:'SAAV',start:'11:30',end:'12:30',
  tachStart:1000,tachEnd:1000.8,landings:2},booking,[],fleet,members);
 return {booking,flight};
}

test('Aislamiento: identificadores ficticios y ausencia de credenciales administrativas',()=>{
 assert.match(institution,/^ESCUELA-FICTICIA/);
 for(const person of members)assert.match(person.id,/FICTICI[OA]/);
 assert.equal(fleet[0].id,'LV-TST');
 assert.ok(!process.env.SUPABASE_SERVICE_ROLE_KEY,'No usar credenciales administrativas');
 assert.ok(!process.env.SUPABASE_DB_URL,'No conectar a bases externas');
});
test('Turnera DEMO: reserva 90 minutos, duplicidad y aeronave bloqueada',()=>{
 const requested=reserve();
 assert.equal(requested.status,'solicitada');
 assert.equal(requested.aircraft,'LV-TST');
 assert.throws(()=>requestStudentBooking(request,student,[requested],fleet),/otra actividad reservada/i);
 assert.throws(()=>requestStudentBooking({...request,end:'09:59'},student,[],fleet),/90 minutos/i);
 assert.throws(()=>requestStudentBooking(request,student,[],[{...fleet[0],blocked:true}]),/no disponible/i);
 assert.throws(()=>requestStudentBooking({...request,pilot:otherStudent.id},student,[],fleet),/pertenecer al alumno/i);
 assert.throws(()=>requestStudentBooking({...request,pilot:otherStudent.id},otherStudent,[requested],fleet),/recurso ya tiene un turno/i);
});
test('Instructor DEMO: solo asignaciones autorizadas, sin duplicar la toma',()=>{
 const original=reserve();
 assert.throws(()=>takeStudentBooking(original,{...instructor,id:'INTRUSO'},[original],members,undefined,fleet),/autorizado/i);
 const confirmed=takeStudentBooking(original,instructor,[original],members,undefined,fleet);
 assert.equal(confirmed.status,'confirmada');
 assert.equal(confirmed.instructor,instructor.id);
 assert.equal(instructorPortalProjection(instructor.id,[confirmed],[]).assigned.length,1);
 assert.equal(instructorPortalProjection('INSTRUCTOR-AJENO',[confirmed],[]).assigned.length,0);
 assert.throws(()=>takeStudentBooking(confirmed,instructor,[confirmed],members,undefined,fleet),/pendientes/i);
});
test('Vuelo DEMO: minutos y aterrizajes, sin doble cierre',()=>{
 const {booking,flight}=flown();
 assert.equal(flight.reservationId,booking.id);
 assert.equal(flight.operationType,'instruction');
 assert.equal(flight.aircraft,'LV-TST');
 assert.equal(flight.blockMinutes,60);
 assert.equal(flight.landings,2);
 assert.throws(()=>closeFlight({from:'SAAV',to:'SAAV',start:'11:30',end:'12:30',
  tachStart:1000,tachEnd:1001,landings:1},booking,[flight],fleet,members),/ya tiene un vuelo cerrado/i);
 assert.equal(flightActivityProjection(student.id,[flight]).blockMinutes,60);
});
test('Informe DEMO: un borrador no es visible para el alumno; aprobado sí',()=>{
 const {booking,flight}=flown();
 const draft=buildLesson({studentId:student.id,instructorId:instructor.id,bookingId:booking.id,
  flightId:flight.id,date:DATE,minutes:60,aircraft:flight.aircraft,
  topics:'Circuitos de tránsito',evolution:'Progreso simulado',nextGoal:'Aterrizajes',
  assessment:'developing'},[student],[instructor],[flight],[],[booking]);
 assert.equal(studentPortalProjection(student.id,[booking],[flight],[draft]).practices.length,0);
 const submitted=submitLesson(draft,instructor.id);
 assert.equal(studentPortalProjection(student.id,[booking],[flight],[submitted]).practices.length,0);
 assert.throws(()=>reviewLesson(submitted,'DIRECTOR-FICTICIO','returned',''),/observación/i);
 const approved=reviewLesson(submitted,'DIRECTOR-FICTICIO','approved','Revisión ficticia');
 assert.equal(studentPortalProjection(student.id,[booking],[flight],[approved]).practices.length,1);
 assert.equal(studentPortalProjection(otherStudent.id,[booking],[flight],[approved]).practices.length,0);
});
test('Libro DEMO: 60 minutos, borrador no certificado',()=>{
 const {booking,flight}=flown();
 const detail=makeLogbookDetail({purpose:'instruccion',recordedFlightMinutes:60,
  categoryMinutes:{airportDayPilot:60},aircraftMake:'Cessna',aircraftModel:'152',
  license:'SIMULADA NO VÁLIDA',aircraftClass:'monomotor',powerHp:'110'},
  booking,flight,student,fleet);
 assert.equal(detail.recordedFlightMinutes,60);
 assert.equal(detail.status,'borrador_no_certificado');
 assert.equal(detail.registration,'LV-TST');
 assert.equal(logbookSummary(student.id,[{...flight,logbook:detail}]).minutes,60);
});
test('RAV DEMO: un mismo vuelo una sola vez y ninguna certificación real',()=>{
 const {flight}=flown();
 const draft=createRavDraft({studentId:student.id,dateFrom:DATE,dateTo:DATE},[flight],[student]);
 assert.equal(draft.status,'draft');
 assert.equal(draft.certification,null);
 assert.equal(ravFlightTotals(draft,[flight]).minutes,60);
 assert.throws(()=>createRavDraft({studentId:student.id,dateFrom:DATE,dateTo:DATE},[flight],[student],[draft]),/otro RAV/i);
 const reviewed=institutionalReviewRav(submitRavForReview(draft),
  {actor:'DIRECTOR-FICTICIO',role:'director',decision:'reviewed'});
 assert.equal(reviewed.status,'reviewed');
 assert.equal(reviewed.certification,null);
});
test('Caja DEMO: ingresos y transferencia ficticia; fondos insuficientes',()=>{
 const opening=makeFinanceEntry({kind:'apertura',account:'caja_general',date:DATE,
  amount:'100000',concept:'Saldo ficticio inicial'},[]);
 const income=makeFinanceEntry({kind:'ingreso',account:'caja_general',area:'escuela',
  category:'Horas de vuelo e instrucción',date:DATE,amount:'50000',concept:'Vuelo ficticio'},[opening]);
 const transfer=makeFinanceEntry({kind:'transferencia',account:'caja_general',
  destination:'banco',date:DATE,amount:'25000',concept:'Movimiento de laboratorio'},[opening,income]);
 const b=financeBalances([opening,income,transfer]);
 assert.equal(b.caja_general,cents('125000'));
 assert.equal(b.banco,cents('25000'));
 assert.equal(b.caja_chica,0);
 assert.throws(()=>makeFinanceEntry({kind:'egreso',account:'caja_chica',date:DATE,
  area:'escuela',category:'Combustible y lubricantes',amount:'1',concept:'Gasto ficticio'},
  [opening,income,transfer]),/Fondos insuficientes/i);
});

// Requerimientos de fase 2: TODO no equivale a aprobado.
test.todo('E2E real: cinco roles autenticados y RLS en Supabase aislado');
test.todo('E2E real: RPC turnera, concurrencia, PPA y PCA verificados');
test.todo('E2E real: cobros y packs idempotentes y conciliación cruzada');
test.todo('E2E real: mantenimiento por matrícula, documentos y control técnico');
test.todo('E2E real: navegadores Playwright con entorno completamente separado');
