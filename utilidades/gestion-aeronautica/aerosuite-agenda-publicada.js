"use strict";
window.AeroSuiteAgenda={
 init(c){
  const $=id=>document.getElementById(id),names={flight:"Vuelo práctico",simulator:"Vuelo virtual",theory:"Teoría grupal"};
  let slots=[],bookings=[];
  const root=document.createElement("section");root.className="panel agenda-panel";
  root.innerHTML=[
  '<span class="eyebrow">Disponibilidad administrada por la escuela</span><h3>Turnos publicados</h3>',
  '<p class="hint">Secretaría organiza aeronaves, simuladores y aulas. Solo los horarios publicados se pueden reservar. El Instructor y la aeronave definitivos los asigna la escuela.</p>',
  '<label>Actividad<select id="agendaFilter"><option value="flight">Vuelo práctico</option><option value="simulator">Vuelo virtual</option><option value="theory">Teoría</option></select></label>',
  '<p class="hint" role="status" id="agendaStatus"></p><div class="agenda-cards" id="agendaStudentCards"></div>',
  '<section id="agendaManager" hidden><h3>Preparar horarios semanales</h3>',
  '<p class="hint">Los horarios nuevos quedan en preparación, ocultos para los alumnos hasta publicarlos.</p>',
  '<form id="agendaCreate"><div class="formgrid">',
  '<label>Actividad<select id="agendaType"><option value="flight">Vuelo práctico</option><option value="simulator">Vuelo virtual</option><option value="theory">Teoría grupal</option></select></label>',
  '<label>Día<input id="agendaDay" type="date" required></label>',
  '<label>Hora<select id="agendaHour"><option>08:00</option><option>09:30</option><option>11:00</option><option>12:30</option><option>14:00</option><option>15:30</option><option>17:00</option><option>18:30</option></select></label>',
  '<label>Recurso / aeronave / aula<input id="agendaResource" list="agendaResourceList" maxlength="90" required placeholder="LV-ABC, Simulador 1 o Aula 1"><datalist id="agendaResourceList"></datalist></label>',
  '<label id="agendaCapacityLabel">Cupos<input id="agendaCapacity" type="number" min="1" max="50" value="1" required></label>',
  '</div><button class="primary" type="submit">Agregar horario en preparación</button></form>',
  '<div class="actions"><button type="button" id="agendaPublish" class="primary">Publicar turnos de esta semana</button><button type="button" id="agendaWhatsApp">Copiar aviso para WhatsApp</button></div>',
  '<h3>Organización de recursos y reservas</h3><div class="agenda-cards" id="agendaStaffCards"></div></section>'
  ].join("");
  const legend=document.querySelector("#turnera .booking-legend"),table=$("weekHead").closest(".table-scroll");
  legend.parentNode.insertBefore(root,legend);
  const legacy=document.createElement("details");legacy.className="agenda-legacy";
  legacy.innerHTML="<summary>Ver turnera clásica y reprogramaciones</summary>";
  legend.parentNode.insertBefore(legacy,legend);legacy.append(legend,table);
  legacy.hidden=c.role==="alumno";$("agendaManager").hidden=!c.manager;
  const style=document.createElement("style");
  style.textContent=[
   ".agenda-panel{border-color:#52798f;background:#17354a;margin:15px 0}.agenda-panel [hidden]{display:none!important}",
   ".agenda-panel>label{max-width:330px;display:block;margin:13px 0}.agenda-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin:12px 0}",
   ".agenda-card{padding:13px;background:#214154;border:1px solid #607f90;border-radius:10px;min-width:0}",
   ".agenda-card p{margin:7px 0;font-size:12px;line-height:1.5}",
   ".agenda-card .top{display:flex;justify-content:space-between;align-items:center;gap:9px;flex-wrap:wrap}",
   "#agendaManager{border-top:1px solid #52798f;margin-top:18px;padding-top:15px}",
   "#agendaManager .agenda-cards{grid-template-columns:repeat(2,minmax(0,1fr))}",
   "#agendaManager .formgrid{grid-template-columns:repeat(2,minmax(0,1fr))}",
   ".agenda-booked{border-top:1px solid #607f90;padding:9px 0;display:flex;gap:7px;align-items:center;flex-wrap:wrap;font-size:12px}",
   ".agenda-booked button{font-size:11px;padding:6px 9px}",
   ".agenda-legacy{border:1px solid #456b80;padding:12px;border-radius:10px;margin:12px 0}",
   ".agenda-legacy summary{cursor:pointer;font-weight:750;color:#dceefa}",
   "@media(max-width:650px){#agendaManager .agenda-cards,#agendaManager .formgrid{grid-template-columns:1fr}}"
  ].join("");
  document.head.append(style);
  const msg=value=>$("agendaStatus").textContent=value;
  function addButton(label,fn,kind){
   const b=document.createElement("button");b.type="button";b.textContent=label;
   if(kind)b.className=kind;b.onclick=fn;return b;
  }
  function htmlText(label,tag="p"){
   const el=document.createElement(tag);el.textContent=label;return el;
  }
  function reloadAfter(message){msg(message);return c.reload();}
  async function manage(action,id,week){
   try{
    const result=await c.rpc("aerosuite_availability_manage",{
     p_institution_id:c.inst,p_action:action,p_slot_id:id||null,
     p_activity:null,p_starts_at:null,p_resource:null,p_capacity:1,p_duration_minutes:90,p_week_start:week||null
    });
    await reloadAfter(action==="publish_week"?"Publicados: "+result.published+" horarios.":"Disponibilidad actualizada.");
   }catch(e){msg("No se pudo actualizar: "+e.message);}
  }
  function render(){
   const selected=$("agendaFilter").value,list=$("agendaStudentCards");list.replaceChildren();
   const grouped=new Map();
   for(const s of slots){
    if(!s.published||s.activity!==selected)continue;
    const key=s.activity+"|"+s.starts_at;
    if(!grouped.has(key))grouped.set(key,{starts_at:s.starts_at,slots:[],capacity:0,used:0});
    const g=grouped.get(key);g.slots.push(s);g.capacity+=Number(s.capacity);g.used+=Number(s.reserved);
   }
   if(!grouped.size)list.textContent="Todavía no hay horarios publicados para esta actividad y semana.";
   for(const g of grouped.values()){
    const own=bookings.filter(r=>r.my_booking&&g.slots.some(s=>s.id===r.slot_id));
    const free=g.slots.reduce((sum,x)=>sum+(x.bookable===false?0:Math.max(0,Number(x.capacity)-Number(x.reserved))),0),
     blocked=g.slots.every(x=>x.bookable===false),
     future=new Date(g.starts_at).getTime()>Date.now();
    const card=document.createElement("div");card.className="agenda-card";
    const top=document.createElement("div");top.className="top";
    const label=htmlText(c.formatDate(g.starts_at),"strong");
    const status=htmlText(own.length?(own.some(x=>x.status==="confirmed")?"Confirmado":"Pendiente"):
     !future?"Finalizado":blocked?"No disponible":free>0?"Disponible":"Sin cupos","span");
    status.className="chip "+(own.length?"confirmed":free>0?"completed":"");
    top.append(label,status);card.append(top);
    card.append(htmlText("Ocupados "+g.used+" de "+g.capacity+" cupos"+(selected==="flight"?" · Secretaría asigna avión e instructor":"")));
    if(c.role==="alumno"&&!own.length&&future&&free>0&&c.school.can_write){
     const item=g.slots.find(x=>x.bookable!==false&&Number(x.reserved)<Number(x.capacity));
     const b=addButton("Reservar",async()=>{
      if(!confirm("¿Solicitar "+names[selected]+" el "+c.formatDate(g.starts_at)+"? Quedará pendiente de confirmación."))return;
      b.disabled=true;
      try{
       await c.rpc("aerosuite_availability_reserve",{p_institution_id:c.inst,p_slot_id:item.id,p_student_id:null});
       await reloadAfter("Solicitud registrada. Secretaría confirmará el turno.");
      }catch(e){msg("No se pudo reservar: "+e.message);b.disabled=false;}
     },"primary");card.append(b);
    }else if(c.role==="alumno"&&own.length){
     card.append(htmlText("Para modificar o cancelar, comunicate con Secretaría."));
    }
    list.append(card);
   }
   if(!c.manager)return;
   const manager=$("agendaStaffCards");manager.replaceChildren();
   if(!slots.length)manager.textContent="Aún no hay horarios preparados en esta semana.";
   for(const s of slots){
    const card=document.createElement("div");card.className="agenda-card";
    const top=document.createElement("div");top.className="top";
    top.append(htmlText(names[s.activity]+" · "+c.formatDate(s.starts_at),"strong"),
     htmlText(s.published?"Publicado":"En preparación","span"));
    card.append(top);
    card.append(htmlText("Recurso: "+s.resource+" · Cupos "+s.reserved+"/"+s.capacity+(s.bookable===false?" · Aeronave fuera de servicio":"")));
    if(c.school.can_write&&new Date(s.starts_at).getTime()>Date.now()){
     const bar=document.createElement("div");bar.className="actions";
     if(!s.published&&s.bookable!==false)bar.append(addButton("Publicar",()=>manage("publish",s.id),"primary"));
     if(s.published)bar.append(addButton("Retirar",()=>{
      if(confirm("¿Retirar este horario? Debe estar libre de reservas."))manage("hide",s.id);
     }));
     else bar.append(addButton("Descartar",()=>{
      if(confirm("¿Descartar este horario preparado?"))manage("discard",s.id);
     },"danger"));
     card.append(bar);
    }
    for(const r of bookings.filter(x=>x.slot_id===s.id&&x.status!=="cancelled")){
     const row=document.createElement("div");row.className="agenda-booked";
     row.append(htmlText((r.student_email||"Alumno")+" · "+(r.status==="confirmed"?"Confirmado":"Pendiente"),"span"));
     if(c.school.can_write&&new Date(s.starts_at).getTime()>Date.now()){
      if(!r.booking_id&&r.status==="pending")
       row.append(addButton("Confirmar",()=>actReservation("confirm",r)));
      row.append(addButton("Reprogramar",()=>reprogramReservation(r,s)));
      row.append(addButton("Cancelar",()=>actReservation("cancel",r),"danger"));
     }
     if(r.booking_id)row.append(htmlText("Asignar Instructor desde el detalle de reservas.","small"));
     card.append(row);
    }
    manager.append(card);
   }
  }
  async function reprogramReservation(reservation,currentSlot){
   if(!c.manager||!c.school.can_write)return;
   const date=prompt("¿Para qué fecha querés reprogramar? Ingresá AAAA-MM-DD:",c.today());
   if(!date)return;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+"T12:00:00Z"))){
    msg("Ingresá una fecha válida con formato AAAA-MM-DD.");return;
   }
   const d=new Date(date+"T12:00:00Z");
   const until=new Date(d.getTime()+7*86400000).toISOString().slice(0,10);
   const channel=prompt("¿Cómo autorizó el alumno? presencial / telefono / whatsapp / correo / otro","whatsapp");
   if(!channel)return;
   const validChannel=channel.trim().toLowerCase();
   if(!["presencial","telefono","whatsapp","correo","otro"].includes(validChannel)){
    msg("Indicá un canal de autorización válido.");return;
   }
   const reason=prompt("Motivo del cambio (5 caracteres como mínimo):");
   if(!reason||reason.trim().length<5)return;
   try{
    const data=await c.rpc("aerosuite_availability_week",{
     p_institution_id:c.inst,p_from:date,p_to:until
    });
    const available=(data?.slots||[]).filter(s=>s.id!==currentSlot.id&&s.bookable!==false&&s.activity===currentSlot.activity&&
     s.published&&Number(s.reserved)<Number(s.capacity)&&new Date(s.starts_at).getTime()>Date.now());
    if(!available.length){msg("No hay cupos publicados para esa actividad en los siguientes 8 días. Secretaría puede preparar y publicar más turnos.");return;}
    const choices=available.slice(0,25);
    const selection=prompt("Elegí el número de un nuevo turno publicado:\n"+
     choices.map((s,i)=>(i+1)+". "+c.formatDate(s.starts_at)+" · "+s.resource+" ("+(s.capacity-s.reserved)+" cupos)").join("\n"));
    if(!selection)return;
    const index=Number(selection)-1;
    if(!Number.isInteger(index)||index<0||index>=choices.length){msg("El número seleccionado no es válido.");return;}
    if(!confirm("¿Confirmás que el alumno autorizó reprogramar a "+c.formatDate(choices[index].starts_at)+"? Se conservará su reserva y pasará a pendiente."))return;
    await c.rpc("aerosuite_availability_reprogram",{
     p_institution_id:c.inst,p_reservation_id:reservation.id,p_target_slot_id:choices[index].id,
     p_student_authorized:true,p_channel:validChannel,p_reason:reason.trim()
    });
    await reloadAfter("Turno reprogramado. Se conservó el historial; falta la confirmación de Secretaría o Instructor.");
   }catch(e){msg("No se pudo reprogramar: "+e.message);}
  }
  async function actReservation(action,r){
   if(!c.manager||!c.school.can_write)return;
   const reason=action==="cancel"?prompt("Motivo obligatorio de cancelación:"):null;
   if(action==="cancel"&&(!reason||reason.trim().length<3))return;
   if(!confirm(action==="cancel"?"¿Cancelar y liberar el cupo?":"¿Confirmar esta actividad?"))return;
   try{
    await c.rpc(action==="cancel"?"aerosuite_availability_cancel":"aerosuite_availability_confirm",{
     p_institution_id:c.inst,p_reservation_id:r.id,...(action==="cancel"?{p_reason:reason.trim()}:{})
    });await reloadAfter("Reserva actualizada.");
   }catch(e){msg("No se pudo modificar: "+e.message);}
  }
  function syncResource(){
   const kind=$("agendaType").value;
   $("agendaCapacityLabel").hidden=kind==="flight";
   $("agendaCapacity").value=kind==="flight"?"1":kind==="theory"?"12":"1";
   $("agendaResource").value="";
   $("agendaResource").placeholder=kind==="flight"?"LV-ABC o Cupo vuelo 1":kind==="theory"?"Aula 1":"Simulador 1";
   const list=$("agendaResourceList");list.replaceChildren();
   if(kind==="flight")for(const a of c.aircraft().filter(a=>a.availability==="available"&&!a.archived_at)){
    const opt=document.createElement("option");opt.value=a.registration;list.append(opt);
   }
  }
  $("agendaFilter").onchange=render;
  if(c.manager){
   $("agendaType").onchange=syncResource;
   $("agendaDay").value=c.today();$("agendaDay").min=c.today();
   $("agendaCreate").onsubmit=async e=>{
    e.preventDefault();if(!c.school.can_write)return;
    const date=$("agendaDay").value,hour=$("agendaHour").value;
    const resource=$("agendaResource").value.trim(),kind=$("agendaType").value;
    const capacity=kind==="flight"?1:Number($("agendaCapacity").value);
    const starts=new Date(date+"T"+hour+":00-03:00");
    if(!resource||!Number.isFinite(starts.getTime())||!Number.isInteger(capacity)||capacity<1||capacity>50){
     msg("Completá fecha, recurso y cupos válidos.");return;
    }
    try{
     await c.rpc("aerosuite_availability_manage",{
      p_institution_id:c.inst,p_action:"create",p_slot_id:null,p_activity:kind,
      p_starts_at:starts.toISOString(),p_resource:resource,p_capacity:capacity,p_duration_minutes:90,p_week_start:null
     });await reloadAfter("Turno preparado. Falta publicar para habilitar reservas.");
    }catch(e){msg("No se pudo preparar: "+e.message);}
   };
   $("agendaPublish").onclick=()=>{
    const drafts=slots.filter(s=>!s.published);
    if(!drafts.length){msg("No hay horarios en preparación esta semana.");return;}
    if(confirm("¿Publicar "+drafts.length+" horarios para la semana del "+c.weekDates()[0]+"?"))
     manage("publish_week",null,c.weekDates()[0]);
   };
   $("agendaWhatsApp").onclick=async()=>{
    if(!slots.some(s=>s.published)){msg("Primero publicá horarios.");return;}
    const text="Turnos disponibles en AeroSuite para la semana del "+c.weekDates()[0]+
     ". Ingresá a tu portal para reservar vuelo, simulador o teoría: https://gentedevuelo.com/utilidades/gestion-aeronautica/portal-escuela.html";
    try{await navigator.clipboard.writeText(text);msg("Aviso copiado para compartir en WhatsApp.");}
    catch(e){prompt("Copiá el aviso:",text);}
   };
   syncResource();
  }
  return {
   async load(){
    try{
     const days=c.weekDates(),x=await c.rpc("aerosuite_availability_week",{p_institution_id:c.inst,p_from:days[0],p_to:days[6]});
     slots=Array.isArray(x?.slots)?x.slots:[];bookings=Array.isArray(x?.reservations)?x.reservations:[];
     msg(slots.filter(s=>s.published).length+" horarios publicados en la semana.");render();
    }catch(e){slots=[];bookings=[];msg("Error al consultar turnos: "+e.message);render();}
   },
   isPublishedBooking(id){return bookings.some(r=>r.booking_id===id);},
   showReschedule(){if(!legacy.hidden)legacy.open=true;},
   hideReschedule(){legacy.open=false;}
  };
 }
};