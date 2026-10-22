import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {minutes,validDate,intersects,createReservation,closeFlight,flightTotals,stockMove} from '../utilidades/gestion-aeronautica/src/operacion.js';
import {ASSESSMENTS,LESSON_STATUS,buildLesson,reviseLesson,submitLesson,closeLessonByInstructor,reviewLesson,studentTimeline,studentSummary} from '../utilidades/gestion-aeronautica/src/formacion.js';

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
const script=matches[0][1].replace(/^(?:\s*import[^\n]*\n)+/,'');
new vm.Script(script,{filename:'gestion-aeronautica/index.html'});
assert.match(html,/site_admins/,'Primera versión es solo administrador');
assert.match(html,/Acceso exclusivo del administrador/);
assert.match(html,/Datos ficticios/);
assert.match(html,/No hay reservas multiusuario reales/);
assert.match(html,/RAV oficial/);
for(const label of ['Agenda y reservas','Vuelos y RAV','Aeronaves y mantenimiento','Pilotos y alumnos','Contabilidad y horas','Combustible y aceite','Academia y Simu PPA','Documentos y avisos'])
 assert.ok(html.includes(label),'Falta sección '+label);

assert.equal(ASSESSMENTS.developing,'En práctica');
assert.equal(LESSON_STATUS.approved,'Revisada por jefe de instructores');
assert.equal(LESSON_STATUS.instructor_closed,'Cerrada por instructor (sin jefatura)');
const sample={studentId:'p2',instructorId:'i1',flightId:'',date:'2026-10-20',minutes:60,
 aircraft:'LV-ABC',topics:'Virajes, despegues y aterrizajes',
 evolution:'Mayor precisión en las maniobras',difficulties:'Coordinación de alabeo',
 nextGoal:'Mejorar el control del avión en viento cruzado',assessment:'developing'};
const lesson=buildLesson(sample,members,members,[],[]);
assert.equal(lesson.status,'draft');
assert.equal(lesson.history.length,1);
assert.equal(lesson.hours,0,'Las clases teóricas no inventan horas de vuelo');
assert.throws(()=>buildLesson({...sample,studentId:'i1'},members,members,[],[]),/alumno/);
assert.throws(()=>buildLesson({...sample,instructorId:'p1'},members,members,[],[]),/instructor/);
assert.throws(()=>buildLesson({...sample,assessment:'unknown'},members,members,[],[]),/evolución/);
assert.throws(()=>buildLesson({...sample,nextGoal:''},members,members,[],[]),/objetivo/);
assert.throws(()=>buildLesson({...sample,date:'2026-02-30'},members,members,[],[]),/Fecha/);
assert.throws(()=>reviewLesson(lesson,'chief-demo','approved',''),/pendientes/);
assert.throws(()=>submitLesson(lesson,'other-instructor'),/Solo el instructor/);
const submitted=submitLesson(lesson,'i1');
assert.equal(submitted.status,'submitted');
assert.equal(submitted.history[1].action,'submitted');
assert.match(submitted.history[1].detail,/Mayor precisión/,'Se conserva instantánea de la ficha enviada');
assert.throws(()=>reviseLesson(submitted,sample,'i1'),/no se puede editar/);
assert.throws(()=>reviewLesson(submitted,'chief-demo','returned',''),/observación/);
const returned=reviewLesson(submitted,'chief-demo','returned','Reforzar inspección previa al vuelo');
assert.equal(returned.status,'returned');
assert.equal(returned.chiefReview.reason,'Reforzar inspección previa al vuelo');
const revised=reviseLesson(returned,{...sample,evolution:'Mejoró maniobras y prevuelo'},'i1');
assert.equal(revised.status,'draft');
assert.equal(revised.revision,2);
assert.equal(revised.chiefReview,null);
assert.equal(revised.history.length,4);
const sentAgain=submitLesson(revised,'i1');
assert.equal(sentAgain.revision,2);
const approved=reviewLesson(sentAgain,'chief-demo','approved','');
assert.equal(approved.status,'approved');
assert.equal(approved.history.length,6);
assert.equal(approved.history[5].actor,'chief-demo');
assert.equal(approved.chiefReview.revision,2);
assert.throws(()=>reviseLesson(approved,sample,'i1'),/no se puede editar/);
assert.throws(()=>reviewLesson(approved,'chief-demo','approved',''),/pendientes/);
assert.equal(lesson.status,'draft','Las revisiones no mutan el historial previo');
const s1=studentSummary([approved,lesson],'p2');
assert.equal(s1.lessons,2);
assert.equal(s1.approved,1);
assert.equal(s1.trainingMinutes,120);
assert.equal(s1.flightBlockHours,0);
assert.equal(studentTimeline([approved,lesson],'p1').length,0);
const linkedFlight={...flight,id:'flight-class-1',pilot:'p2',instructor:'i1',date:'2026-10-20'};
const classWithFlight=buildLesson({...sample,flightId:'flight-class-1'},members,members,[linkedFlight],[]);
assert.equal(classWithFlight.hours,1.1,'Las horas vinculadas provienen de un vuelo ya cerrado');
assert.throws(()=>buildLesson({...sample,flightId:'flight-class-1'},members,members,[linkedFlight],[classWithFlight]),/ya tiene una ficha/);
assert.throws(()=>buildLesson({...sample,flightId:'flight-class-1',instructorId:'p1'},members,members,[linkedFlight],[]),/instructor/);
assert.throws(()=>buildLesson({...sample,flightId:'flight-class-1',date:'2026-10-21'},members,members,[linkedFlight],[]),/no coinciden/);
assert.equal(studentSummary([classWithFlight],'p2').flightBlockHours,1.1);
for(const term of ['Legajo de evolución del alumno','Jefatura de Instructores','Evolución respecto de clases anteriores','Enviar al jefe de instructores','Devolver con observaciones'])
 assert.ok(html.includes(term),'Falta función visual: '+term);
