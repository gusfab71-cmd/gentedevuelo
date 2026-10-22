// DEMOSTRACIÓN ADMINISTRATIVA. La privacidad real exige roles autenticados y RLS institucional.
import {minutes,validDate,validateReservationPolicy,DEFAULT_RESERVATION_POLICY} from './operacion.js';

export const ACTIVITY_TYPES=Object.freeze({
 flight:'Vuelo de instrucción en avión',
 theory:'Clase de teoría',
 simulator:'Práctica en simulador'
});
export const DEMO_RESOURCES=Object.freeze([
 Object.freeze({id:'aula-1',type:'theory',name:'Aula teórica A'}),
 Object.freeze({id:'sim-1',type:'simulator',name:'Simulador de instrucción 1'})
]);
export const activeBooking=s=>s==='solicitada'||s==='confirmada';
const overlap=(a,b)=>a.date===b.date&&minutes(a.start)<minutes(b.end)&&minutes(b.start)<minutes(a.end);
const checkSchool=(data,policy)=>{
 const p=validateReservationPolicy(policy);
 if(!validDate(data.date))throw Error('Fecha de turno inválida.');
 const day=new Date(data.date+'T12:00:00Z').getUTCDay();
 if(!p.availableWeekdays.includes(day))throw Error('La escuela no recibe reservas ese día.');
 const start=minutes(data.start),end=minutes(data.end);
 if(start>=end)throw Error('La finalización debe ser posterior al inicio.');
 if(end-start<p.studentMinMinutes)throw Error('La escuela exige como mínimo '+p.studentMinMinutes+' minutos para alumnos.');
 if(start<minutes(p.openTime)||end>minutes(p.closeTime))
  throw Error('El turno está fuera del horario de la escuela.');
 if((start-minutes(p.openTime))%p.slotMinutes!==0)throw Error('El inicio no coincide con los intervalos de la turnera.');
 return p;
};
export function requestStudentBooking(data,student,bookings,fleet,resources=DEMO_RESOURCES,policy=DEFAULT_RESERVATION_POLICY){
 checkSchool(data,policy);
 if(!student||student.kind!=='alumno'||data.pilot!==student.id)throw Error('La solicitud debe pertenecer al alumno.');
 if(!Object.hasOwn(ACTIVITY_TYPES,data.type))throw Error('Seleccioná vuelo, teoría o simulador.');
 let aircraft='',resourceId='';
 if(data.type==='flight'){
  const plane=fleet.find(x=>x.id===data.aircraft);
  if(!plane||plane.blocked)throw Error('Aeronave no disponible para la solicitud.');
  if(plane.insuranceUntil<data.date)throw Error('Seguro de la aeronave declarado vencido.');
  if(!student.licenseUntil||!student.cmaUntil||student.licenseUntil<data.date||student.cmaUntil<data.date)
   throw Error('La documentación declarada del alumno requiere revisión.');
  aircraft=plane.id;
 }else{
  const resource=resources.find(x=>x.id===data.resourceId&&x.type===data.type);
  if(!resource)throw Error('Seleccioná el aula o simulador correspondiente.');
  resourceId=resource.id;
 }
 if(bookings.some(x=>activeBooking(x.status)&&x.pilot===student.id&&overlap(x,data)))
  throw Error('Ya tenés otra actividad reservada para ese horario.');
 // En solicitud preliminar no se bloquea todavía el recurso: se valida otra vez al tomarla.
 return {id:crypto.randomUUID(),date:data.date,start:data.start,end:data.end,type:data.type,
  pilot:student.id,aircraft,resourceId,instructor:'',status:'solicitada',
  createdAt:new Date().toISOString(),history:[{event:'solicitada',actor:student.id,at:new Date().toISOString()}]};
}
export function takeStudentBooking(booking,instructor,bookings,members,policy=DEFAULT_RESERVATION_POLICY,fleet=[]){
 if(!booking||booking.status!=='solicitada')throw Error('Solo se pueden tomar solicitudes pendientes.');
 if(!instructor||instructor.kind!=='instructor'||!members.some(m=>m.id===instructor.id&&m.kind==='instructor'))
  throw Error('Se requiere un instructor autorizado.');
 checkSchool(booking,policy);
 if(booking.type==='flight'&&fleet.length){
  const plane=fleet.find(x=>x.id===booking.aircraft);
  if(!plane||plane.blocked||plane.insuranceUntil<booking.date)
   throw Error('La aeronave dejó de estar disponible; verificá mantenimiento y seguro.');
 }
 if(!instructor.licenseUntil||!instructor.cmaUntil||
    instructor.licenseUntil<booking.date||instructor.cmaUntil<booking.date)
  throw Error('La documentación declarada del instructor requiere actualización.');
 const conflicting=bookings.some(x=>x.id!==booking.id&&x.status==='confirmada'&&overlap(x,booking)&&
   (x.instructor===instructor.id||x.pilot===booking.pilot||
    booking.type==='flight'&&x.aircraft&&x.aircraft===booking.aircraft||
    booking.type!=='flight'&&x.resourceId&&x.resourceId===booking.resourceId));
 if(conflicting)throw Error('Conflicto de disponibilidad de instructor, alumno o recurso.');
 return {...booking,status:'confirmada',instructor:instructor.id,
  acceptedAt:new Date().toISOString(),
  history:[...(booking.history||[]),{event:'tomada',actor:instructor.id,at:new Date().toISOString()}]};
}
export function finishGroundLesson(booking,instructorId,completed=[],actualMinutes=null){
 if(!booking||!['theory','simulator'].includes(booking.type)||booking.status!=='confirmada')
  throw Error('La clase de teoría o simulador debe estar confirmada.');
 if(booking.instructor!==instructorId)throw Error('Solo el instructor asignado puede registrar la clase.');
 if(completed.some(x=>x.bookingId===booking.id))throw Error('Esa actividad ya fue registrada.');
 const reserved=minutes(booking.end)-minutes(booking.start);
 const duration=actualMinutes===null?reserved:Number(actualMinutes);
 if(!Number.isInteger(duration)||duration<1||duration>reserved)
  throw Error('Indicá minutos efectivamente realizados, entre 1 y la duración reservada.');
 return {id:crypto.randomUUID(),bookingId:booking.id,type:booking.type,pilot:booking.pilot,
  instructor:instructorId,date:booking.date,minutes:duration,
  deviceId:booking.type==='simulator'?booking.resourceId:'', // Identificador de equipo; NO acredita horas de vuelo
  status:'realizada_demo',createdAt:new Date().toISOString()};
}
export const DEFAULT_TRAINING_GOALS=Object.freeze({
 flightHours:40,simulatorHours:5,theoryHours:0
});
export function validateTrainingGoals(raw){
 if(!raw||typeof raw!=='object')throw Error('Falta configurar el plan de formación.');
 const goals={};
 for(const field of ['flightHours','simulatorHours','theoryHours']){
  const n=Number(raw[field]);
  if(!Number.isFinite(n)||n<0||n>500||Math.round(n*4)!==n*4)
   throw Error('Los objetivos de horas deben ser válidos, no negativos y en cuartos de hora.');
  goals[field]=n;
 }
 return goals;
}
export function trainingHours(studentId,flights,activities){
 const own=activities.filter(x=>x.pilot===studentId&&x.status==='realizada_demo');
 const summation=(kind)=>own.filter(x=>x.type===kind).reduce((n,x)=>n+Number(x.minutes||0),0);
 const simulatorMinutes=summation('simulator'),theoryMinutes=summation('theory');
 const flightTotalMinutes=flights.filter(x=>x.pilot===studentId).reduce((n,x)=>
  n+(Number.isInteger(x.blockMinutes)&&x.blockMinutes>=0?x.blockMinutes:Math.round(Number(x.blockHours||0)*60)),0);
 return {
  flightHours:Number((flightTotalMinutes/60).toFixed(2)),
  simulatorMinutes,theoryMinutes,
  simulatorHours:Number((simulatorMinutes/60).toFixed(2)),
  theoryHours:Number((theoryMinutes/60).toFixed(2))
 };
}
export function trainingProgress(hours,rawGoals=DEFAULT_TRAINING_GOALS){
 const goals=validateTrainingGoals(rawGoals);
 const progress={};
 for(const [key,required] of Object.entries(goals)){
  const completed=Math.max(0,Number(hours[key]||0));
  progress[key]={
   completed:Number(completed.toFixed(2)),required,
   remaining:Number(Math.max(0,required-completed).toFixed(2)),
   percentage:required?Math.min(100,Math.round(completed/required*100)):null
  };
 }
 return progress;
}
// Proyección: únicamente los campos que necesita un alumno; nunca se devuelve evaluación interna.
export function studentPortalProjection(studentId,bookings,flights,lessons,packs=[] ,activities=[],goals=DEFAULT_TRAINING_GOALS){
 const hours=trainingHours(studentId,flights,activities);
 return {
  flightHours:hours.flightHours,
  simulatorHours:hours.simulatorHours,theoryHours:hours.theoryHours,
  simulatorMinutes:hours.simulatorMinutes,theoryMinutes:hours.theoryMinutes,
  progress:trainingProgress(hours,goals),
  reservations:bookings.filter(x=>x.pilot===studentId).map(x=>({
   id:x.id,type:x.type||'flight',date:x.date,start:x.start,end:x.end,
   aircraft:x.aircraft||'',resourceId:x.resourceId||'',status:x.status
  })),
  practices:lessons.filter(x=>x.studentId===studentId&&['approved','instructor_closed'].includes(x.status))
   .map(x=>({id:x.id,date:x.date,topics:x.topics,minutes:x.minutes,
    type:x.classType||'flight',status:'registrada'})),
  groundActivities:activities.filter(x=>x.pilot===studentId).map(x=>({
   id:x.id,type:x.type,date:x.date,minutes:x.minutes,status:x.status
  })),
  packs:packs.filter(x=>x.studentId===studentId).map(x=>({
   id:x.id,description:x.description,acquiredHours:x.acquiredHours,remainingHours:x.remainingHours
  }))
 };
}
export function instructorPortalProjection(instructorId,bookings,lessons,activities=[]){
 return {
  pending:bookings.filter(x=>x.status==='solicitada').map(x=>({
   id:x.id,pilot:x.pilot,type:x.type||'flight',date:x.date,start:x.start,end:x.end,
   aircraft:x.aircraft,resourceId:x.resourceId
  })),
  assigned:bookings.filter(x=>x.status==='confirmada'&&x.instructor===instructorId),
  lessons:lessons.filter(x=>x.instructorId===instructorId),
  groundActivities:activities.filter(x=>x.instructor===instructorId)
 };
}
