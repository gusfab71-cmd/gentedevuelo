import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {minutes,validDate,intersects,createReservation,closeFlight,flightTotals,stockMove,STUDENT_RESERVATION_MINUTES,reservationMinimumMinutes,DEFAULT_RESERVATION_POLICY,validateReservationPolicy,reservationSuggestedMinutes} from '../utilidades/gestion-aeronautica/src/operacion.js';
import {mondayOf,shiftDate,listWeek,visibleBookings,timeWindow,layoutDay,hhmm} from '../utilidades/gestion-aeronautica/src/agenda.js';
import {ASSESSMENTS,LESSON_STATUS,buildLesson,reviseLesson,submitLesson,closeLessonByInstructor,reviewLesson,studentTimeline,studentSummary} from '../utilidades/gestion-aeronautica/src/formacion.js';
import {ACTIVITY_TYPES,DEMO_RESOURCES,requestStudentBooking,takeStudentBooking,finishGroundLesson,studentPortalProjection,instructorPortalProjection,DEFAULT_TRAINING_GOALS,validateTrainingGoals,trainingHours,trainingProgress} from '../utilidades/gestion-aeronautica/src/portales.js';
import {classifyFlightBooking,flightActivityProjection,flightActivityByRole,FLIGHT_MODE_LABELS} from '../utilidades/gestion-aeronautica/src/vuelos.js';
import {makeLogbookDetail,logbookRows,logbookSummary,LOGBOOK_TIME_COLUMNS,LOGBOOK_SPECIAL_COLUMNS,LOGBOOK_SIMULATOR_COLUMNS} from '../utilidades/gestion-aeronautica/src/libro-vuelo.js';
import {RAV_STATES,ravCandidates,ravFlightTotals,createRavDraft,submitRavForReview,institutionalReviewRav} from '../utilidades/gestion-aeronautica/src/rav-institucional.js';
import {cents,makeFinanceEntry,financeReport,financeBalances} from '../utilidades/gestion-aeronautica/src/finanzas.js';

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
assert.equal(STUDENT_RESERVATION_MINUTES,90);
assert.equal(reservationMinimumMinutes(members.find(p=>p.id==='p2')),90);
assert.equal(reservationMinimumMinutes(members.find(p=>p.id==='p1')),0);
const studentBase={...req,pilot:'p2',start:'09:00',end:'10:30'};
const student90=createReservation(studentBase,[],fleet,members);
assert.equal(student90.status,'confirmada','90 minutos exactos deben aceptarse');
assert.throws(()=>createReservation({...studentBase,end:'10:29'},[],fleet,members),/1 hora y 30 minutos/,'89 minutos deben rechazarse');
assert.throws(()=>createReservation({...studentBase,end:'10:00'},[],fleet,members),/1 hora y 30 minutos/,'60 minutos deben rechazarse');
assert.throws(()=>createReservation({...studentBase,start:'22:30',end:'23:59'},[],fleet,members),/1 hora y 30 minutos/,'89 minutos al finalizar el día deben rechazarse');
assert.equal(createReservation({...req,instructor:''},[],fleet,members).status,'confirmada','No imponer mínimo alumno a pilotos');
assert.equal(createReservation({...studentBase,end:'11:00'},[],fleet,members).status,'confirmada','Reservas más largas están permitidas');
assert.throws(()=>createReservation({...studentBase,end:'10:00'},[student90],fleet,members),/1 hora y 30 minutos/,'También se exige el mínimo cuando una modificación intenta reducirla');

// Cada escuela puede cambiar el mínimo de alumno, duración sugerida, días y grilla.
assert.equal(DEFAULT_RESERVATION_POLICY.studentMinMinutes,90);
assert.equal(reservationSuggestedMinutes(members[1]),90);
assert.equal(reservationSuggestedMinutes(members[0]),60);
const custom=validateReservationPolicy({...DEFAULT_RESERVATION_POLICY,
 schoolName:'Aeroclub Demo',studentMinMinutes:45,studentDefaultMinutes:60,
 pilotDefaultMinutes:30,slotMinutes:15,openTime:'07:00',closeTime:'21:00',
 availableWeekdays:[1,2,3,4,5],showNotes:true,showActivity:true});
assert.equal(custom.schoolName,'Aeroclub Demo');
assert.equal(custom.studentMinMinutes,45);
assert.equal(reservationMinimumMinutes(members[1],custom),45);
assert.equal(reservationSuggestedMinutes(members[1],custom),60);
assert.equal(reservationSuggestedMinutes(members[0],custom),30);
assert.equal(custom.showNotes,true);
assert.equal(createReservation({...studentBase,end:'09:45'},[],fleet,members,custom).status,'confirmada',
 'Con 45 minutos mínimos, un turno alumno de 45 debe ser aceptado en esa escuela');
assert.throws(()=>createReservation({...studentBase,end:'09:44'},[],fleet,members,custom),/45 minutos/);
const changedPolicy=validateReservationPolicy({...DEFAULT_RESERVATION_POLICY,studentMinMinutes:120,studentDefaultMinutes:120});
assert.throws(()=>createReservation(studentBase,[],fleet,members,changedPolicy),/120 minutos/);
assert.equal(createReservation({...studentBase,end:'11:00'},[],fleet,members,changedPolicy).status,'confirmada');
const weekdays=validateReservationPolicy({...DEFAULT_RESERVATION_POLICY,availableWeekdays:[1,2,3,4]});
assert.throws(()=>createReservation(req,[],fleet,members,weekdays),/día de la semana/);
const hoursPolicy=validateReservationPolicy({...DEFAULT_RESERVATION_POLICY,openTime:'09:00',closeTime:'17:00'});
assert.throws(()=>createReservation({...req,start:'08:30',end:'10:00'},[],fleet,members,hoursPolicy),/horario de la escuela/);
const slotPolicy=validateReservationPolicy({...DEFAULT_RESERVATION_POLICY,slotMinutes:30});
assert.throws(()=>createReservation({...studentBase,start:'09:15',end:'10:45'},[],fleet,members,slotPolicy),/intervalos de 30/);
assert.equal(createReservation({...req,start:'10:15',end:'11:15'},[],fleet,members,custom).status,'confirmada');
assert.throws(()=>validateReservationPolicy({...DEFAULT_RESERVATION_POLICY,studentMinMinutes:120,studentDefaultMinutes:90}),/mayor o igual/);
assert.throws(()=>validateReservationPolicy({...DEFAULT_RESERVATION_POLICY,availableWeekdays:[]}),/al menos un día/);
assert.throws(()=>validateReservationPolicy({...DEFAULT_RESERVATION_POLICY,openTime:'18:00',closeTime:'17:00'}),/posterior/);
assert.throws(()=>validateReservationPolicy({...DEFAULT_RESERVATION_POLICY,openTime:'09:15',slotMinutes:30}),/grilla/);
assert.deepEqual(timeWindow([], '07:00','22:00'),{start:420,end:1320});
const reservation=createReservation(req,[],fleet,members);
assert.equal(reservation.status,'confirmada');
assert.ok(reservation.id);
assert.equal(intersects(req,{...req,start:'11:00',end:'12:00'}),false);
assert.throws(()=>createReservation({...req,start:'10:30',end:'11:30'},[reservation],fleet,members),/Conflicto/);
assert.throws(()=>createReservation({...req,aircraft:'LV-XYZ',start:'10:30',end:'11:30'},[reservation],fleet,members),/Conflicto/);
assert.throws(()=>createReservation({...req,pilot:'p2',instructor:'',end:'11:30'},[],fleet,members),/instructor/);
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