assert.match(html,/if\(tab==='personas'\)wireTraining\(\)/);
assert.match(html,/Solo administrador|Acceso exclusivo del administrador/);
console.log('PASS: legajo alumno, evaluación de instructor, versiones, aprobación/observaciones de jefatura y vínculos de vuelo');


const withoutChief={institutionType:'non_ciac',reviewMode:'instructor'};
const independent=closeLessonByInstructor(lesson,'i1',withoutChief);
assert.equal(independent.status,'instructor_closed','Escuela sin jefe puede cerrar ficha por instructor');
assert.equal(independent.closedBy,'i1');
assert.equal(independent.chiefReview,null);
assert.equal(independent.history.at(-1).action,'instructor_closed');
assert.match(independent.history.at(-1).detail,/Mayor precisión/,'Se archiva instantánea final del instructor');
assert.equal(studentSummary([independent],'p2').instructorClosed,1);
assert.throws(()=>closeLessonByInstructor(lesson,'other',withoutChief),/instructor responsable/);
assert.throws(()=>closeLessonByInstructor(submitted,'i1',withoutChief),/borrador/);
assert.throws(()=>closeLessonByInstructor(independent,'i1',withoutChief),/borrador/);
assert.throws(()=>reviseLesson(independent,sample,'i1'),/no se puede editar/);
assert.throws(()=>closeLessonByInstructor(lesson,'i1',{institutionType:'ciac',reviewMode:'instructor'}),/no CIAC/);
assert.throws(()=>closeLessonByInstructor(lesson,'i1',{institutionType:'ciac',reviewMode:'chief'}),/no CIAC/);
assert.throws(()=>closeLessonByInstructor(lesson,'i1',{institutionType:'non_ciac',reviewMode:'chief'}),/sin jefatura/);
assert.match(html,/Organización de la instrucción · Demo/);
assert.match(html,/id="trainingInstitutionType"/);
assert.match(html,/id="trainingReviewMode"/);
assert.match(html,/trainingInstitution\.institutionType/);
assert.match(html,/trainingInstitution\.reviewMode/);
assert.match(html,/trainingInstitution\.reviewMode==='chief'\?'Enviar al jefe de instructores':'Cerrar ficha como instructor \(sin jefe\)'/);
assert.match(html,/No se puede omitir jefatura en un CIAC bajo RAAC 141/);
assert.match(html,/Consulta administrativa de formación/);
console.log('PASS: instituciones sin jefatura, bloqueo CIAC y cierre inmutable de instructor');
console.log('PASS: gestión integrada, fechas, conflictos, cierre idempotente, stock, UX y acceso admin');
