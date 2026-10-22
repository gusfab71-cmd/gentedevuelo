// Lógica de DEMOSTRACIÓN. No autoriza operaciones ni consulta registros oficiales de ANAC.
export const minutes = time => {
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Hora inválida.');
 const [h,m]=time.split(':').map(Number);return 60*h+m;
};
export const validDate = date => {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const d=new Date(date+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date;
};
export const intersects=(a,b)=>a.date===b.date&&minutes(a.start)<minutes(b.end)&&minutes(b.start)<minutes(a.end);
export function createReservation(req,current,fleet,members){
 if(!validDate(req.date)||!req.aircraft||!req.pilot)throw Error('Completá fecha, aeronave y piloto.');
 if(minutes(req.start)>=minutes(req.end))throw Error('La hora de finalización debe ser posterior al inicio.');
 const plane=fleet.find(a=>a.id===req.aircraft),pilot=members.find(p=>p.id===req.pilot);
 if(!plane||!pilot||pilot.kind==='instructor')throw Error('Piloto o aeronave inexistente.');
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
 const conflict=current.some(x=>x.status==='confirmada'&&intersects(x,req)&&(x.aircraft===req.aircraft||Boolean(req.instructor)&&x.instructor===req.instructor));
 if(conflict)throw Error('Conflicto de horario de aeronave o instructor.');
 return {...req,id:crypto.randomUUID(),status:'confirmada',createdAt:new Date().toISOString()};
}
export function closeFlight(data,booking,flights,fleet){
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
