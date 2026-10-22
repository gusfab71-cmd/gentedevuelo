// Registro auxiliar de libro de vuelo. DEMO, no es Libro de Vuelo ni RAV oficial.
// Casilleros conforme a la hoja completa fotografiada por el usuario el 22/10/2026.
// Ninguna columna asigna por sí sola privilegios PIC, habilitaciones ni certificación.
export const LOGBOOK_PURPOSES=Object.freeze({
 instruccion:'Instrucción',particular:'Vuelo particular',entrenamiento:'Entrenamiento',
 adaptacion:'Adaptación',travesia:'Travesía',otro:'Otra actividad'
});
export const LOGBOOK_TIME_COLUMNS=Object.freeze({
 airportDayPilot:'Sobre aeródromo · Día · Piloto',
 airportDayCopilot:'Sobre aeródromo · Día · Copiloto',
 airportNightPilot:'Sobre aeródromo · Noche · Piloto',
 airportNightCopilot:'Sobre aeródromo · Noche · Copiloto',
 crosscountryDayPilot:'Travesía · Día · Piloto',
 crosscountryDayCopilot:'Travesía · Día · Copiloto',
 crosscountryNightPilot:'Travesía · Noche · Piloto',
 crosscountryNightCopilot:'Travesía · Noche · Copiloto'
});
export const LOGBOOK_SPECIAL_COLUMNS=Object.freeze({
 instructorFlight:'Instructor de vuelo',
 multiEngine:'Multimotor',jet:'Reactor',turboprop:'Turbohélice',
 aerialApplication:'Aeroaplicador',
 instrumentRealPilot:'Instrumentos · Real · Piloto',
 instrumentRealCopilot:'Instrumentos · Real · Copiloto',
 instrumentHood:'Instrumentos · Capota'
});
export const LOGBOOK_SIMULATOR_COLUMNS=Object.freeze({
 simulatorInstructor:'Adiestrador terrestre / simulador · Instructor',
 simulatorTrainee:'Adiestrador terrestre / simulador · Piloto en instrucción'
});
const whole=(v,max=1440)=>{
 // Number('') === 0; no tomar campos obligatorios vacíos como horas verificadas.
 if(v===null||v===undefined||String(v).trim()==='')throw Error('Ingresá los minutos de vuelo declarados.');
 const n=Number(v);
 if(!Number.isInteger(n)||n<0||n>max)throw Error('El tiempo declarado debe expresarse en minutos enteros y válidos.');
 return n;
};
const optional=(v,max)=>v===null||v===undefined||String(v).trim()===''?0:whole(v,max);
const str=(v,max)=>String(v??'').trim().slice(0,max);
const total=obj=>Object.values(obj).reduce((sum,n)=>sum+n,0);
export function makeLogbookDetail(draft,booking,flight,person,fleet=[]){
 if(!flight||!booking||flight.reservationId!==booking.id)throw Error('El detalle debe vincularse al vuelo cerrado.');
 if(!draft||typeof draft!=='object')throw Error('Falta el detalle del libro de vuelo.');
 const purpose=str(draft.purpose,80);
 if(!Object.hasOwn(LOGBOOK_PURPOSES,purpose))throw Error('Seleccioná la finalidad del vuelo.');
 const duration=Number.isInteger(flight.blockMinutes)?flight.blockMinutes:Math.round(Number(flight.blockHours||0)*60);
 const credited=whole(draft.recordedFlightMinutes);
 if(credited<1||credited>duration)throw Error('Los minutos declarados deben ser positivos y no superar el bloque del vuelo registrado.');
 const categoryMinutes={};
 for(const key of Object.keys(LOGBOOK_TIME_COLUMNS))
  categoryMinutes[key]=optional(draft.categoryMinutes?.[key],duration);
 if(total(categoryMinutes)!==credited)
  throw Error('Los ocho casilleros de día/noche, piloto/copiloto y aeródromo/travesía deben sumar el tiempo declarado.');
 const specialMinutes={};
 for(const key of Object.keys(LOGBOOK_SPECIAL_COLUMNS)){
  const value=optional(draft.specialMinutes?.[key],duration);
  if(value>credited)throw Error('Una categoría adicional no puede superar el tiempo declarado de vuelo.');
  specialMinutes[key]=value;
 }
 if(specialMinutes.instrumentRealPilot+specialMinutes.instrumentRealCopilot>credited)
  throw Error('La suma de instrumentos reales piloto y copiloto no puede superar el tiempo declarado.');
 if(person?.id&&person.id!==flight.pilot)throw Error('El detalle debe pertenecer al titular del vuelo.');
 const plane=fleet.find(a=>a.id===flight.aircraft);
 const make=str(draft.aircraftMake,90),model=str(draft.aircraftModel||plane?.model,90),
  license=str(draft.license,80),className=str(draft.aircraftClass,50),power=str(draft.powerHp,30),
  legajoNumber=str(draft.legajoNumber,40),pageNumber=str(draft.pageNumber,12);
 const record={
  date:flight.date,departureUtc:flight.start,arrivalUtc:flight.end,
  from:flight.from,to:flight.to,purpose,
  aircraftMake:make,aircraftModel:model,registration:flight.aircraft,
  powerHp:power,aircraftClass:className,license,legajoNumber,pageNumber,
  recordedFlightMinutes:credited,
  categoryMinutes,specialMinutes,
  dayMinutes:categoryMinutes.airportDayPilot+categoryMinutes.airportDayCopilot+
   categoryMinutes.crosscountryDayPilot+categoryMinutes.crosscountryDayCopilot,
  nightMinutes:categoryMinutes.airportNightPilot+categoryMinutes.airportNightCopilot+
   categoryMinutes.crosscountryNightPilot+categoryMinutes.crosscountryNightCopilot,
  pilotId:flight.pilot,instructorId:flight.instructor||'',sourceFlightId:flight.id,
  certificationNote:str(draft.certificationNote,300),
  status:'borrador_no_certificado',
  incomplete:![make,model,license,className,power].every(Boolean),
  updatedAt:new Date().toISOString()
 };
 return record;
}
export function logbookRows(personId,flights){
 return flights.filter(f=>f.pilot===personId&&f.logbook)
  .map(f=>({flightId:f.id,operationType:f.operationType,...f.logbook}))
  .sort((a,b)=>a.date.localeCompare(b.date)||a.departureUtc.localeCompare(b.departureUtc));
}
export function logbookSummary(personId,flights,activities=[]){
 const rows=logbookRows(personId,flights);
 const categories=Object.fromEntries(Object.keys(LOGBOOK_TIME_COLUMNS).map(key=>[key,0]));
 const special=Object.fromEntries(Object.keys(LOGBOOK_SPECIAL_COLUMNS).map(key=>[key,0]));
 for(const r of rows){
  for(const key of Object.keys(categories))categories[key]+=r.categoryMinutes?.[key]||0;
  for(const key of Object.keys(special))special[key]+=r.specialMinutes?.[key]||0;
 }
 const simulator={simulatorInstructor:0,simulatorTrainee:0};
 // Solo sesiones efectivamente realizadas. No sumar a las horas de aeronave.
 const seen=new Set();
 for(const activity of activities){
  if(activity.pilot!==personId&&activity.instructor!==personId)continue;
  if(activity.type!=='simulator'||activity.status!=='realizada_demo'||seen.has(activity.id))continue;
  seen.add(activity.id);
  if(activity.pilot===personId)simulator.simulatorTrainee+=Number(activity.minutes)||0;
  if(activity.instructor===personId)simulator.simulatorInstructor+=Number(activity.minutes)||0;
 }
 return {
  flights:rows.length,minutes:rows.reduce((n,r)=>n+(r.recordedFlightMinutes||0),0),
  categories,special,simulator,
  pendingCertification:rows.length,
  // No fabricar el saldo de la página anterior ni certificar el total de la siguiente.
  previousBalanceMinutes:null
 };
}
