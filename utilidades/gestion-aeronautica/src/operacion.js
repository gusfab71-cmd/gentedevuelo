// Lógica de DEMOSTRACIÓN. No autoriza operaciones ni consulta registros oficiales de ANAC.
export const minutes = time => {
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Hora inválida.');
 const [h,m]=time.split(':').map(Number);return 60*h+m;
};
// Valores iniciales de la turnera: los define cada institución, no una regla universal.
export const STUDENT_RESERVATION_MINUTES=90;
export const DEFAULT_RESERVATION_POLICY=Object.freeze({
 schoolName:'Escuela de demostración',
 studentMinMinutes:STUDENT_RESERVATION_MINUTES,studentDefaultMinutes:STUDENT_RESERVATION_MINUTES,
 pilotDefaultMinutes:60,slotMinutes:30,
 openTime:'08:00',closeTime:'20:00',
 availableWeekdays:[0,1,2,3,4,5,6],
 showActivity:false,showNotes:false
});
export function validateReservationPolicy(value){
 if(!value||typeof value!=='object')throw Error('Falta configurar la turnera de la escuela.');
 const min=Number(value.studentMinMinutes),studentDefault=Number(value.studentDefaultMinutes),pilotDefault=Number(value.pilotDefaultMinutes),step=Number(value.slotMinutes);
 if(![min,studentDefault,pilotDefault].every(n=>Number.isInteger(n)&&n>=15&&n<=480&&n%15===0))
  throw Error('Las duraciones deben estar entre 15 y 480 minutos, en múltiplos de 15.');
 if(studentDefault<min)throw Error('La duración sugerida para alumnos debe ser mayor o igual a su mínimo.');
 if(![15,30,60].includes(step))throw Error('Los intervalos deben ser de 15, 30 o 60 minutos.');
 const from=minutes(value.openTime),to=minutes(value.closeTime);
 if(from>=to)throw Error('El horario de cierre debe ser posterior al horario de apertura.');
 if(from%step!==0)throw Error('La apertura debe coincidir con la grilla de intervalos seleccionada.');
 if(to-from<min)throw Error('La jornada debe permitir al menos una reserva mínima de alumno.');
 if(!Array.isArray(value.availableWeekdays)||!value.availableWeekdays.length||
  value.availableWeekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||
  new Set(value.availableWeekdays).size!==value.availableWeekdays.length)
   throw Error('Seleccioná al menos un día habilitado, sin valores duplicados.');
 return {
  schoolName:String(value.schoolName||'Escuela sin nombre').trim().slice(0,80)||'Escuela sin nombre',
  studentMinMinutes:min,studentDefaultMinutes:studentDefault,pilotDefaultMinutes:pilotDefault,slotMinutes:step,
  openTime:value.openTime,closeTime:value.closeTime,
  availableWeekdays:[...value.availableWeekdays].sort((a,b)=>a-b),
  showActivity: value.showActivity===true,showNotes:value.showNotes===true
 };
}
export const reservationMinimumMinutes=(person,policy=DEFAULT_RESERVATION_POLICY)=>person?.kind==='alumno'?policy.studentMinMinutes:0;
export const reservationSuggestedMinutes=(person,policy=DEFAULT_RESERVATION_POLICY)=>person?.kind==='alumno'?policy.studentDefaultMinutes:policy.pilotDefaultMinutes;
export const validDate = date => {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const d=new Date(date+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date;
};
export const intersects=(a,b)=>a.date===b.date&&minutes(a.start)<minutes(b.end)&&minutes(b.start)<minutes(a.end);
export function createReservation(req,current,fleet,members,schoolPolicy=DEFAULT_RESERVATION_POLICY){
 const policy=validateReservationPolicy(schoolPolicy);
 if(!validDate(req.date)||!req.aircraft||!req.pilot)throw Error('Completá fecha, aeronave y piloto.');
 if(minutes(req.start)>=minutes(req.end))throw Error('La hora de finalización debe ser posterior al inicio.');
 const plane=fleet.find(a=>a.id===req.aircraft),pilot=members.find(p=>p.id===req.pilot);
 if(!plane||!pilot||pilot.kind==='instructor')throw Error('Piloto o aeronave inexistente.');
 if(minutes(req.end)-minutes(req.start)<reservationMinimumMinutes(pilot,policy))
  throw Error('Las reservas de alumnos requieren al menos '+policy.studentMinMinutes+' minutos según la turnera de esta escuela'+(policy.studentMinMinutes===90?' (1 hora y 30 minutos)':'')+'.');
 const day=new Date(req.date+'T12:00:00Z').getUTCDay();
 if(!policy.availableWeekdays.includes(day))throw Error('La escuela no recibe reservas para ese día de la semana.');
 const from=minutes(req.start),to=minutes(req.end);
 if(from<minutes(policy.openTime)||to>minutes(policy.closeTime))
  throw Error('La reserva debe estar dentro del horario de la escuela: '+policy.openTime+' a '+policy.closeTime+'.');
 if((from-minutes(policy.openTime))%policy.slotMinutes!==0)
  throw Error('La hora de inicio debe respetar intervalos de '+policy.slotMinutes+' minutos desde la apertura.');
 if(req.activity&&String(req.activity).length>140)throw Error('Actividad demasiado extensa.');
 if(req.notes&&String(req.notes).length>250)throw Error('Observación demasiado extensa.');
 if(plane.blocked)throw Error('Aeronave bloqueada administrativamente.');
 if(plane.insuranceUntil<req.date)throw Error('Seguro declarado vencido: requiere validación técnica/administrativa.');
 if(!pilot.licenseUntil||!pilot.cmaUntil||pilot.licenseUntil<req.date||pilot.cmaUntil<req.date)throw Error('La licencia/habilitación o CMA declarada requiere actualización.');
 if(req.instructor){
  const instructor=members.find(p=>p.id===req.instructor&&p.kind==='instructor');
  if(!instructor)throw Error('Instructor inexistente.');
  if(!instructor.licenseUntil||!instructor.cmaUntil||instructor.licenseUntil<req.date||instructor.cmaUntil<req.date)
   throw Error('Instructor con licencia o CMA declarada sin vigencia suficiente.');
 }
 if(pilot.kind==='alumno'&&!req.instructor)throw Error('La práctica de alumno requiere instructor asignado en esta demostración.');
 const conflict=current.some(x=>x.status==='confirmada'&&intersects(x,req)&&(x.aircraft===req.aircraft||x.pilot===req.pilot||Boolean(req.instructor)&&x.instructor===req.instructor));
 if(conflict)throw Error('Conflicto de horario de aeronave o instructor.');
 return {...req,id:crypto.randomUUID(),status:'confirmada',createdAt:new Date().toISOString()};
}
export function closeFlight(data,booking,flights,fleet){
 if(booking?.type&&booking.type!=='flight')throw Error('Solo las reservas de vuelo pueden generar horas de aeronave.');
 if(!booking||booking.status!=='confirmada')throw Error('Solo se pueden cerrar reservas confirmadas.');
 if(flights.some(f=>f.reservationId===booking.id))throw Error('Esta reserva ya tiene un vuelo cerrado.');
 if(!data.from?.trim()||!data.to?.trim())throw Error('Indicá origen y destino.');
 const elapsed=minutes(data.end)-minutes(data.start);
 if(elapsed<=0||elapsed>24*60)throw Error('Horario de vuelo inválido.');
 const t0=Number(data.tachStart),t1=Number(data.tachEnd);
 if(!Number.isFinite(t0)||!Number.isFinite(t1)||t0<0||t1<t0)throw Error('Lecturas del tacómetro inválidas.');
 const landings=Number(data.landings);
 if(!Number.isInteger(landings)||landings<0||landings>30)throw Error('Número de aterrizajes inválido.');
 const rate=Number(fleet.find(x=>x.id===booking.aircraft)?.rate??0);
 const blockHours=Number((elapsed/60).toFixed(2));
 return {id:crypto.randomUUID(),reservationId:booking.id,aircraft:booking.aircraft,pilot:booking.pilot,
 instructor:booking.instructor||'',date:booking.date,from:data.from.trim().toUpperCase(),to:data.to.trim().toUpperCase(),
 start:data.start,end:data.end,blockHours,tachDifference:Number((t1-t0).toFixed(2)),
 landings,cost:Number((blockHours*rate).toFixed(2)),status:'demo',createdAt:new Date().toISOString()};
}
export const flightTotals=(flights,key)=>flights.reduce((o,f)=>(o[f[key]]=(o[f[key]]||0)+f.blockHours,o),{});
export function stockMove(item,qty,kind){
 const amount=Number(qty);
 if(!Number.isFinite(amount)||amount<=0)throw Error('Cantidad inválida.');
 if(kind!=='entrada'&&kind!=='salida')throw Error('Tipo de movimiento inválido.');
 const next=Number(item.qty)+(kind==='entrada'?amount:-amount);
 if(next<0)throw Error('No hay stock disponible suficiente.');
 return Number(next.toFixed(3));
}