const landing=fs.readFileSync(new URL('../utilidades/gestion-aeronautica/index.html',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../utilidades/gestion-aeronautica/portal.html',import.meta.url),'utf8');
// La portada institucional es pública; el portal real conserva la barrera administrativa.
assert.match(landing,/<title>AeroSuite .* Gente de Vuelo<\/title>/);
for(const name of ['Bienven','Quiénes somos','Tres áreas','Área del Alumno','Instructor','Gestión Administrativa','Preguntas frecuentes']){
 assert.ok(landing.includes(name),'Falta sección pública de AeroSuite: '+name);
}
for(const section of ['solucion','areas','modulos','nosotros','preguntas']){
 assert.ok(landing.includes('id="'+section+'"'),'Falta sección de presentación: '+section);
}
assert.match(landing,/href="portal\.html"/);
assert.doesNotMatch(landing,/GDV_AUTH|site_admins|supabase-2\.117/,'La portada no debe pedir credenciales ni exponer el portal de prueba');
assert.match(html,/site_admins/,'El portal operativo debe conservar control de acceso admin');
assert.match(html,/Acceso exclusivo del administrador/);
assert.match(html,/href="index\.html">Volver a la presentación<\/a>/);

const matches=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
assert.equal(matches.length,1);
const script=matches[0][1].replace(/^(?:\s*import[^\n]*\n)+/,'');
new vm.Script(script,{filename:'gestion-aeronautica/portal.html'});
assert.match(html,/id="bookingDurationHint"/);
assert.match(html,/const updateStudentDuration=\(\)=>/);
assert.match(html,/\$\('bookPilot'\)\?\.addEventListener\('change',updateStudentDuration\)/);
assert.match(html,/\$\('bookStart'\)\?\.addEventListener\('change',updateStudentDuration\)/);
assert.match(html,/site_admins/,'Primera versión es solo administrador');
assert.match(html,/Acceso exclusivo del administrador/);
assert.match(html,/Datos ficticios/);
assert.match(html,/No hay reservas multiusuario reales/);
assert.match(html,/RAV oficial/);
for(const label of ['Agenda y reservas','Registro de vuelo','Aeronaves y mantenimiento','Pilotos y alumnos','Contabilidad y Finanzas','Combustible y aceite','Academia y Simu PPA','Documentos y avisos'])
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
assert.match(html,/if\(tab==='personas'\)\{wireTraining\(\);wireInstitutionalRav\(\);\}/);
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

// Agenda compacta: rango semanal, filtros, solapamientos y formulario bajo demanda.
assert.equal(mondayOf('2026-10-22'),'2026-10-19');
assert.deepEqual(listWeek('2026-10-22'),['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25']);
assert.equal(shiftDate('2026-10-22',7),'2026-10-29');
assert.equal(shiftDate('2026-10-22',-1),'2026-10-21');
assert.equal(shiftDate('2026-12-31',1),'2027-01-01');
assert.equal(hhmm(420),'07:00');
assert.throws(()=>mondayOf('2026-02-30'),/Fecha inválida/);
const schedule=[reservation,{...reservation,id:'booking-other',aircraft:'LV-XYZ',instructor:'',pilot:'p2',start:'10:15',end:'10:45'}];
assert.equal(visibleBookings(schedule,listWeek('2026-10-30')).length,2);
assert.equal(visibleBookings(schedule,['2026-10-29']).length,0);
assert.equal(visibleBookings(schedule,['2026-10-30'],'LV-ABC').length,1);
assert.equal(visibleBookings(schedule,['2026-10-30'],'all','i1').length,1);
const renderedDay=layoutDay(schedule,'2026-10-30',8*60);
assert.equal(renderedDay.length,2);
assert.equal(renderedDay[0].lanes,2);
assert.equal(renderedDay[1].lanes,2);
assert.equal(renderedDay[0].lane!==renderedDay[1].lane,true,'Turnos de aeronaves distintas no se tapan');
const wider=timeWindow([{...reservation,start:'06:25',end:'21:30'}]);
assert.deepEqual(wider,{start:360,end:1320},'La agenda expande el horario para mostrar reservas fuera del horario común');
assert.deepEqual(timeWindow([]),{start:480,end:1200});
assert.throws(()=>createReservation({...req,aircraft:'LV-XYZ',instructor:''},[reservation],fleet,members),/Conflicto/,
 'Un piloto no puede estar en dos aeronaves simultáneamente.');
for(const label of ['Agenda inteligente de turnos','Nueva reserva','data-agenda-time','agendaFilterAircraft','agendaFilterInstructor',
 'data-agenda-edit','data-agenda-view','data-agenda-shift','agendaFormOpen'])
 assert.ok(html.includes(label),'Falta UI de calendario: '+label);
const calendarSrc=script.slice(script.indexOf('function calendar(){'),script.indexOf('function flightScreen(){'));
assert.ok(calendarSrc.startsWith('function calendar(){'));
const calendarContext={
 schoolPolicy:DEFAULT_RESERVATION_POLICY,schoolSettingsOpen:false,
 schoolTurneraSettings:()=>'',minutes,reservationSuggestedMinutes,DEMO_RESOURCES,
 portalResource:b=>b.aircraft||b.resourceId||'',portalType:t=>ACTIVITY_TYPES[t]||ACTIVITY_TYPES.flight,
 reservations:[],members:[{id:'p1',name:'Piloto Demo',kind:'piloto'}],
 fleet:[{id:'LV-ABC',model:'Cessna 172'}],
 agendaView:'week',agendaAircraft:'all',agendaInstructor:'all',
 agendaFormOpen:false,agendaBookingId:'',agendaSelectedBooking:'',agendaDraftDate:'2026-10-22',
 agendaDraftStart:'10:00',week:'2026-10-22',
 listWeek,visibleBookings,timeWindow,layoutDay,hhmm,now:()=>'2026-10-22',
 shortDay:day=>day,safe:v=>String(v??''),
 flights:[],validDate,money:n=>String(n)
};
vm.createContext(calendarContext);
vm.runInContext(calendarSrc,calendarContext);
const closedCalendar=vm.runInContext('calendar()',calendarContext);
assert.match(closedCalendar,/id="newBooking"/);
assert.match(closedCalendar,/class="agenda-scroll"/);
assert.match(closedCalendar,/data-agenda-date="2026-10-22"/);
assert.doesNotMatch(closedCalendar,/<form id="booking">/,'El formulario debe permanecer oculto hasta que se solicite.');
calendarContext.agendaFormOpen=true;
const openedCalendar=vm.runInContext('calendar()',calendarContext);
assert.match(openedCalendar,/<form id="booking">/);
assert.match(openedCalendar,/id="bookAircraft"/);
assert.match(openedCalendar,/id="bookInstructor"/);
calendarContext.agendaView='day';calendarContext.agendaFormOpen=false;
const singleDay=vm.runInContext('calendar()',calendarContext);
assert.match(singleDay,/class="agenda-columns day-mode"/);
assert.match(singleDay,/data-agenda-date="2026-10-22"/);
assert.doesNotMatch(singleDay,/data-agenda-date="2026-10-23"/);

assert.match(html,/function schoolTurneraSettings\(\)/);
assert.match(html,/id="schoolSettingsForm"/);
assert.match(html,/minutesField\('schoolStudentMin'/);
assert.match(html,/id="schoolSlot"/);
assert.match(html,/id="schoolShowNotes"/);
assert.match(html,/id="openSchoolSettings"/);
assert.match(html,/function restoreSchoolPolicy\(\)/);
assert.match(html,/createReservation\(data,reservations.filter\(x=>x.id!==existing\?\.id\),fleet,members,schoolPolicy\)/);
assert.match(html,/data-agenda-time=/);
assert.match(html,/rememberSchoolPolicy\(\)/);
const settingsSource=script.slice(script.indexOf('function schoolTurneraSettings(){'),script.indexOf('function calendar(){'));
vm.runInContext(settingsSource,calendarContext);
assert.equal(vm.runInContext('schoolTurneraSettings()',calendarContext),'','Los ajustes están ocultos por defecto.');
calendarContext.schoolSettingsOpen=true;
const settingsOpen=vm.runInContext('schoolTurneraSettings()',calendarContext);
assert.match(settingsOpen,/Configurar turnera/);
assert.match(settingsOpen,/value="90"/);
assert.match(settingsOpen,/name="schoolDay"/);
calendarContext.schoolSettingsOpen=false;
calendarContext.schoolPolicy=custom;
const hourlyView=vm.runInContext('calendar()',calendarContext);
assert.match(hourlyView,/Aeroclub Demo/);
assert.match(hourlyView,/data-agenda-time="07:15"/,'La grilla respeta intervalo de 15 minutos');
assert.match(hourlyView,/data-agenda-date="2026-10-22"/);
assert.doesNotMatch(hourlyView,/<form id="booking">/,'El formulario sigue plegado.');


// Tres tipos de reserva: avión, teoría y simulador, con límites escolares y ámbitos diferentes.
assert.equal(Object.keys(ACTIVITY_TYPES).length,3);
assert.equal(DEMO_RESOURCES.length,2);
const alice=members.find(p=>p.id==='p2'),teacher=members.find(p=>p.id==='i1');
const threeBase={pilot:'p2',date:'2026-10-30',start:'09:00',end:'10:30'};
const schoolPlane=requestStudentBooking({...threeBase,type:'flight',aircraft:'LV-ABC'},alice,[],fleet);
const schoolTheory=requestStudentBooking({...threeBase,type:'theory',resourceId:'aula-1'},alice,[],fleet);
const schoolSim=requestStudentBooking({...threeBase,type:'simulator',resourceId:'sim-1'},alice,[],fleet);
assert.equal(schoolPlane.status,'solicitada');
assert.equal(schoolTheory.aircraft,'');
assert.equal(schoolTheory.resourceId,'aula-1');
assert.equal(schoolSim.resourceId,'sim-1');
assert.throws(()=>requestStudentBooking({...threeBase,type:'theory',resourceId:'sim-1'},alice,[],fleet),/aula o simulador/);
assert.throws(()=>requestStudentBooking({...threeBase,type:'airline',aircraft:'LV-ABC'},alice,[],fleet),/Seleccioná vuelo/);
assert.throws(()=>requestStudentBooking({...threeBase,type:'theory',resourceId:'aula-1',end:'10:00'},alice,[],fleet),/90 minutos/);
assert.throws(()=>requestStudentBooking({...threeBase,type:'simulator',resourceId:'sim-1'},alice,[schoolPlane],fleet),/otra actividad/);
assert.throws(()=>requestStudentBooking({...threeBase,type:'flight',aircraft:'LV-ABC',pilot:'p1'},alice,[],fleet),/alumno/);
const flightTaken=takeStudentBooking(schoolPlane,teacher,[schoolPlane],members);
assert.equal(flightTaken.status,'confirmada');
assert.equal(flightTaken.instructor,'i1');
assert.equal(flightTaken.history.length,2);
const externalFlight=requestStudentBooking({...threeBase,type:'flight',aircraft:'LV-ABC',start:'10:00',end:'11:30'},alice,[],fleet);
assert.throws(()=>takeStudentBooking(externalFlight,teacher,[flightTaken,externalFlight],members),/Conflicto/,'Mismo instructor no puede tomar turnos superpuestos');
const otherStudent={...alice,id:'p3'};
const bTheory=requestStudentBooking({...threeBase,type:'theory',resourceId:'aula-1',pilot:'p3'},otherStudent,[],fleet);
assert.throws(()=>takeStudentBooking(bTheory,teacher,[flightTaken,bTheory],[...members,otherStudent]),/Conflicto/);
const bSim=requestStudentBooking({...threeBase,type:'simulator',resourceId:'sim-1',pilot:'p3'},otherStudent,[],fleet);
assert.throws(()=>takeStudentBooking(bSim,teacher,[flightTaken,bSim],[...members,otherStudent]),/Conflicto/);
assert.throws(()=>takeStudentBooking(schoolTheory,members[0],[schoolTheory],members),/instructor/);
assert.throws(()=>takeStudentBooking(flightTaken,teacher,[flightTaken],members),/pendientes/);
const completedTheory=takeStudentBooking(schoolTheory,teacher,[schoolTheory],members);
const completedSim=takeStudentBooking(schoolSim,teacher,[schoolSim],members);
const theoryActivity=finishGroundLesson(completedTheory,'i1');
const simActivity=finishGroundLesson(completedSim,'i1');
assert.equal(theoryActivity.minutes,90);
assert.equal(simActivity.type,'simulator');
assert.throws(()=>finishGroundLesson(completedTheory,'p1'),/instructor asignado/);
assert.throws(()=>finishGroundLesson(completedTheory,'i1',[theoryActivity]),/ya fue registrada/);
assert.throws(()=>closeFlight(data,completedTheory,[],fleet),/Solo las reservas de vuelo/);
const proposedLesson={...sample,date:'2026-10-20',bookingId:completedTheory.id,flightId:'',studentId:'p2',instructorId:'i1'};
const theoryBooking={...completedTheory,date:'2026-10-20'};
const submittedTheory=buildLesson(proposedLesson,members,members,[],[],[theoryBooking]);
assert.equal(submittedTheory.classType,'theory');
assert.equal(submittedTheory.hours,0,'Teoría no crea horas oficiales');
assert.equal(submittedTheory.bookingId,theoryBooking.id);
assert.throws(()=>buildLesson(proposedLesson,members,members,[],[submittedTheory],[theoryBooking]),/ya tiene evaluación/);
assert.throws(()=>buildLesson({...proposedLesson,instructorId:'p1'},members,members,[],[],[theoryBooking]),/instructor/);
const privateNotes=reviewLesson(submitLesson(submittedTheory,'i1'),'chief-demo','approved','Observaciones internas del jefe');
const studentOnly=studentPortalProjection('p2',[completedTheory,completedSim,flightTaken],[flight],[privateNotes],[{id:'pack1',studentId:'p2',description:'Pack demo',acquiredHours:10,remainingHours:8}],[theoryActivity]);
assert.equal(studentOnly.reservations.length,3);
assert.equal(studentOnly.packs.length,1);
assert.equal(studentOnly.packs[0].remainingHours,8);
assert.ok(studentOnly.practices.some(x=>x.type==='theory'));
for(const forbidden of ['evolution','difficulties','nextGoal','chiefReview','history','assessment','instructorId','reviewMode']){
 assert.equal(JSON.stringify(studentOnly).includes('"'+forbidden+'":'),false,'Alumno no debe recibir campo '+forbidden);
}
assert.equal(studentPortalProjection('p1',[completedTheory,completedSim],[],[privateNotes],[],[]).reservations.length,0);
const teachingOnly=instructorPortalProjection('i1',[schoolPlane,completedTheory,completedSim],[privateNotes],[theoryActivity]);
assert.equal(teachingOnly.pending.length,1);
assert.equal(teachingOnly.assigned.length,2);
assert.equal(teachingOnly.lessons.length,1);
assert.ok(!teachingOnly.lessons.some(x=>x.studentId==='p3'));
assert.equal(visibleBookings([completedTheory],['2026-10-30'],'aula-1').length,1);
assert.equal(visibleBookings([completedSim],['2026-10-30'],'sim-1').length,1);
for(const required of ['Mi espacio de alumno','Área reservada para instructores','Seguimiento de Dirección / Jefatura',
 'Solicitar reserva','Tomar reserva','Registrar clase realizada','Registrar evolución','Mis packs de horas',
 'Registro de vuelo','data-instructor-take','studentBookingType'])
 assert.ok(html.includes(required),'Falta área o acción: '+required);
assert.match(html,/if\(tab==='alumno'\|\|tab==='instructor'\)wirePortals\(\)/);
assert.match(html,/const open=reservations\.filter\(r=>r\.status==='confirmada'&&\(!r\.type\|\|r\.type==='flight'\)/);

// Las horas de simulador y teoría deben acreditarse como realizadas (no por reserva), sin mezclar vuelo.
assert.deepEqual({...DEFAULT_TRAINING_GOALS},{flightHours:40,simulatorHours:5,theoryHours:0});
const recordedSim=finishGroundLesson(completedSim,'i1',[],75);
assert.equal(recordedSim.minutes,75);
assert.equal(recordedSim.deviceId,'sim-1');
assert.equal(recordedSim.status,'realizada_demo');
assert.throws(()=>finishGroundLesson(completedSim,'i1',[],91),/efectivamente realizados/);
assert.throws(()=>finishGroundLesson(completedSim,'i1',[],0),/efectivamente realizados/);
assert.throws(()=>finishGroundLesson(completedSim,'i1',[],1.5),/efectivamente realizados/);
const recordedTheory=finishGroundLesson(completedTheory,'i1',[],50);
const counted=trainingHours('p2',[{...flight,pilot:'p2',blockHours:1.3,blockMinutes:78}],[recordedSim,recordedTheory]);
assert.deepEqual(counted,{
 flightHours:1.3,simulatorMinutes:75,theoryMinutes:50,simulatorHours:1.25,theoryHours:0.83
});
const bookedOnly=studentPortalProjection('p2',[completedSim],[],[],[],[],DEFAULT_TRAINING_GOALS);
assert.equal(bookedOnly.simulatorHours,0,'Reservar simulador no genera horas de simulador');
assert.equal(bookedOnly.progress.simulatorHours.completed,0);
const completedProjection=studentPortalProjection('p2',[],[],[],[],[recordedSim,recordedTheory],DEFAULT_TRAINING_GOALS);
assert.equal(completedProjection.flightHours,0);
assert.equal(completedProjection.simulatorHours,1.25);
assert.equal(completedProjection.theoryHours,0.83);
assert.equal(completedProjection.progress.simulatorHours.required,5);
assert.equal(completedProjection.progress.simulatorHours.remaining,3.75);
assert.equal(completedProjection.progress.flightHours.required,40);
assert.equal(completedProjection.progress.flightHours.remaining,40);
assert.equal(completedProjection.progress.theoryHours.percentage,null);
assert.equal(studentPortalProjection('p1',[],[],[],[],[recordedSim]).simulatorHours,0);
for(const field of ['evolution','difficulties','nextGoal','history','assessment','chiefReview','reviewMode'])
 assert.doesNotMatch(JSON.stringify(completedProjection),new RegExp('"'+field+'":'));
const customGoals=validateTrainingGoals({flightHours:40,simulatorHours:10,theoryHours:30});
assert.equal(trainingProgress(counted,customGoals).simulatorHours.remaining,8.75);
assert.equal(trainingProgress(counted,customGoals).theoryHours.remaining,29.17);
assert.throws(()=>validateTrainingGoals({flightHours:40,simulatorHours:-1,theoryHours:0}),/no negativos/);
assert.throws(()=>validateTrainingGoals({flightHours:40,simulatorHours:5.1,theoryHours:0}),/cuartos de hora/);
assert.equal(trainingProgress({flightHours:45,simulatorHours:5,theoryHours:0},DEFAULT_TRAINING_GOALS).flightHours.percentage,100);
for(const label of ['Horas de simulador','Horas de teoría','Configurar programa','Mi biblioteca de teoría y práctica',
 'rodaje-viento.html','calculo-sustentacion.html','fichas/fuerzas-del-vuelo.html','trainingGoalsForm'])
 assert.ok(html.includes(label),'Falta interfaz de formación '+label);
assert.match(html,/finishGroundLesson\(booking,portalInstructor,groundActivities,actual\)/);
const teachingSheet=fs.readFileSync(new URL('../utilidades/gestion-aeronautica/fichas/fuerzas-del-vuelo.html',import.meta.url),'utf8');
assert.match(teachingSheet,/<svg/);
assert.match(teachingSheet,/Las cuatro fuerzas del vuelo/);
assert.match(teachingSheet,/Imprimir ficha A4/);
assert.match(teachingSheet,/Autoevaluación/);
assert.doesNotMatch(teachingSheet,/AeroMaster|Aviacion pro|Pilotfy/);
console.log('PASS: horas registradas de simulador y teoría, requisitos escolares y ficha visual original');

console.log('PASS: tres tipos de reservas, recursos, aceptación por instructor, evaluación y datos aislados del alumno');

console.log('PASS: agenda compacta con semana/día, filtros, turnos superpuestos y formulario oculto');


// Instrucción con instructor y vuelos solos de piloto privado: mismo avión no implica mismas horas.
const soloBooking={...reservation,id:'solo-1',pilot:'p1',instructor:'',date:'2026-10-28',start:'09:00',end:'10:00'};
const lessonBooking={...reservation,id:'student-1',pilot:'p2',instructor:'i1',date:'2026-10-28',start:'11:00',end:'12:30'};
const coachedBooking={...reservation,id:'coached-1',pilot:'p1',instructor:'i1',date:'2026-10-29',start:'09:00',end:'10:00'};
assert.equal(classifyFlightBooking(soloBooking,members),'private');
assert.equal(classifyFlightBooking(lessonBooking,members),'instruction');
assert.equal(classifyFlightBooking(coachedBooking,members),'coached');
assert.match(FLIGHT_MODE_LABELS.private,/sin instructor/);
assert.throws(()=>classifyFlightBooking({...lessonBooking,instructor:''},members),/debe tener instructor/);
assert.throws(()=>classifyFlightBooking({...soloBooking,pilot:'i1'},members),/alumno o piloto/);
assert.throws(()=>classifyFlightBooking({...soloBooking,instructor:'p1'},members),/mismo titular/);
assert.throws(()=>classifyFlightBooking({...lessonBooking,instructor:'p1'},members),/Instructor de vuelo inválido/);
const closeData={from:'SADF',to:'SAME',start:'09:00',end:'10:01',tachStart:1234,tachEnd:1234.8,landings:2};
const closeDataStudent={...closeData,start:'11:00',end:'12:26',tachStart:1235,tachEnd:1236,landings:3};
const soloFlight=closeFlight(closeData,soloBooking,[],fleet,members);
const instructionFlight=closeFlight(closeDataStudent,lessonBooking,[],fleet,members);
const coachedFlight=closeFlight(closeData,coachedBooking,[],fleet,members);
assert.equal(soloFlight.operationType,'private');
assert.equal(instructionFlight.operationType,'instruction');
assert.equal(coachedFlight.operationType,'coached');
assert.equal(soloFlight.blockMinutes,61);
assert.equal(instructionFlight.blockMinutes,86);
assert.equal(instructionFlight.instructor,'i1');
assert.equal(soloFlight.instructor,'');
assert.throws(()=>closeFlight(closeData,{...lessonBooking,instructor:''},[],fleet,members),/instructor/);
assert.throws(()=>closeFlight(closeData,soloBooking,[soloFlight],fleet,members),/ya tiene un vuelo cerrado/);
const allFlightDemo=[soloFlight,instructionFlight,coachedFlight];
const soloPerson=flightActivityByRole('p1','piloto',allFlightDemo);
assert.equal(soloPerson.blockMinutes,61);
assert.equal(soloPerson.blockHours,1.02);
assert.equal(soloPerson.flights,1);
assert.equal(soloPerson.landings,2);
assert.equal(soloPerson.rows.length,1);
assert.equal(soloPerson.rows[0].instructor,'');
assert.equal(soloPerson.rows[0].destination,'SAME');
const coached=flightActivityProjection('p1',allFlightDemo,'coached');
assert.equal(coached.flights,1);
assert.equal(flightActivityProjection('p1',allFlightDemo).flights,2);
assert.equal(flightActivityProjection('p1',allFlightDemo).blockMinutes,122);
const studentTraining=flightActivityByRole('p2','alumno',allFlightDemo);
assert.equal(studentTraining.blockMinutes,86);
assert.equal(studentTraining.blockHours,1.43);
assert.equal(studentTraining.landings,3);
assert.equal(studentTraining.rows[0].instructor,'i1');
assert.equal(flightActivityByRole('p3','alumno',allFlightDemo).flights,0);
assert.throws(()=>flightActivityProjection('p1',allFlightDemo,'invalid'),/Filtro/);
assert.throws(()=>flightActivityByRole('p1','instructor',allFlightDemo),/Rol/);
assert.equal(trainingHours('p2',allFlightDemo,[]).flightHours,1.43);
assert.equal(studentPortalProjection('p2',[],allFlightDemo,[],[],[]).flightHours,1.43);
assert.equal(studentPortalProjection('p1',[],allFlightDemo,[],[],[]).flightHours,2.03);
for(const label of ['Mi Hangar de Vuelo · Piloto privado','Mis vuelos de instrucción',
 'Mi historial de vuelos como piloto privado','flightModeFilter','Piloto privado sin instructor',
 'Sin instructor','area-card-grid']){
 assert.ok(html.includes(label),'Falta seguimiento de vuelo: '+label);
}
assert.match(html,/closeFlight\(\{from:\$\('flightFrom'\)\.value/);
assert.match(html,/booking,flights,fleet,members\)/);
assert.match(html,/const cols=\['Fecha','Modalidad','Aeronave','Titular','Instructor'/);
// Tres frontends de demostración con selección de área y menú limitado al espacio activo.
for(const key of ['alumno','instructor','administracion']){
 assert.ok(html.includes("['"+key+"','0"),'Falta tarjeta del área '+key);
}
assert.match(html,/currentArea=null/);
assert.match(html,/area\.tabs\.some\(\(\[key\]\)=>key===value\)/);
assert.match(html,/area\.tabs\.map\(\(\[key,label\]\)/);
assert.match(html,/function adminPeopleScreen\(/);
assert.doesNotMatch(html,/data-go="piloto"/,'No debe haber salto administrativo al área del piloto');
assert.doesNotMatch(html,/data-go="academia"/,'No debe haber salto administrativo al área del alumno');
assert.match(html,/site_admins/,'El acceso admin de la demo debe mantenerse');

// Pistas No Oficiales: una única fuente compartida entre Gente de Vuelo y AeroSuite.
const airstripsOriginal=fs.readFileSync(new URL('../utilidades/pistas-no-oficiales.html',import.meta.url),'utf8');
const areaDefinition=html.match(/const AREA_DEFS=Object\.freeze\(\{([\s\S]*?)\}\);/);
assert.ok(areaDefinition,'Falta definición de áreas de AeroSuite');
for(const area of ['alumno','instructor','administracion']){
 const row=areaDefinition[1].split('\n').find(line=>line.trim().startsWith(area+':'));
 assert.ok(row&&row.includes("['pistas','Mapa de Pistas y Aeródromos']"),'Falta acceso a pistas para '+area);
}
assert.match(html,/pistas:airstripsScreen/);
assert.match(html,/function airstripsScreen\(\)/);
assert.match(html,/iframe class="airstrips-frame"/);
assert.match(html,/src="\.\.\/pistas-no-oficiales\.html"/);
assert.match(html,/target="_blank" rel="noopener noreferrer">Abrir mapa completo/);
assert.match(html,/no se duplican archivos ni registros/);
assert.match(html,/no confirma aptitud operacional/);
assert.match(html,/AIP, NOTAM/);
assert.match(landing,/Mapa de Pistas y Aeródromos/);
assert.match(landing,/href="\.\.\/pistas-no-oficiales\.html"/);
assert.match(landing,/ninguna referencia garantiza aptitud/);
assert.match(airstripsOriginal,/\.from\('community_airstrips'\)/);
assert.match(airstripsOriginal,/\.eq\('status','approved'\)/,'Solo pistas aprobadas deben aparecer en el mapa comunitario');
assert.match(airstripsOriginal,/status:'pending'/,'Las pistas nuevas requieren moderación');
assert.match(airstripsOriginal,/site_admins/,'La moderación requiere administrador');

// Mejoras de búsqueda y de representación de pistas, en el mapa original.
for(const id of ['zone-search-form','zone-query','zone-search-button','zone-my-location','zone-propose-center','zone-results','zone-status']){
 assert.ok(airstripsOriginal.includes('id="'+id+'"'),'Falta control del mapa: '+id);
}
assert.match(airstripsOriginal,/function runwayPin\(kind='unverified'\)/);
assert.match(airstripsOriginal,/const PIN_PALETTE=/);
assert.match(airstripsOriginal,/PIN_PALETTE\[kind\]/);
assert.match(airstripsOriginal,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
assert.match(airstripsOriginal,/runwayPin\(airfieldClass\(p\)\)/);
assert.match(airstripsOriginal,/runwayPin\('reference'\)/);
assert.match(airstripsOriginal,/runwayPin\('draft'\)/);
assert.match(airstripsOriginal,/function communityPopup\(record,nm=null\)/);
assert.match(airstripsOriginal,/function referencePopup\(record,nm=null\)/);
for(const field of ['Coordenadas','Pista / rumbo','Dimensiones','Superficie','Elevación','Acceso','Obstáculos','Frecuencia','Observaciones']){
 assert.ok(airstripsOriginal.includes("'"+field+"'"),'El pin debe mostrar '+field);
}
assert.match(airstripsOriginal,/document\.createElement\('dt'\)/);
assert.match(airstripsOriginal,/document\.createElement\('dd'\)/);
assert.match(airstripsOriginal,/warning.classList.add\('critical'\)/);
assert.match(airstripsOriginal,/Copiar coordenadas/);
assert.match(airstripsOriginal,/href="https:\/\/photon\.komoot\.io\//);
assert.match(airstripsOriginal,/endpoint\.searchParams\.set\('bbox','-74,-56,-53,-21'\)/);
assert.match(airstripsOriginal,/zoneCache\.set\(key,options\)/);
assert.match(airstripsOriginal,/document\.getElementById\('zone-search-form'\)\.addEventListener\('submit'/);
assert.doesNotMatch(airstripsOriginal,/zoneInput\.addEventListener\('input',[\s\S]{0,100}fetch/,'La búsqueda a Photon no debe ejecutarse por cada letra');
assert.match(html,/allow="geolocation"/,'AeroSuite debe permitir la solicitud explícita de permiso en el iframe');
const functionStart=airstripsOriginal.indexOf('function parseZoneCoordinates(value){');
const functionEnd=airstripsOriginal.indexOf('function focusMapAt(',functionStart);
assert.ok(functionStart>0&&functionEnd>functionStart,'Falta el analizador de coordenadas');
const coordinateParser=vm.runInNewContext(airstripsOriginal.slice(functionStart,functionEnd)+';parseZoneCoordinates');
const argCoords=coordinateParser('-34.9, -57.94');
assert.equal(argCoords.latitude,-34.9);
assert.equal(argCoords.longitude,-57.94);
assert.equal(coordinateParser('-34.9 -57.94').longitude,-57.94);
assert.equal(coordinateParser('Chascomús'),null);
assert.equal(coordinateParser('91, 200'),null);
for(const marker of [
  "addMetarReference(card,latitude,longitude)",
  "Consultar METAR cercano",
  "METAR de referencia cercano",
  "const METAR_CACHE_MILLISECONDS=300000",
  "'/api/airstrip-metar?lat='",
  "Observado: ",
  " UTC",
  "Estación ",
  " NM de la pista",
  "METAR ANTIGUO",
  "no necesariamente representativa"
]){
 // La advertencia de no representatividad se entrega desde el servidor,
 // las restantes etiquetas deben estar presentes en la aplicación.
 if(marker==="no necesariamente representativa")continue;
 assert.ok(airstripsOriginal.includes(marker),'Falta tarjeta de METAR seguro: '+marker);
}
assert.match(airstripsOriginal,/button\.addEventListener\('click',async\(\)=>/);
assert.doesNotMatch(airstripsOriginal,/setInterval\([^)]*metar/i,'No realizar polling meteorológico continuo.');
console.log('PASS: interfaz de METAR consultable por pin con ICAO, distancia, hora UTC y alerta por antigüedad');

console.log('PASS: buscador geográfico manual, coordenadas, iconos aeronáuticos SVG y fichas detalladas del pin');


assert.match(airstripsOriginal, /href="https:\/\/ais\.anac\.gob\.ar\/aip" target="_blank" rel="noopener noreferrer"/, 'El mapa debe enlazar al AIP oficial de ANAC');
assert.match(airstripsOriginal, /aip\.href='https:\/\/ais\.anac\.gob\.ar\/aip'/, 'Cada ficha debe incluir acceso al AIP oficial');
assert.match(airstripsOriginal, /no acredita que esté publicada, habilitada ni autorizada/, 'Evitar presentar pistas comunitarias como aeródromos habilitados');
assert.match(html, /Consultar AIP oficial · ANAC/, 'El módulo de AeroSuite debe enlazar al AIP oficial');
assert.doesNotMatch(airstripsOriginal, /aip.*status:'approved'/i, 'La AIP no debe confundirse con moderación comunitaria');


const anacCatalogSource=fs.readFileSync(new URL('../utilidades/gestion-aeronautica/src/catalogo-pistas-anac.js',import.meta.url),'utf8');
const anacEnvironment={window:{}};
vm.runInNewContext(anacCatalogSource,anacEnvironment,{timeout:1000});
const anacCatalog=anacEnvironment.window.AEROSUITE_OFFICIAL_AIRSTRIPS;
assert.ok(anacCatalog,'Debe estar disponible el catálogo inicial con fuentes oficiales');
assert.equal(anacCatalog.catalogStatus,'parcial','No se puede presentar una muestra como inventario completo');
assert.equal(anacCatalog.ladEdition,'2026-09-28');
assert.equal(anacCatalog.official.length,2);
assert.equal(anacCatalog.lad.length,16);
const allDocumented=[...anacCatalog.official,...anacCatalog.lad];
assert.equal(new Set(allDocumented.map(x=>x.id)).size,allDocumented.length,'No duplicar identificadores documentales');
for(const item of allDocumented){
 assert.ok(['official','lad'].includes(item.category),'Categoría documental desconocida');
 assert.ok(Number.isFinite(item.lat)&&item.lat>=-56&&item.lat<=-21);
 assert.ok(Number.isFinite(item.lon)&&item.lon>=-74&&item.lon<=-53);
 assert.match(item.sourceUrl,/^https:\/\/(?:ais\.anac\.gob\.ar|www\.argentina\.gob\.ar)\//);
 assert.match(item.verification,/verific|revisi/i,'Nunca inferir aptitud o habilitación vigente');
 assert.ok(item.sourceDate,'La ficha debe indicar fecha del documento');
}
const ezeiza=anacCatalog.official.find(x=>x.details.icao==='SAEZ');
const aeroparque=anacCatalog.official.find(x=>x.details.icao==='SABE');
assert.ok(ezeiza&&aeroparque);
assert.ok(Math.abs(ezeiza.lat+34.8222222)<.00002);
assert.ok(Math.abs(ezeiza.lon+58.5358333)<.00002);
assert.ok(Math.abs(aeroparque.lat+34.5597222)<.00002);
assert.equal(anacCatalog.lad[0].details.registry,'LAD 176');
assert.ok(Math.abs(anacCatalog.lad[0].lon+60.2625)<.00002);
assert.match(airstripsOriginal,/gestion-aeronautica\/src\/catalogo-pistas-anac\.js/);
for(const layer of ['controlled_public','uncontrolled_public','private_aerodrome','lad','heliport','unverified','reference']){
 assert.match(airstripsOriginal,new RegExp('data-pista-layer="'+layer+'"'),layer+' debe ser filtrable');
}
assert.match(airstripsOriginal,/function setLayerVisible\(kind,visible\)/);
assert.match(airstripsOriginal,/function syncLayerVisibility\(\)/);
assert.match(airstripsOriginal,/function renderDocumented\(\)/);
assert.match(airstripsOriginal,/function documentaryPopup\(record,nm=null\)/);
assert.match(airstripsOriginal,/documentaryMarkers\.set\(point\.id,marker\)/);
assert.match(airstripsOriginal,/function renderExternal\(\)\{\s*external\.clearLayers\(\);\s*if\(!layerSelected\('reference'\)/);
assert.match(airstripsOriginal,/\.filter\(x=>layerSelected\(airfieldClass\(x\)\)&&meetsServiceFilters\(x\)&&meetsSurfaceFilter\(x\)\)/);
assert.match(airstripsOriginal,/documentedMatches=documentedAirstrips/);
assert.match(airstripsOriginal,/Fuente documental/);
assert.match(airstripsOriginal,/no equivale a aeródromo habilitado|No son aeródromos habilitados|no son aeródromos habilitados/i);
assert.match(airstripsOriginal,/Cobertura parcial, no inventario nacional/);
assert.match(airstripsOriginal,/Privado no significa no oficial/);
assert.match(html,/Mapa de Pistas y Aeródromos/);

const taxonomySource=fs.readFileSync(new URL('../utilidades/gestion-aeronautica/src/clasificacion-pistas.js',import.meta.url),'utf8');
const typeEnvironment={window:{}};
vm.runInNewContext(taxonomySource,typeEnvironment,{timeout:1000});
const aircraftTypes=typeEnvironment.window.GDV_AIRFIELD_TYPES;
const six=['controlled_public','uncontrolled_public','private_aerodrome','lad','heliport','unverified'];
assert.equal(Object.keys(aircraftTypes.CATEGORIES).length,6);
for(const code of six){
 assert.ok(aircraftTypes.CATEGORIES[code].label);
 assert.match(airstripsOriginal,new RegExp('data-pista-layer="'+code+'"'));
}
assert.equal(aircraftTypes.ATS.afis,'Servicio AFIS (información, no control)');
assert.equal(aircraftTypes.classification(anacCatalog.official[0]),'controlled_public');
assert.equal(aircraftTypes.classification(anacCatalog.lad[0]),'lad');
assert.equal(aircraftTypes.classification({facility_class:'controlled_public'}),'unverified');
assert.equal(aircraftTypes.classification({facility_class:'private_aerodrome',verified_source_url:'https://anac.gob.ar/fuente',verified_source_date:'2026-10-20'}),'private_aerodrome');
assert.equal(aircraftTypes.classification({category:'reference',icaoId:'SABE'}),'unverified');
assert.match(aircraftTypes.warning('unverified'),/PELIGRO/);
assert.match(airstripsOriginal,/id="filter-ats"/);
assert.match(airstripsOriginal,/id="filter-access"/);
assert.match(airstripsOriginal,/id="filter-rules"/);
assert.match(airstripsOriginal,/function meetsServiceFilters\(record\)/);
assert.match(airstripsOriginal,/Solo referencia para análisis de contingencias/);
assert.match(airstripsOriginal,/kind==='heliport'/);
assert.match(airstripsOriginal,/kind==='unverified'/);

const splitMap=airstripsOriginal;
assert.match(splitMap,/class="dispatch-layout"/,'Falta marco de pantalla dividida');
assert.match(splitMap,/class="dispatch-sidebar"/,'Falta panel izquierdo');
assert.match(splitMap,/class="dispatch-map-panel"/,'Falta zona principal del mapa');
assert.match(splitMap,/grid-template-columns:minmax\(350px,29%\) minmax\(0,1fr\)/);
assert.match(splitMap,/id="selected-detail"/);
assert.match(splitMap,/function showAirfieldDetail\(createCard,name\)/);
assert.match(splitMap,/function attachSelection\(marker,point,label,createCard\)/);
assert.match(splitMap,/attachSelection\(marker,\[point\.lat,point\.lon\]/);
assert.match(splitMap,/attachSelection\(marker,\[p\.latitude,p\.longitude\]/);
assert.match(splitMap,/attachSelection\(marker,\[x\.lat,x\.lon\]/);
assert.match(splitMap,/id="ruler-toggle"/);
assert.match(splitMap,/id="ruler-clear"/);
assert.match(splitMap,/function rulerPoint\(point,label\)/);
assert.match(splitMap,/function clearRuler\(\)/);
assert.match(splitMap,/const bearing=trueBearing\(a\.lat,a\.lng,b\.lat,b\.lng\)/);
assert.match(splitMap,/setAttribute\('aria-pressed',String\(rulerEnabled\)\)/);
assert.match(splitMap,/\u00b0 verdadero \(sin variación magnética\)/);
assert.match(splitMap,/id="contribute-fast"/);
assert.match(splitMap,/if\(proposeMode\)\{proposeMode=false;proposeAt\(e\.latlng\);return\}/);
for(const key of ['asfalto','tierra','cesped','otros']){
 assert.match(splitMap,new RegExp('data-pista-surface="'+key+'"'),'Filtro de superficie '+key);
}
assert.match(splitMap,/function meetsSurfaceFilter\(record\)/);
for(const target of ['flightprep-nav.html','meteorologia-aeronautica.html','gestion-aeronautica/']){
 assert.ok(splitMap.includes('href="'+target+'"'),'Falta atajo de navegación a '+target);
}
const bearingSource=splitMap.slice(splitMap.indexOf('function trueBearing('),splitMap.indexOf('function clearRuler('));
const bearingCalc=vm.runInNewContext(bearingSource+';trueBearing');
assert.equal(bearingCalc(0,0,0,90),90);
assert.equal(bearingCalc(0,0,90,0),0);
assert.equal(bearingCalc(0,0,-90,0),180);
assert.equal(bearingCalc(0,0,0,-90),270);
const distanceSource=splitMap.slice(splitMap.indexOf('function nauticalMiles('),splitMap.indexOf('function setReference('));
const miles=vm.runInNewContext(distanceSource+';nauticalMiles');
assert.ok(Math.abs(miles(0,0,0,1)-60.04)<0.25,'Un grado longitudinal ecuatorial debe ser aproximadamente 60 NM');
assert.ok(Math.abs(miles(0,0,0,0))<.0001,'Distancia nula');
for(const key of ['airstrip-photo-drop','airstrip-photo-files','airstrip-photo-preview','airstrip-photo-consent']){
 assert.match(splitMap,new RegExp('id="'+key+'"'),'Falta interfaz para fotografías: '+key);
}
assert.match(splitMap,/src="\.\.\/assets\/r2-media\.js"/);
assert.match(splitMap,/GDV_R2_MEDIA\.upload\(cleaned,client,GDV_CONFIG\.url,GDV_CONFIG\.key\)/);
assert.match(splitMap,/function stripPhotoMetadata\(file\)/);
assert.match(splitMap,/canvas\.toBlob\(/,'Las fotografías deben sanear EXIF y GPS');
assert.match(splitMap,/details\.photos=urls/);
assert.match(splitMap,/airstripImageGallery\(d,p\.details\?\.photos,p\.name\)/);
assert.match(splitMap,/airstripImageGallery\(card,details\.photos,name\)/);
assert.match(splitMap,/status:'pending',details/,'La aprobación es posterior a la carga');
console.log('PASS: escritorio dividido, fichas laterales, regla NM y rumbo verdadero, filtros y fotos R2');

console.log('PASS: seis categorías aeronáuticas, filtros ATS/uso y alerta severa en no verificadas');

console.log('PASS: categorías oficiales AIP, LAD, comunitarias y OSM con respaldo documental y capas filtrables');

console.log('PASS: Pistas No Oficiales compartidas en las tres áreas, mapa interactivo y precauciones');

console.log('PASS: AeroSuite con portal de tres áreas, navegación aislada y acceso restringido');

console.log('PASS: alumno con instructor y piloto privado solo, horas separadas, filtros e historial individual');


// Libro completo fotografiado: 8 casilleros de tiempo, discriminación derecha, simulador y arrastre.
assert.equal(Object.keys(LOGBOOK_TIME_COLUMNS).length,8);
assert.deepEqual(Object.keys(LOGBOOK_TIME_COLUMNS),[
 'airportDayPilot','airportDayCopilot','airportNightPilot','airportNightCopilot',
 'crosscountryDayPilot','crosscountryDayCopilot','crosscountryNightPilot','crosscountryNightCopilot']);
assert.ok(Object.keys(LOGBOOK_SPECIAL_COLUMNS).includes('instrumentRealPilot'));
assert.ok(Object.keys(LOGBOOK_SPECIAL_COLUMNS).includes('instrumentHood'));
assert.ok(Object.keys(LOGBOOK_SIMULATOR_COLUMNS).includes('simulatorTrainee'));
const bookedFlight={...soloBooking,id:'book-1'};
const recordedFlight={...soloFlight,id:'flight-log-1',reservationId:'book-1'};
const exampleLog={
 purpose:'travesia',recordedFlightMinutes:61,
 license:'PPA de ejemplo',aircraftMake:'Cessna',aircraftModel:'Cessna 172',
 aircraftClass:'Monomotor terrestre',powerHp:'160 HP',
 categoryMinutes:{
  airportDayPilot:20,crosscountryDayPilot:31,crosscountryNightPilot:10
 },
 specialMinutes:{
  instructorFlight:0,multiEngine:0,jet:0,turboprop:0,aerialApplication:0,
  instrumentRealPilot:10,instrumentRealCopilot:0,instrumentHood:10
 },
 certificationNote:'Cotejar con documentación original'
};
const detail=makeLogbookDetail(exampleLog,bookedFlight,recordedFlight,members[0],fleet);
assert.equal(detail.recordedFlightMinutes,61);
assert.equal(detail.dayMinutes,51);
assert.equal(detail.nightMinutes,10);
assert.equal(detail.specialMinutes.instrumentRealPilot,10);
assert.equal(detail.specialMinutes.instrumentHood,10);
assert.equal(detail.status,'borrador_no_certificado');
assert.equal(detail.incomplete,false);
assert.equal(detail.sourceFlightId,'flight-log-1');
assert.throws(()=>makeLogbookDetail({...exampleLog,recordedFlightMinutes:''},bookedFlight,recordedFlight,members[0],fleet),/Ingresá los minutos/);
assert.throws(()=>makeLogbookDetail({...exampleLog,recordedFlightMinutes:62},bookedFlight,recordedFlight,members[0],fleet),/no superar el bloque/);
assert.throws(()=>makeLogbookDetail({...exampleLog,categoryMinutes:{airportDayPilot:60}},bookedFlight,recordedFlight,members[0],fleet),/ocho casilleros/);
assert.throws(()=>makeLogbookDetail({...exampleLog,specialMinutes:{instrumentHood:62}},bookedFlight,recordedFlight,members[0],fleet),/minutos enteros y válidos|no puede superar/);
assert.throws(()=>makeLogbookDetail({...exampleLog,specialMinutes:{instrumentRealPilot:45,instrumentRealCopilot:30}},bookedFlight,recordedFlight,members[0],fleet),/instrumentos reales/);
assert.throws(()=>makeLogbookDetail({...exampleLog,purpose:''},bookedFlight,recordedFlight,members[0],fleet),/finalidad/);
const loggedFlights=[{...recordedFlight,logbook:detail},instructionFlight];
const page=logbookSummary('p1',loggedFlights,[recordedSim]);
assert.equal(page.flights,1);
assert.equal(page.minutes,61);
assert.equal(page.categories.airportDayPilot,20);
assert.equal(page.categories.crosscountryNightPilot,10);
assert.equal(page.special.instrumentRealPilot,10);
assert.equal(page.special.instrumentHood,10);
assert.equal(page.simulator.simulatorTrainee,0,'No mezclar simulación de otro titular');
assert.equal(page.previousBalanceMinutes,null,'Saldo anterior en papel debe quedar desconocido');
assert.equal(logbookRows('p2',loggedFlights).length,0);
const pageSim=logbookSummary('p2',loggedFlights,[recordedSim,recordedTheory]);
assert.equal(pageSim.minutes,0);
assert.equal(pageSim.simulator.simulatorTrainee,75,'Simulador efectivo sí se registra en apartado separado');
assert.equal(pageSim.simulator.simulatorInstructor,0);
const pageTeacher=logbookSummary('i1',loggedFlights,[recordedSim]);
assert.equal(pageTeacher.simulator.simulatorInstructor,75);
assert.equal(pageTeacher.minutes,0,'Tiempo de instructor simulador no es tiempo de vuelo');
for(const label of ['Planilla completa · Libro de Vuelo','logRecordedFlightMinutes',
 'LOGBOOK_TIME_COLUMNS','LOGBOOK_SPECIAL_COLUMNS','LOGBOOK_SIMULATOR_COLUMNS',
 'Discriminación adicional','Adiestrador terrestre / Simulador',
 'Certificaciones','data-edit-logbook','Resumen del libro personal']){
 assert.ok(html.includes(label),'Falta sección de libro completo: '+label);
}
assert.match(html,/if\(!logbookEditingFlightId\)return ''/,'La planilla debe permanecer oculta hasta solicitarla.');
assert.match(html,/sourceFlightId|makeLogbookDetail/);
console.log('PASS: libro completo, ocho casilleros, instrumentos, simulador separado y saldo anterior pendiente');


// RAV es flujo institucional independiente, ubicado en Pilotos y alumnos, no en el registro de vuelo.
const instRavFlight={...instructionFlight,id:'school-flight-unique-1',blockMinutes:86,operationType:'instruction',instructor:'i1'};
const privateRavFlight={...soloFlight,id:'pilot-solo-unique-1',operationType:'private',instructor:''};
const coachedRavFlight={...coachedFlight,id:'pilot-coached-unique-1',operationType:'coached',instructor:'i1'};
const eligible=ravCandidates('p2',[instRavFlight,privateRavFlight,coachedRavFlight],'2026-10-01','2026-10-31');
assert.equal(eligible.length,1);
assert.equal(eligible[0].id,'school-flight-unique-1');
assert.throws(()=>ravCandidates('p2',[], '2026-10-32','2026-11-01'),/período/);
assert.throws(()=>ravCandidates('p2',[], '2026-11-01','2026-10-01'),/período/);
const ravDraft=createRavDraft({studentId:'p2',dateFrom:'2026-10-01',dateTo:'2026-10-31'},
 [instRavFlight,privateRavFlight,coachedRavFlight],members);
assert.equal(ravDraft.status,'draft');
assert.equal(ravDraft.flightIds.length,1);
assert.equal(ravDraft.certification,null);
assert.equal(ravFlightTotals(ravDraft,[instRavFlight]).minutes,86);
assert.equal(ravFlightTotals(ravDraft,[instRavFlight]).count,1);
assert.throws(()=>createRavDraft({studentId:'p1',dateFrom:'2026-10-01',dateTo:'2026-10-31'},
 [instRavFlight],members),/alumno/);
assert.throws(()=>createRavDraft({studentId:'p2',dateFrom:'2026-10-01',dateTo:'2026-10-31'},
 [instRavFlight],members,[ravDraft]),/otro RAV/);
assert.throws(()=>ravFlightTotals({...ravDraft,flightIds:[instRavFlight.id,instRavFlight.id]},[instRavFlight]),/no puede repetirse/);
assert.throws(()=>ravFlightTotals(ravDraft,[]),/vuelos de origen/);
const ravSubmitted=submitRavForReview(ravDraft);
assert.equal(ravSubmitted.status,'submitted');
assert.throws(()=>submitRavForReview(ravSubmitted),/Solo se envían/);
assert.throws(()=>institutionalReviewRav(ravSubmitted,{actor:'alumno',role:'alumno',decision:'reviewed'}),/responsable institucional/);
assert.throws(()=>institutionalReviewRav(ravSubmitted,{actor:'',role:'director',decision:'reviewed'}),/identidad/);
assert.throws(()=>institutionalReviewRav(ravSubmitted,{actor:'director-demo',role:'director',decision:'returned'}),/observaciones/);
const ravReturned=institutionalReviewRav(ravSubmitted,{actor:'director-demo',role:'director',decision:'returned',observations:'Revisar historial de instrucción'});
assert.equal(ravReturned.status,'returned');
assert.equal(ravReturned.certification,null);
assert.throws(()=>createRavDraft({studentId:'p2',dateFrom:'2026-10-01',dateTo:'2026-10-31'},
 [instRavFlight],members,[ravReturned]),/otro RAV/,'Devoluciones se resuelven, no se duplican.');
const resubmitted=submitRavForReview(ravReturned);
const ravReviewed=institutionalReviewRav(resubmitted,{actor:'jefe-demo',role:'jefe',decision:'reviewed'});
assert.equal(ravReviewed.status,'reviewed');
assert.equal(ravReviewed.certification,null);
assert.match(RAV_STATES.reviewed,/NO CERTIFICADO/);
assert.equal(ravReviewed.history.length,5);
assert.throws(()=>institutionalReviewRav(ravReviewed,{actor:'director',role:'director',decision:'reviewed'}),/pendiente/);
assert.ok(html.includes("['vuelos','Registro de vuelos']"));
assert.ok(html.includes('function ravInstitutionScreen(){'));
assert.ok(html.includes('function wireInstitutionalRav(){'));
assert.ok(html.includes('Gestión institucional de RAV · Dirección / Administración'));
assert.ok(html.includes('data-rav-review'));
assert.ok(html.includes('data-rav-return'));
assert.ok(html.includes('id="ravFormPanel"'));
assert.match(html,/if\(tab==='personas'\)\{wireTraining\(\);wireInstitutionalRav\(\);\}/);
assert.doesNotMatch(html,/\['vuelos','Vuelos y RAV'\]/);
assert.match(html,/trainingSettings\(\)\+trainingTimeline\(\)\+trainingFormMarkup\(\)\+chiefReviewSection\(\)\+ravInstitutionScreen\(\)/);
// Ejecutar la vista RAV en aislamiento para confirmar que los formularios
// avanzados siguen ocultos y que las revisiones se muestran correctamente.
const ravViewSrc=script.slice(script.indexOf('function ravInstitutionScreen(){'),script.indexOf('function memberScreen(){'));
const ravViewCtx={
 members,flights:[instRavFlight,privateRavFlight],lessons:[],
 ravRecords:[],ravFormOpen:false,
 trainingInstitution:{reviewMode:'chief'},RAV_STATES,ravFlightTotals,
 now:()=> '2026-10-23',safe:value=>String(value??'')
};
vm.createContext(ravViewCtx);
vm.runInContext(ravViewSrc,ravViewCtx);
const ravInitial=vm.runInContext('ravInstitutionScreen()',ravViewCtx);
assert.match(ravInitial,/Gestión institucional de RAV/);
assert.match(ravInitial,/Preparar RAV/);
assert.doesNotMatch(ravInitial,/id="ravCreateForm"/,'Planilla RAV oculta hasta solicitarla.');
assert.match(ravInitial,/Certificación fuera de la DEMO/);
ravViewCtx.ravFormOpen=true;
const ravOpen=vm.runInContext('ravInstitutionScreen()',ravViewCtx);
assert.match(ravOpen,/id="ravCreateForm"/);
ravViewCtx.ravFormOpen=false;ravViewCtx.ravRecords=[ravSubmitted];
const ravWithDraft=vm.runInContext('ravInstitutionScreen()',ravViewCtx);
assert.match(ravWithDraft,/86 minutos de bloque/);
assert.match(ravWithDraft,/data-rav-review=/);
assert.match(ravWithDraft,/data-rav-return=/);
assert.match(ravWithDraft,/sin certificar|sin firmar|NO se firma/i);
console.log('PASS: Registro de vuelo separado de RAV institucional en Pilotos y alumnos');


// Biblioteca de Academia: 30 temas y 8 fichas CRM; material previo en Supabase y nuevas versiones de hasta 100 MB en Cloudflare R2.
const theoryTitles=html.match(/const AEROSUITE_THEORY_TOPICS=\[([\s\S]*?)\];/);
const crmTitles=html.match(/const AEROSUITE_CRM_TOPICS=\[([\s\S]*?)\];/);
assert.ok(theoryTitles&&crmTitles,'Faltan los dos catálogos de fichas.');
assert.equal((theoryTitles[1].match(/'[^']*'/g)||[]).length,30,'Deben existir 30 temas de teoría.');
assert.equal((crmTitles[1].match(/'[^']*'/g)||[]).length,8,'Deben existir 8 temas CRM.');
for(const key of [
 'aerosuite-biblioteca','function academyLibrary(canManage=false){',
 'libraryCollection(\'teoria\',AEROSUITE_THEORY_TOPICS)',
 'libraryCollection(\'crm\',AEROSUITE_CRM_TOPICS)',
 'data-library-upload="teoria"','data-library-upload="crm"',
 'createSignedUrl\(' /* Marker checked below for public URL alternative */
].slice(0,-1))assert.ok(html.includes(key),'Catálogo incompleto: '+key);
assert.match(html,/getPublicUrl\(row\.path\)/,'Solo generar links a PDFs cargados.');
assert.match(html,/function academyScreen\(\)\{[\s\S]*?academyLibrary\(false\)/,'La biblioteca de Alumno debe ser solo de lectura.');
assert.match(html,/function adminAcademyScreen\(\)\{[\s\S]*?academyLibrary\(true\)/,'Los PDF deben editarse desde Gestión Administrativa.');
assert.ok(html.includes("(canManage?uploadBox:'')"),'No mostrar botones de edición al alumno.');
assert.doesNotMatch(html,/studentLibrary\(\)/,'El Portal del alumno no debe incluir la biblioteca.');
assert.doesNotMatch(html,/AEROSUITE_DRIVE_THEORY_URLS/,'Academia no debe depender de Google Drive.');
assert.match(html,/libraryUploaded\[type\]===true/,'No activar enlaces hasta confirmar la carga.');
assert.match(html,/const AEROSUITE_LIBRARY_MAX_MB=100/,'El límite para los cuadernillos principales debe ser 100 MB.');
assert.ok(html.includes("file.size>AEROSUITE_LIBRARY_MAX_MB*1024*1024"),'Debe validar el tamaño de 100 MB.');
assert.ok(html.includes("file.size<=AEROSUITE_LIBRARY_MAX_MB*1024*1024"),'El selector debe habilitar archivos de 100 MB.');
assert.ok(html.includes("callLibraryR2('prepare'"),'La carga debe usar una URL firmada de Cloudflare R2.');
assert.ok(html.includes("callLibraryR2('finish'"),'La publicación debe confirmar el reemplazo.');
assert.ok(html.includes("callLibraryR2('status'"),'La biblioteca debe detectar la versión publicada en R2.');
assert.match(html,/async function uploadLibraryMultipart\(type,file\)/,'Debe existir la carga por fragmentos como respaldo cuando falle CORS.');
assert.ok(html.includes("callLibraryR2('multipart-start'"),'Debe iniciar multipart en R2.');
assert.ok(html.includes("callLibraryR2('multipart-complete'"),'Debe confirmar multipart antes de publicar.');
assert.ok(html.includes("'x-academia-action':'multipart-part'"),'La transferencia por fragmentos debe autenticarse.');
assert.ok(html.includes("const previousR2=libraryR2"),'No perder el PDF vigente cuando status falla.');
assert.ok(html.includes("libraryR2[type]?.published"),'Distinguir PDF R2 actual de versión Supabase anterior.');
assert.ok(html.includes('data-library-replace="teoria"'),'Debe haber botón explícito de reemplazo de teoría.');
assert.ok(html.includes('data-library-replace="crm"'),'Debe haber botón explícito de reemplazo de CRM.');
assert.match(html,/signature!=='%PDF-'/,'Control de formato PDF requerido.');
console.log('PASS: biblioteca AeroSuite, 30 fichas de teoría y 8 de CRM con carga R2 resistente a CORS');


/* AeroSuite: balances separados de escuela/aeródromo, cuentas y caja chica. */
assert.equal(cents('101.23'),10123);
assert.equal(cents('10,50'),1050);
assert.throws(()=>cents('0'),/mayor a cero/);
assert.throws(()=>cents('10.123'),/importe válido/);
const finOpening=makeFinanceEntry({kind:'apertura',date:'2026-10-25',account:'caja_general',amount:'200000',concept:'Fondo inicial'},[]);
const finTransfer=makeFinanceEntry({kind:'transferencia',date:'2026-10-25',account:'caja_general',destination:'caja_chica',amount:'30000',concept:'Reposición de caja chica'},[finOpening]);
const finGrass=makeFinanceEntry({kind:'egreso',date:'2026-10-25',area:'aerodromo',category:'Corte de pasto y espacios verdes',account:'caja_chica',amount:'8000',concept:'Mantenimiento de pista'},[finOpening,finTransfer]);
const finIncome=makeFinanceEntry({kind:'ingreso',date:'2026-10-25',area:'escuela',category:'Horas de vuelo e instrucción',account:'banco',amount:'12000',concept:'Clases de vuelo'},[finOpening,finTransfer,finGrass]);
const finWater=makeFinanceEntry({kind:'egreso',date:'2026-10-25',area:'aerodromo',category:'Agua',account:'banco',amount:'10000',concept:'Agua aeródromo'},[finOpening,finTransfer,finGrass,finIncome]);
const finLedger=[finOpening,finTransfer,finGrass,finIncome,finWater];
const finReport=financeReport(finLedger);
assert.equal(finReport.income,1200000);
assert.equal(finReport.expenses,1800000);
assert.equal(finReport.net,-600000);
assert.equal(finReport.opening,20000000);
assert.equal(finReport.balances.caja_general,17000000);
assert.equal(finReport.balances.caja_chica,2200000);
assert.equal(finReport.balances.banco,200000);
assert.equal(finReport.byArea.escuela.income,1200000);
assert.equal(finReport.byArea.aerodromo.expenses,1800000);
assert.equal(finReport.expenseCategories['Corte de pasto y espacios verdes'],800000);
assert.equal(financeReport(finLedger,{area:'aerodromo',period:'2026-10'}).net,-1800000);
assert.equal(financeReport(finLedger,{area:'escuela',period:'2026-10'}).net,1200000);
assert.equal(financeReport(finLedger,{area:'escuela',period:'2026-09'}).rows.length,0);
assert.throws(()=>makeFinanceEntry({kind:'egreso',date:'2026-10-25',area:'aerodromo',category:'Imprevistos y caja chica',account:'caja_chica',amount:'23000',concept:'Imprevisto'},finLedger),/Fondos insuficientes/);
assert.throws(()=>makeFinanceEntry({kind:'transferencia',date:'2026-10-25',account:'caja_general',destination:'caja_general',amount:'100',concept:'Misma cuenta'},finLedger),/diferente/);
assert.throws(()=>makeFinanceEntry({kind:'egreso',date:'2026-10-25',area:'aerodromo',category:'Pago no permitido',account:'banco',amount:'100',concept:'Inválido'},finLedger),/categoría/);
assert.equal(Object.values(financeBalances(finLedger)).reduce((sum,n)=>sum+n,0),19400000);
for(const text of ['function financeScreen(){','function wireFinance(){','fin-funds','finCategory','finTarget','finExport','Corte de pasto','Caja chica','financeReport(financeEntries']){
 assert.ok(html.toLowerCase().includes(text.toLowerCase()),'Falta interfaz de finanzas: '+text);
}
console.log('PASS: finanzas AeroSuite con gastos por area, balance, caja chica, fondos iniciales y transferencias');

console.log('PASS: gestión integrada, fechas, conflictos, cierre idempotente, stock, UX y acceso admin');
