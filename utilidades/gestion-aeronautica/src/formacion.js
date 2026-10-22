// Prototipo educativo en memoria: las decisiones del instructor y del jefe son SIMULADAS.
// La autorización real por rol y la custodia de legajos requieren backend, RLS y auditoría de servidor.
export const ASSESSMENTS={
  introduced:'Introducción',
  developing:'En práctica',
  reinforce:'Requiere refuerzo',
  achieved:'Logrado según instructor'
};
export const LESSON_STATUS={
  draft:'Borrador',
  submitted:'Pendiente de revisión',
  returned:'Devuelta al instructor',
  approved:'Revisada por jefe de instructores',
  instructor_closed:'Cerrada por instructor (sin jefatura)'
};
const dateOK=(value)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
};
const clean=(value,limit)=>String(value??'').trim().slice(0,limit);
const required=(value,limit,name)=>{
 const result=clean(value,limit);
 if(!result)throw new Error('Falta '+name+'.');
 return result;
};
const logEvent=(action,by,detail,revision)=>Object.freeze({
  id:crypto.randomUUID(),action,actor:String(by),detail:String(detail),revision,
  date:new Date().toISOString()
});
const withoutDraft=(lesson)=>({
 id:lesson.id,studentId:lesson.studentId,instructorId:lesson.instructorId,
 bookingId:lesson.bookingId||'',classType:lesson.classType||'flight',
 flightId:lesson.flightId,date:lesson.date,minutes:lesson.minutes,
 aircraft:lesson.aircraft,topics:lesson.topics,evolution:lesson.evolution,
 difficulties:lesson.difficulties,nextGoal:lesson.nextGoal,assessment:lesson.assessment,
 hours:lesson.hours,revision:lesson.revision
});
export function buildLesson(data,students,instructors,flights=[],existing=[],bookings=[]){
 if(!students.some(s=>s.id===data.studentId&&s.kind==='alumno'))
  throw Error('Seleccioná un alumno registrado.');
 if(!instructors.some(s=>s.id===data.instructorId&&s.kind==='instructor'))
  throw Error('Seleccioná un instructor registrado.');
 if(!dateOK(data.date))throw Error('Fecha de clase inválida.');
 const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 if(data.date>today)throw Error('No se pueden registrar clases futuras como realizadas.');
 const duration=Number(data.minutes);
 if(!Number.isInteger(duration)||duration<1||duration>600)throw Error('Duración de instrucción inválida.');
 if(!Object.hasOwn(ASSESSMENTS,data.assessment))throw Error('Estado de evolución inválido.');
 const bookingId=clean(data.bookingId,100);
 let classType='flight';
 if(bookingId){
  const booking=bookings.find(b=>b.id===bookingId&&b.status==='confirmada');
  if(!booking||booking.pilot!==data.studentId||booking.instructor!==data.instructorId||booking.date!==data.date)
   throw Error('La reserva no coincide con alumno, instructor y fecha.');
  classType=booking.type||'flight';
  if(existing.some(l=>l.bookingId===bookingId))throw Error('La clase de esa reserva ya tiene evaluación.');
 }
 const flightId=clean(data.flightId,100);
 if(classType!=='flight'&&flightId)throw Error('Las clases teóricas o de simulador no pueden sumar horas de vuelo.');
 let hours=0;
 if(flightId){
  const match=flights.find(f=>f.id===flightId&&f.pilot===data.studentId&&f.instructor===data.instructorId);
  if(!match)throw Error('El vuelo no coincide con el alumno y el instructor.');
  if(match.date!==data.date)throw Error('Fecha de clase y de vuelo no coinciden.');
  if(existing.some(x=>x.flightId===flightId))
   throw Error('Ese vuelo ya tiene una ficha de instrucción.');
  hours=Number(match.blockHours)||0;
 }
 const record={
  id:crypto.randomUUID(),revision:1,studentId:data.studentId,instructorId:data.instructorId,
  bookingId,classType,flightId,date:data.date,minutes:duration,hours,
  aircraft:clean(data.aircraft,50),
  topics:required(data.topics,1000,'la actividad realizada'),
  evolution:required(data.evolution,1000,'la evolución observada'),
  difficulties:clean(data.difficulties,1000),
  nextGoal:required(data.nextGoal,1000,'el objetivo de la próxima clase'),
  assessment:data.assessment,
  status:'draft',chiefReview:null,
  updatedAt:new Date().toISOString(),history:[]
 };
 record.history=[logEvent('created',data.instructorId,'Ficha de evolución creada · revisión 1',1)];
 return record;
}
export function reviseLesson(lesson,changes,instructorId){
 if(lesson.instructorId!==instructorId)throw Error('Solo el instructor asignado puede modificar su ficha.');
 if(!['draft','returned'].includes(lesson.status))throw Error('La ficha enviada o revisada no se puede editar.');
 const revised={
  ...lesson,
  topics:required(changes.topics,1000,'la actividad realizada'),
  evolution:required(changes.evolution,1000,'la evolución observada'),
  difficulties:clean(changes.difficulties,1000),
  nextGoal:required(changes.nextGoal,1000,'el próximo objetivo'),
  assessment:changes.assessment
 };
 if(!Object.hasOwn(ASSESSMENTS,revised.assessment))throw Error('Evolución inválida.');
 const revision=lesson.revision+1;
 return {
  ...revised,revision,status:'draft',chiefReview:null,updatedAt:new Date().toISOString(),
  history:[...lesson.history,logEvent('edited',instructorId,JSON.stringify({before:withoutDraft(lesson),after:withoutDraft({...revised,revision})}),revision)]
 };
}
export function submitLesson(lesson,instructorId){
 if(lesson.instructorId!==instructorId)throw Error('Solo el instructor asignado puede enviar la ficha.');
 if(lesson.status!=='draft')throw Error('La ficha debe estar en borrador para enviarla.');
 const snapshot=JSON.parse(JSON.stringify(withoutDraft(lesson)));
 return {
  ...lesson,status:'submitted',submittedAt:new Date().toISOString(),
  history:[...lesson.history,logEvent('submitted',instructorId,JSON.stringify(snapshot),lesson.revision)]
 };
}
// En organizaciones no CIAC puede configurarse cierre pedagógico por instructor.
// No sustituye las certificaciones requeridas para cursos regulados ni la firma del Libro de Vuelo.
export function closeLessonByInstructor(lesson,instructorId,configuration){
 if(configuration?.institutionType!=='non_ciac'||configuration?.reviewMode!=='instructor')
  throw Error('El cierre por instructor solo está disponible en una institución no CIAC configurada sin jefatura.');
 if(!lesson||lesson.instructorId!==instructorId)
  throw Error('Solo el instructor responsable puede cerrar su propia ficha.');
 if(lesson.status!=='draft')
  throw Error('Solo pueden cerrarse fichas en borrador; los pendientes de jefatura requieren una resolución previa.');
 const date=new Date().toISOString(),snapshot=JSON.stringify(withoutDraft(lesson));
 return {
  ...lesson,status:'instructor_closed',closedAt:date,closedBy:instructorId,
  reviewMode:'instructor',chiefReview:null,
  history:[...lesson.history,logEvent('instructor_closed',instructorId,snapshot,lesson.revision)]
 };
}
export function reviewLesson(lesson,chiefId,decision,reason){
 if(!chiefId||typeof chiefId!=='string')throw Error('Falta identificación del jefe de instructores.');
 if(lesson.status!=='submitted')throw Error('Solo se pueden revisar fichas pendientes.');
 if(!['approved','returned'].includes(decision))throw Error('Decisión de revisión inválida.');
 const explanation=clean(reason,900);
 if(decision==='returned'&&!explanation)throw Error('Para devolver una ficha se requiere una observación.');
 const reviewedAt=new Date().toISOString();
 return {
  ...lesson,status:decision,
  chiefReview:{by:chiefId,date:reviewedAt,decision,reason:explanation,revision:lesson.revision},
  history:[...lesson.history,logEvent(decision,chiefId,explanation||'Revisión administrativa aprobada (demo)',lesson.revision)]
 };
}
export function studentTimeline(lessons,studentId){
 return lessons.filter(x=>x.studentId===studentId)
  .slice().sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));
}
export function studentSummary(lessons,studentId){
 const entries=studentTimeline(lessons,studentId);
 return {
  lessons:entries.length,
  approved:entries.filter(x=>x.status==='approved').length,
  instructorClosed:entries.filter(x=>x.status==='instructor_closed').length,
  pending:entries.filter(x=>x.status==='submitted').length,
  returned:entries.filter(x=>x.status==='returned').length,
  trainingMinutes:entries.reduce((n,x)=>n+x.minutes,0),
  flightBlockHours:entries.reduce((n,x)=>n+x.hours,0),
  latestAssessment:entries[0]?.assessment||null
 };
}
