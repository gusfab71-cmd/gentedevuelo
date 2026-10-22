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
export function finishGroundLesson(booking,instructorId,completed=[]){
 if(!booking||!['theory','simulator'].includes(booking.type)||booking.status!=='confirmada')
  throw Error('La clase de teoría o simulador debe estar confirmada.');
 if(booking.instructor!==instructorId)throw Error('Solo el instructor asignado puede registrar la clase.');
 if(completed.some(x=>x.bookingId===booking.id))throw Error('Esa actividad ya fue registrada.');
 return {id:crypto.randomUUID(),bookingId:booking.id,type:booking.type,pilot:booking.pilot,
  instructor:instructorId,date:booking.date,minutes:minutes(booking.end)-minutes(booking.start),
  status:'realizada_demo',createdAt:new Date().toISOString()};
}
// Proyección: únicamente los campos que necesita un alumno; nunca se devuelve evaluación interna.
export function studentPortalProjection(studentId,bookings,flights,lessons,packs=[] ,activities=[]){
 return {
  reservations:bookings.filter(x=>x.pilot===studentId).map(x=>({
   id:x.id,type:x.type||'flight',date:x.date,start:x.start,end:x.end,
   aircraft:x.aircraft||'',resourceId:x.resourceId||'',status:x.status
  })),
  flightHours:Number(flights.filter(x=>x.pilot===studentId).reduce((sum,x)=>sum+(Number(x.blockHours)||0),0).toFixed(2)),
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
