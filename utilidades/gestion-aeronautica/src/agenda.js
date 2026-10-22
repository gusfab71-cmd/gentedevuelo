// Calendario para demostración privada. No sustituye el control concurrente en servidor.
const dateOnly = iso => {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))throw Error('Fecha inválida.');
 const d=new Date(iso+'T12:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso)throw Error('Fecha inválida.');
 return d;
};
export const shiftDate=(iso,delta)=>{
 const d=dateOnly(iso);
 if(!Number.isInteger(delta)||Math.abs(delta)>400)throw Error('Desplazamiento inválido.');
 d.setUTCDate(d.getUTCDate()+delta);
 return d.toISOString().slice(0,10);
};
export const mondayOf=iso=>{
 const d=dateOnly(iso);
 return shiftDate(iso,-((d.getUTCDay()+6)%7));
};
export const listWeek=iso=>Array.from({length:7},(_,i)=>shiftDate(mondayOf(iso),i));
export function visibleBookings(bookings,dates,aircraft='all',instructor='all'){
 const days=new Set(dates);
 return bookings.filter(b=>b.status==='confirmada'&&days.has(b.date)&&
  (aircraft==='all'||b.aircraft===aircraft)&&
  (instructor==='all'||b.instructor===instructor))
  .slice().sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.aircraft.localeCompare(b.aircraft));
}
const asMinutes=s=>{
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('Hora inválida.');
 const [h,m]=s.split(':').map(Number);return h*60+m;
};
// La escala cubre todos los turnos existentes; no ocultar turnos fuera de las horas normales.
export function timeWindow(bookings){
 let min=8*60,max=20*60;
 for(const r of bookings){
  min=Math.min(min,Math.floor(asMinutes(r.start)/60)*60);
  max=Math.max(max,Math.ceil(asMinutes(r.end)/60)*60);
 }
 return {start:Math.max(0,min),end:Math.min(24*60,max)};
}
export const hhmm=minutes=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
export function layoutDay(bookings,date,windowStart,pxPerHour=52){
 const matching=bookings.filter(b=>b.date===date&&b.status==='confirmada')
  .slice().sort((a,b)=>asMinutes(a.start)-asMinutes(b.start)||asMinutes(a.end)-asMinutes(b.end));
 const groups=[];
 let group=[],groupEnd=-1;
 for(const b of matching){
  const from=asMinutes(b.start),end=asMinutes(b.end);
  if(from>=groupEnd&&group.length){groups.push(group);group=[];groupEnd=-1;}
  group.push({...b,_from:from,_end:end});groupEnd=Math.max(groupEnd,end);
 }
 if(group.length)groups.push(group);
 return groups.flatMap(items=>{
  const laneEnds=[],allocated=[];
  for(const item of items){
   let lane=laneEnds.findIndex(last=>last<=item._from);
   if(lane<0){lane=laneEnds.length;laneEnds.push(item._end);}
   else laneEnds[lane]=item._end;
   allocated.push({item,lane});
  }
  const lanes=laneEnds.length;
  return allocated.map(({item,lane})=>({
   ...item,top:(item._from-windowStart)/60*pxPerHour,
   height:Math.max(24,(item._end-item._from)/60*pxPerHour),
   lane,lanes
  }));
 });
}
