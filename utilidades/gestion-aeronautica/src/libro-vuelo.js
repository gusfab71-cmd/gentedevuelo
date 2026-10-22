// Registro auxiliar de libro de vuelo, DEMO. No es libro oficial ni RAV ANAC.
// Se evita inferir una función aeronáutica certificada a partir de una reserva.
export const LOGBOOK_AREAS=Object.freeze({aerodromo:'Sobre aeródromo',travesia:'Travesía'});
export const LOGBOOK_PURPOSES=Object.freeze({
 instruccion:'Instrucción',particular:'Vuelo particular',entrenamiento:'Entrenamiento',
 adaptacion:'Adaptación',travesia:'Travesía',otro:'Otra actividad'
});
export const LOGBOOK_DUTIES=Object.freeze({alumno:'Alumno en instrucción',piloto:'Piloto',copiloto:'Copiloto'});
const whole=(v,max=1440)=>{
 const n=Number(v);if(!Number.isInteger(n)||n<0||n>max)throw Error('El tiempo declarado debe expresarse en minutos enteros y válidos.');
 return n;
};
const str=(v,max)=>String(v??'').trim().slice(0,max);
export function makeLogbookDetail(draft,booking,flight,person,fleet=[]){
 if(!flight||!booking||flight.reservationId!==booking.id)throw Error('El registro debe vincularse al vuelo cerrado.');
 if(!draft||typeof draft!=='object')throw Error('Falta el detalle del libro de vuelo.');
 const purpose=str(draft.purpose,80),area=draft.area,duty=draft.duty;
 if(!Object.hasOwn(LOGBOOK_PURPOSES,purpose))throw Error('Seleccioná la finalidad del vuelo.');
 if(!Object.hasOwn(LOGBOOK_AREAS,area))throw Error('Seleccioná si fue sobre aeródromo o travesía.');
 if(!Object.hasOwn(LOGBOOK_DUTIES,duty))throw Error('Seleccioná la función declarada del titular.');
 if(person?.kind==='alumno'&&duty!=='alumno')throw Error('Las horas del alumno no deben declararse automáticamente como piloto o copiloto.');
 if(person?.kind==='piloto'&&duty==='alumno')throw Error('El titular piloto debe indicar su función correctamente.');
 const mins=Number.isInteger(flight.blockMinutes)?flight.blockMinutes:Math.round(flight.blockHours*60);
 const day=whole(draft.dayMinutes),night=whole(draft.nightMinutes);
 if(day+night!==mins)throw Error('Los minutos de día y noche deben sumar exactamente el tiempo de bloque.');
 const plane=fleet.find(a=>a.id===flight.aircraft);
 const aircraftModel=str(draft.aircraftModel||plane?.model,90);
 const aircraftMake=str(draft.aircraftMake,90);
 const className=str(draft.aircraftClass,50);
 const powerHp=str(draft.powerHp,30);
 const license=str(draft.license,80);
 return {
  date:flight.date,departureUtc:flight.start,arrivalUtc:flight.end,
  from:flight.from,to:flight.to,purpose,area,duty,
  aircraftMake,aircraftModel,registration:flight.aircraft,powerHp,aircraftClass:className,
  license,dayMinutes:day,nightMinutes:night,totalMinutes:mins,
  pilotId:flight.pilot,instructorId:flight.instructor||'',
  sourceFlightId:flight.id,
  // El sistema no puede certificar un libro ni atribuir por sí solo derechos aeronáuticos.
  status:'borrador_no_certificado',
  incomplete:![aircraftMake,aircraftModel,license,className,powerHp].every(Boolean)
 };
}
export function logbookRows(personId,flights){
 return flights.filter(f=>f.pilot===personId&&f.logbook)
  .map(f=>({flightId:f.id,operationType:f.operationType, ...f.logbook}))
  .sort((a,b)=>a.date.localeCompare(b.date)||a.departureUtc.localeCompare(b.departureUtc));
}
export function logbookSummary(personId,flights){
 const rows=logbookRows(personId,flights);
 const ledger={aerodromo:{dia:0,noche:0},travesia:{dia:0,noche:0}};
 for(const r of rows){
  ledger[r.area].dia+=r.dayMinutes;ledger[r.area].noche+=r.nightMinutes;
 }
 return {
  flights:rows.length,minutes:rows.reduce((n,r)=>n+r.totalMinutes,0),
  byArea:ledger,
  pendingCertification:rows.length, // Todos son borradores; no se emite certificación
  // El saldo anterior en papel NO es 0: es desconocido hasta que se importe con respaldo.
  previousBalanceMinutes:null
 };
}
