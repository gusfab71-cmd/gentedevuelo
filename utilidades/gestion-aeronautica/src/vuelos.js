// Seguimiento de vuelos DEMO. No constituye Libro de Vuelo o RAV oficial.
// Clasificar siempre por rol del titular y presencia de instructor; no inferir licencias oficiales.
export const FLIGHT_MODE_LABELS=Object.freeze({
 instruction:'Instrucción con instructor',
 private:'Piloto privado · sin instructor',
 coached:'Piloto con instructor'
});
export function classifyFlightBooking(booking,members=[]){
 if(!booking||!booking.pilot||!booking.aircraft)throw Error('Faltan datos de matrícula y piloto.');
 const person=members.find(x=>x.id===booking.pilot);
 if(person&&person.kind!=='alumno'&&person.kind!=='piloto')
  throw Error('El titular del vuelo debe ser alumno o piloto.');
 const instructor=String(booking.instructor||'').trim();
 if(person?.kind==='alumno'&&!instructor)
  throw Error('Un vuelo de instrucción de alumno debe tener instructor asignado.');
 if(instructor&&instructor===booking.pilot)
  throw Error('El instructor no puede ser el mismo titular del vuelo.');
 if(instructor&&members.length&&!members.some(x=>x.id===instructor&&x.kind==='instructor'))
  throw Error('Instructor de vuelo inválido.');
 if(person?.kind==='alumno')return 'instruction';
 if(instructor)return 'coached';
 return 'private';
}
export function flightActivityProjection(personId,flights,mode='all'){
 if(!personId)throw Error('Falta la identificación del titular.');
 if(!['all','instruction','private','coached'].includes(mode))
  throw Error('Filtro de modalidad inválido.');
 const own=flights.filter(f=>f.pilot===personId&&(!f.operationType||Object.hasOwn(FLIGHT_MODE_LABELS,f.operationType)))
  .filter(f=>mode==='all'||f.operationType===mode)
  .slice().sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 const rows=own.map(f=>({
  id:f.id,date:f.date,aircraft:f.aircraft,
  origin:f.from,destination:f.to,instructor:f.instructor||'',
  operationType:f.operationType||'unspecified',
  blockHours:Number(f.blockHours||0),
  tachDifference:Number(f.tachDifference||0),
  landings:Number(f.landings||0),
  start:f.start,end:f.end
 }));
 const summarize=selected=>({
  flights:selected.length,
  minutes:selected.reduce((n,f)=>n+((Number.isInteger(f.blockMinutes)&&f.blockMinutes>=0)?
   f.blockMinutes:Math.round(Number(f.blockHours||0)*60)),0),
  landings:selected.reduce((n,f)=>n+Number(f.landings||0),0)
 });
 const all=summarize(rows.map(x=>{
  const original=own.find(f=>f.id===x.id);
  return original;
 }));
 const hours=Number((all.minutes/60).toFixed(2));
 const breakdown={};
 for(const kind of ['instruction','private','coached']){
  const data=summarize(own.filter(x=>x.operationType===kind));
  breakdown[kind]={flights:data.flights,hours:Number((data.minutes/60).toFixed(2)),landings:data.landings};
 }
 return {personId,rows,flights:all.flights,blockMinutes:all.minutes,blockHours:hours,
  landings:all.landings,byMode:breakdown};
}
export function flightActivityByRole(personId,kind,flights){
 if(!['alumno','piloto'].includes(kind))throw Error('Rol personal de vuelo inválido.');
 return flightActivityProjection(personId,flights,kind==='alumno'?'instruction':'private');
}
