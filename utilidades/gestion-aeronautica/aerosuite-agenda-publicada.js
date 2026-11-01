"use strict";
window.AeroSuiteAgenda={
 init(c){
  const $=id=>document.getElementById(id),names={flight:"Vuelo práctico",simulator:"Vuelo virtual",theory:"Teoría grupal"};
  let slots=[],bookings=[];
  const root=document.createElement("div");root.className="agenda-panel agenda-integrated";
  root.innerHTML=[
  '<span class="eyebrow">Disponibilidad de la escuela · Publicación y reservas</span>',
  '<section id="agendaManager" hidden>',
  '<h3>Publicar turnos para toda la semana</h3>',
  '<p class="hint">Seleccioná los recursos disponibles. AeroSuite publicará automáticamente los horarios de 08:00 a 20:00, de lunes a domingo, en turnos de 90 minutos. Podrás suspender o agregar horarios durante la semana.</p>',
  '<p id="agendaWeekLabel" class="hint"></p>',
  '<form id="agendaBulkForm"><div class="formgrid">',
  '<label>Actividad<select id="agendaBulkType"><option value="flight">Vuelo de instrucción</option><option value="simulator">Vuelo virtual / simulador</option><option value="theory">Teoría</option></select></label>',
  '<div class="agenda-resource-pick" id="agendaBulkFlight"><strong>Aeronaves disponibles</strong><div id="agendaBulkAircraft"></div><p class="hint">Se toman de Flota. Las que están fuera de servicio no pueden publicarse. Antes de publicar se muestran los avisos de Mantenimiento.</p></div>',
  '<div class="agenda-resource-pick" id="agendaBulkSim" hidden><strong>Simuladores disponibles</strong><div id="agendaBulkSimulators"></div><p class="hint">Se toman de Disponibilidad de flotas y mantenimiento. Los que están fuera de servicio no pueden publicarse.</p></div>',
  '<label id="agendaBulkNamesLabel" hidden>Clase o materia<input id="agendaBulkNames" maxlength="600" placeholder="Ej.: Teoría"></label>',
  '<label id="agendaBulkCapacityLabel" hidden>Cupos por turno<input id="agendaBulkCapacity" type="number" min="1" max="50" value="12"></label>',
  '</div><button class="primary" type="submit" id="agendaBulkSubmit">Publicar toda la semana</button></form>',
  '<details class="agenda-daily"><summary>Agregar o modificar horarios puntuales</summary>',
  '<p class="hint">Para imprevistos podés agregar un horario individual; para suspender, seleccioná la casilla en la grilla.</p>',
  '<form id="agendaCreate"><div class="formgrid">',
  '<label>Actividad<select id="agendaType"><option value="flight">Vuelo de instrucción</option><option value="simulator">Vuelo virtual</option><option value="theory">Teoría grupal</option></select></label>',
  '<label>Día<input id="agendaDay" type="date" required></label>',
  '<label>Hora<select id="agendaHour"><option>08:00</option><option>09:30</option><option>11:00</option><option>12:30</option><option>14:00</option><option>15:30</option><option>17:00</option><option>18:30</option></select></label>',
  '<label>Recurso / aeronave / aula<input id="agendaResource" list="agendaResourceList" maxlength="90" required placeholder="LV-ABC, Simulador 1 o Aula 1"><datalist id="agendaResourceList"></datalist></label>',
  '<label id="agendaCapacityLabel">Cupos<input id="agendaCapacity" type="number" min="1" max="50" value="1" required></label>',
  '</div><button class="primary" type="submit">Agregar horario en preparación</button></form>',
  '<div class="actions"><button type="button" id="agendaPublish" class="primary">Publicar los horarios preparados</button></div>',
  '</details>',
  '<div class="actions"><button type="button" id="agendaWhatsApp">Copiar aviso de turnos para WhatsApp</button></div>',
  '</section>',
  '<div class="agenda-filters"><label>Actividad<select id="agendaFilter"><option value="flight">Vuelo de instrucción</option><option value="simulator">Vuelo virtual / simulador</option><option value="theory">Teoría</option></select></label>',
  '<label>Elegir aeronave, simulador o clase<select id="agendaResourceFilter"><option value="all">Todos los recursos</option></select></label></div>',
  '<p class="hint" role="status" aria-live="polite" id="agendaStatus"></p>',
  '<div id="agendaGridHost" class="agenda-grid-host"></div>',
  '<p class="hint" id="agendaGridHelp">Verde: libre · Marfil: pendiente · Azul: confirmado · Gris: ocupado o no disponible. Elegí una casilla para reservar.</p>',
  '<section id="agendaStaffDetails" hidden><h3>Gestión del turno seleccionado</h3><div id="agendaStaffCards" class="agenda-cards"></div></section>'
  ].join("");
  const legend=document.querySelector("#turnera .booking-legend"),table=$("weekHead").closest(".table-scroll");
  if(!legend||!table)throw Error("No se encontró la grilla institucional.");
  legend.parentNode.insertBefore(root,legend);
  const gridHost=$("agendaGridHost");gridHost.append(legend,table);
  table.classList.add("agenda-grid-scroll");
  $("weekHead").closest("table").classList.add("agenda-week-grid");
  $("agendaManager").hidden=!c.manager;
  const style=document.createElement("style");
  style.textContent=[
   ".agenda-panel{margin:13px 0 16px}.agenda-panel [hidden]{display:none!important}",
   ".agenda-panel h3{margin:10px 0}.agenda-panel .hint{line-height:1.55}",
   "#agendaManager{padding:15px;margin:14px 0 19px;border:1px solid #567a90;background:#203c51;border-radius:12px}",
   "#agendaManager .formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
   ".agenda-resource-pick{padding:10px;border:1px solid #5f7f92;border-radius:8px}",
   ".agenda-resource-options{max-height:145px;overflow:auto;margin-top:8px}",
   ".agenda-check{display:flex!important;gap:8px;align-items:center;padding:5px 0;font-size:13px}",
   ".agenda-check input{width:auto;min-width:auto;margin:0}",
   ".agenda-daily{margin:16px 0;padding:12px;border:1px solid #567a90;border-radius:9px}",
   ".agenda-daily summary,.agenda-legacy summary{cursor:pointer;font-weight:700;color:#DCECF4}",
   ".agenda-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}",
   ".agenda-filters label{display:block}.agenda-grid-scroll{overflow-x:auto;margin-top:12px}",
   ".agenda-week-grid{border-collapse:separate;border-spacing:3px;min-width:810px;width:100%;table-layout:fixed}",
   ".agenda-week-grid th{padding:8px 5px;text-align:center;background:#244358;color:#eaf0f4;font-size:12px}",
   ".agenda-week-grid th:first-child{width:95px;position:sticky;left:0;z-index:2}",
   ".agenda-week-grid td{padding:3px;vertical-align:top;min-width:90px;background:#1a3448;border:1px solid #3c6078;border-radius:7px}",
   ".agenda-week-grid .agenda-time{font-size:12px;text-align:center;font-weight:700;position:sticky;left:0;z-index:1;background:#244358;padding:12px 3px}",
   ".agenda-cell{min-height:48px;display:flex;flex-direction:column;gap:5px}",
   ".agenda-slot-btn{display:flex;flex-direction:column;gap:3px;width:100%;padding:8px 5px;border-radius:7px;border:1px solid #54826c;background:#234a3e;color:#f2f8f4;text-align:center;font-size:11px;line-height:1.25;white-space:normal;cursor:pointer}",
   ".agenda-slot-btn strong{display:block;font-size:11px;overflow-wrap:anywhere}",
   ".agenda-slot-btn small{font-size:10px;opacity:.9}",
   ".agenda-slot-btn.pending{background:linear-gradient(140deg,#FAF7F1,#EAE5DB);border-color:#F7F2E8;color:#263B49}",
   ".agenda-slot-btn.confirmed{background:linear-gradient(140deg,#BFD3DF,#91AABB);border-color:#C5D5DE;color:#193344}",
   ".agenda-slot-btn.settled{background:linear-gradient(140deg,#E1C994,#C9A66E);border-color:#E4CAA1;color:#293541}",
   ".agenda-slot-btn.occupied,.agenda-slot-btn.past,.agenda-slot-btn.unavailable{background:#3c4a55;border-color:#566977;color:#dce4eb}",
   ".agenda-slot-btn.draft{background:#594c38;border-color:#aa8951;color:#fff0d7}",
   ".agenda-slot-btn:disabled{cursor:default;opacity:.85}",
   ".agenda-slot-btn:focus-visible{outline:3px solid #ebca91;outline-offset:1px}",
   ".agenda-cell-empty{text-align:center;display:block;color:#9db1c3;padding:12px 2px;font-size:11px}",
   "#agendaStaffDetails{margin-top:16px;padding:13px;border:1px solid #567b91;border-radius:10px}",
   ".agenda-cards{display:grid;gap:10px}.agenda-card{padding:14px;background:#214154;border:1px solid #607f90;border-radius:10px}",
   ".agenda-card p{margin:7px 0;font-size:12px}",
   ".agenda-booked{border-top:1px solid #607f90;padding:9px 0;display:flex;gap:7px;align-items:center;flex-wrap:wrap;font-size:12px}",
   ".agenda-booked button{font-size:11px;padding:6px 9px}",
   ".agenda-grid-host .booking-legend{margin:12px 0}.agenda-grid-host .table-scroll{margin:0 0 9px}",
   "@media(max-width:650px){#agendaManager .formgrid,.agenda-filters{grid-template-columns:1fr}.agenda-week-grid{min-width:760px}}"
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
  async function getMaintenanceChecks(registrations){
   if(!c.manager||!registrations?.length)return [];
   const data=await c.rpc("aerosuite_maintenance_alerts",{p_institution_id:c.inst});
   maintenanceChecks=Array.isArray(data?.aircraft)?data.aircraft:[];
   return maintenanceChecks.filter(x=>registrations.some(reg=>String(reg).toUpperCase()===String(x.registration).toUpperCase()));
  }
  async function confirmMaintenanceWarnings(registrations){
   if(!registrations?.length)return true;
   let entries;
   try{entries=await getMaintenanceChecks(registrations)}
   catch(e){msg("No se pudieron consultar los avisos de Mantenimiento. Verificá la ficha antes de publicar: "+e.message);return false;}
   if(entries.length!==registrations.length){
    msg("Hay aeronaves sin seguimiento vinculado. Verificá Flota antes de publicar.");
    return false;
   }
   const warnings=entries.flatMap(a=>(a.alerts||[]).map(w=>({registration:a.registration,...w})));
   const lines=warnings.slice(0,12).map(w=>
    (w.level==="due"?"VENCIDO / REVISAR":w.level==="soon"?"PRÓXIMO":"DATOS PENDIENTES")+
    " · "+w.registration+": "+w.message);
   const intro=warnings.length?
    "AVISOS DE MANTENIMIENTO antes de publicar:\n\n"+lines.join("\n")+
    (warnings.length>12?"\n...otros avisos en Mantenimiento.\n":"")+"\n\n":
    "No se detectan alertas calculables con los controles registrados. Esto NO equivale a aptitud de vuelo.\n\n";
   return confirm(intro+
    "La escuela debe verificar constancias, horas reales, DA, vencimientos y estado de aeronavegabilidad.\n"+
    "¿Continuar con la publicación de horarios para estas aeronaves?");
  }
  async function manage(action,id,week){
   try{
    if(action==="publish"||action==="publish_week"){
     const affected=action==="publish"?
      slots.filter(s=>s.id===id&&s.activity==="flight").map(s=>s.resource):
      slots.filter(s=>!s.published&&s.activity==="flight").map(s=>s.resource);
     if(affected.length&&!await confirmMaintenanceWarnings([...new Set(affected)]))return;
    }
    const result=await c.rpc("aerosuite_availability_manage",{
     p_institution_id:c.inst,p_action:action,p_slot_id:id||null,
     p_activity:null,p_starts_at:null,p_resource:null,p_capacity:1,p_duration_minutes:90,p_week_start:week||null
    });
    await reloadAfter(action==="publish_week"?"Publicados: "+result.published+" horarios.":"Disponibilidad actualizada.");
   }catch(e){msg("No se pudo actualizar: "+e.message);}
  }
  let selectedSlotId=null,maintenanceChecks=[];
  const dayLabels=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const timeSlots=["08:00","09:30","11:00","12:30","14:00","15:30","17:00","18:30"];
  function refreshResources(){
   const current=$("agendaResourceFilter").value;
   const activity=$("agendaFilter").value,select=$("agendaResourceFilter");
   const available=[...new Set(slots.filter(s=>s.activity===activity&&(s.published||c.manager))
    .map(s=>s.resource).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
   select.replaceChildren();
   select.add(new Option(activity==="flight"?"Todas las aeronaves":activity==="simulator"?"Todos los simuladores":"Todas las clases","all"));
   for(const item of available)select.add(new Option(item,item));
   select.value=available.includes(current)?current:"all";
  }
  async function reserveSlot(slot,button){
   if(c.role!=="alumno"||!c.school.can_write)return;
   const label=names[slot.activity]+" · "+slot.resource+" · "+c.formatDate(slot.starts_at);
   if(!confirm("¿Reservar "+label+"? La solicitud quedará pendiente de confirmación de la escuela."))return;
   button.disabled=true;
   try{
    await c.rpc("aerosuite_availability_reserve",{p_institution_id:c.inst,p_slot_id:slot.id,p_student_id:null});
    await reloadAfter("Turno solicitado. Secretaría confirmará la reserva.");
   }catch(e){msg("No se pudo reservar: "+e.message);button.disabled=false;}
  }
  function renderStaffDetail(){
   const wrapper=$("agendaStaffDetails"),target=$("agendaStaffCards");
   target.replaceChildren();
   if(!c.manager){wrapper.hidden=true;return;}
   wrapper.hidden=false;
   const slot=slots.find(s=>s.id===selectedSlotId);
   if(!slot){target.textContent="Seleccioná un horario de la grilla para administrar sus recursos o reservas.";return;}
   const card=document.createElement("div");card.className="agenda-card";
   card.append(htmlText(names[slot.activity]+" · "+slot.resource+" · "+c.formatDate(slot.starts_at),"strong"));
   card.append(htmlText("Estado: "+(slot.published?"Publicado":"En preparación")+
    " · Cupos utilizados: "+slot.reserved+" de "+slot.capacity+
    (slot.bookable===false?" · Recurso fuera de servicio":"")));
   if(c.school.can_write&&slot.published&&slot.bookable!==false&&
     new Date(slot.starts_at).getTime()>Date.now()&&Number(slot.reserved)<Number(slot.capacity)){
    const reservationButton=addButton("Reservar este horario para un alumno",async()=>{
     const student=c.selectedStudent?.();
     if(!student){msg("Elegí primero un alumno en el selector superior para reservar en su nombre.");return;}
     if(!confirm("¿Reservar "+slot.resource+" el "+c.formatDate(slot.starts_at)+
       " para el alumno seleccionado? Quedará pendiente de confirmación."))return;
     reservationButton.disabled=true;
     try{
      await c.rpc("aerosuite_availability_reserve",{
       p_institution_id:c.inst,p_slot_id:slot.id,p_student_id:student
      });
      await reloadAfter("Reserva del alumno registrada; queda pendiente de confirmación.");
     }catch(e){msg("No se pudo reservar para ese alumno: "+e.message);reservationButton.disabled=false;}
    },"primary");
    card.append(reservationButton);
   }
   if(c.school.can_write&&new Date(slot.starts_at).getTime()>Date.now()){
    const bar=document.createElement("div");bar.className="actions";
    if(!slot.published&&slot.bookable!==false)bar.append(addButton("Publicar este turno",()=>manage("publish",slot.id),"primary"));
    if(slot.published)bar.append(addButton("Suspender este horario",()=>{
     if(confirm("Solo se puede suspender si no tiene reservas activas. ¿Continuar?"))manage("hide",slot.id);
    }));
    if(!slot.published)bar.append(addButton("Descartar borrador",()=>{
     if(confirm("¿Descartar este horario en preparación?"))manage("discard",slot.id);
    },"danger"));
    if(bar.childNodes.length)card.append(bar);
   }
   const related=bookings.filter(r=>r.slot_id===slot.id&&r.status!=="cancelled");
   if(!related.length)card.append(htmlText("No hay alumnos reservados para este horario."));
   for(const r of related){
    const row=document.createElement("div");row.className="agenda-booked";
    row.append(htmlText((r.student_email||"Alumno")+" · "+(r.status==="confirmed"?"Confirmado":r.status==="completed"?"Realizado":"Pendiente"),"span"));
    if(c.school.can_write&&new Date(slot.starts_at).getTime()>Date.now()&&["pending","confirmed"].includes(r.status)){
     if(!r.booking_id&&r.status==="pending")row.append(addButton("Confirmar",()=>actReservation("confirm",r)));
     row.append(addButton("Reprogramar",()=>reprogramReservation(r,slot)));
     row.append(addButton("Cancelar",()=>actReservation("cancel",r),"danger"));
    }
    if(r.booking_id)row.append(htmlText("Para asignar instructor y confirmar un vuelo, usá el detalle de reservas debajo de la turnera.","small"));
    card.append(row);
   }
   target.append(card);
  }
  function render(){
   refreshResources();
   const selected=$("agendaFilter").value,resource=$("agendaResourceFilter").value;
   const days=c.weekDates(),head=$("weekHead"),body=$("weekBody");
   head.replaceChildren();body.replaceChildren();
   const header=document.createElement("tr");
   header.append(htmlText("Horario","th"));
   for(let i=0;i<days.length;i++){
    const th=document.createElement("th");th.textContent=dayLabels[i]+" "+days[i].slice(8,10)+"/"+days[i].slice(5,7);
    header.append(th);
   }
   head.append(header);
   const visible=slots.filter(s=>s.activity===selected&&(s.published||c.manager)&&
    (resource==="all"||s.resource===resource));
   for(const time of timeSlots){
    const row=document.createElement("tr");
    const endMinutes=(Number(time.slice(0,2))*60+Number(time.slice(3))+90);
    const label=htmlText(time+"–"+String(Math.floor(endMinutes/60)).padStart(2,"0")+":"+
      String(endMinutes%60).padStart(2,"0"),"th");
    label.className="agenda-time";row.append(label);
    for(const date of days){
     const td=document.createElement("td"),wrap=document.createElement("div");wrap.className="agenda-cell";
     const when=new Date(date+"T"+time+":00-03:00").getTime();
     const candidates=visible.filter(s=>new Date(s.starts_at).getTime()===when)
      .sort((a,b)=>(a.resource||"").localeCompare(b.resource||"","es"));
     for(const slot of candidates){
      const own=bookings.filter(r=>r.slot_id===slot.id&&r.my_booking);
      const active=bookings.filter(r=>r.slot_id===slot.id&&r.status!=="cancelled");
      const future=when>Date.now(),remaining=Number(slot.capacity)-Number(slot.reserved);
      const canBook=slot.published&&slot.bookable!==false&&future&&remaining>0&&c.role==="alumno"&&
       !own.length&&c.school.can_write;
      let state=own.length?(own.some(r=>r.status==="confirmed")?"Confirmado":own.some(r=>r.status==="completed")?"Realizado":"Pendiente"):
       !slot.published?"Preparación":!future?"Pasado":slot.bookable===false?"Fuera de servicio":
       remaining<=0?(slot.activity==="theory"?"Sin cupos":"Ocupado"):"Libre";
      if(c.manager&&active.length){
       state=active.some(r=>r.status==="confirmed")?"Confirmado":active.some(r=>r.status==="pending")?"Pendiente":state;
      }
      const legacyMove=!!c.manager&&!!c.isLegacyRescheduling?.()&&
       slot.activity==="flight"&&slot.published&&slot.bookable!==false&&future&&remaining>0&&active.length===0;
      const b=document.createElement("button");b.type="button";b.className="slot agenda-slot-btn "+
       (state==="Pendiente"?"busy pending":state==="Confirmado"?"busy confirmed":
        state==="Realizado"?"settled":state==="Libre"?"available":
        state==="Preparación"?"draft":state==="Pasado"?"past":
        state==="Fuera de servicio"?"unavailable":
        ["Ocupado","Sin cupos"].includes(state)?"occupied":"");
      const resourceName=document.createElement("strong");resourceName.textContent=slot.resource||names[slot.activity];
      const line=htmlText((legacyMove?"Libre · Reprogramar aquí":state)+
       (slot.activity==="theory"?" · "+slot.reserved+"/"+slot.capacity:""),"small");
      b.append(resourceName,line);
      b.setAttribute("aria-label",slot.resource+" · "+state+" · "+date+" "+time);
      if(legacyMove)b.onclick=()=>c.onLegacyReschedule(slot,b);
      else if(canBook)b.onclick=()=>reserveSlot(slot,b);
      else if(c.manager){
       b.onclick=()=>{
        selectedSlotId=slot.id;renderStaffDetail();
        $("agendaStaffDetails").scrollIntoView({behavior:"smooth",block:"nearest"});
       };
      }else b.disabled=true;
      wrap.append(b);
     }
     // Las reservas históricas sin cupo publicado se muestran en la misma grilla,
     // sin duplicar las reservas nuevas que ya están vinculadas a una actividad.
     if(selected==="flight"){
      for(const old of (c.legacyBookings?.()||[]).filter(item=>
       item.status!=="cancelled"&&item.booking_id&&
       !bookings.some(r=>r.booking_id===item.booking_id)&&
       new Date(item.starts_at).getTime()===when&&
       (resource==="all"||String(item.aircraft||"").toUpperCase()===resource.toUpperCase()))){
       const oldButton=document.createElement("button");
       oldButton.type="button";
       oldButton.className="slot agenda-slot-btn "+
        (old.status==="pending"?"busy pending":old.status==="confirmed"?"busy confirmed":"settled");
       const title=htmlText(old.aircraft||"Vuelo anterior","strong");
       const description=htmlText((old.status==="pending"?"Pendiente":
        old.status==="confirmed"?"Confirmado":"Realizado")+
        (c.manager&&old.student_email?" · "+old.student_email:""),"small");
       oldButton.append(title,description);
       oldButton.onclick=()=>{
        const detail=document.getElementById("booking-"+old.booking_id);
        if(detail)detail.scrollIntoView({behavior:"smooth",block:"center"});
       };
       wrap.append(oldButton);
      }
     }
     if(!wrap.childElementCount){
      const empty=htmlText("—","span");empty.className="agenda-cell-empty";wrap.append(empty);
     }
     td.append(wrap);row.append(td);
    }
    body.append(row);
   }
   const published=slots.filter(s=>s.published).length;
   $("agendaGridHelp").textContent=(c.role==="alumno"?
    "Elegí una casilla «Libre» para reservar; si hay varias aeronaves en el mismo horario, aparecen juntas. ":
    "Seleccioná un horario de la grilla para gestionar disponibilidad y reservas. ")+
    "Turnos de 90 minutos. Horario de Argentina. "+published+" horarios publicados esta semana.";
   $("agendaWeekLabel").textContent="Semana del "+days[0].split("-").reverse().join("/")+
    " al "+days[6].split("-").reverse().join("/");
   renderStaffDetail();
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
  function syncBulkOptions(){
   const activity=$("agendaBulkType").value;
   $("agendaBulkFlight").hidden=activity!=="flight";
   $("agendaBulkSim").hidden=activity!=="simulator";
   $("agendaBulkNamesLabel").hidden=activity!=="theory";
   $("agendaBulkCapacityLabel").hidden=activity!=="theory";
   $("agendaBulkCapacity").value=activity==="theory"?"12":"1";
   if(activity==="theory"&&!$("agendaBulkNames").value.trim())$("agendaBulkNames").value="Teoría";
   const list=$("agendaBulkAircraft");list.replaceChildren();
   const available=c.aircraft().filter(a=>a.availability==="available"&&!a.archived_at);
   if(!available.length)list.append(htmlText("No hay aeronaves disponibles cargadas en Flota. Primero registralas desde Administración."));
   const area=document.createElement("div");area.className="agenda-resource-options";
   for(const a of available){
    const label=document.createElement("label");label.className="agenda-check";
    const input=document.createElement("input");input.type="checkbox";input.value=a.registration;
    input.name="agenda-aircraft";
    const prev=maintenanceChecks.find(x=>x.registration===a.registration);
    const severity=prev?.alerts?.some(x=>x.level==="due")?" · REVISAR VENCIMIENTO":
     prev?.alerts?.some(x=>x.level==="soon")?" · PRÓXIMO CONTROL":
     prev?.alerts?.length?" · Seguimiento pendiente":"";
    const name=htmlText(a.registration+(a.model?" · "+a.model:"")+severity,"span");
    label.append(input,name);area.append(label);
   }
   list.append(area);
   const simList=$("agendaBulkSimulators");simList.replaceChildren();
   const simulators=c.simulators().filter(x=>x.availability==="available"&&!x.archived_at);
   if(!simulators.length)simList.append(htmlText("No hay simuladores disponibles. Primero registralos en Disponibilidad de flotas y mantenimiento."));
   const simArea=document.createElement("div");simArea.className="agenda-resource-options";
   for(const sim of simulators){
    const label=document.createElement("label");label.className="agenda-check";
    const checkbox=document.createElement("input");checkbox.type="checkbox";
    checkbox.value=sim.name;checkbox.name="agenda-simulator";
    label.append(checkbox,htmlText(sim.name+(sim.model?" · "+sim.model:""),"span"));
    simArea.append(label);
   }
   simList.append(simArea);
  }
  async function publishFullWeek(e){
   e.preventDefault();if(!c.manager||!c.school.can_write)return;
   const activity=$("agendaBulkType").value;
   const resources=activity==="flight"?
    [...document.querySelectorAll('#agendaBulkAircraft input[name="agenda-aircraft"]:checked')].map(x=>x.value):
    activity==="simulator"?
    [...document.querySelectorAll('#agendaBulkSimulators input[name="agenda-simulator"]:checked')].map(x=>x.value):
    $("agendaBulkNames").value.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
   const capacity=activity==="theory"?Number($("agendaBulkCapacity").value):1;
   if(!resources.length||resources.length>20||!Number.isInteger(capacity)||capacity<1||capacity>50){
    msg("Elegí al menos un recurso y un cupo válido (máximo 20 recursos).");return;
   }
   const date=c.weekDates()[0],total=resources.length*56;
   if(activity==="flight"&&!await confirmMaintenanceWarnings(resources))return;
   if(!confirm("¿Publicar la semana del "+date+" para "+names[activity]+"?"+
    "\nRecursos: "+resources.join(", ")+
    "\nSe habilitarán hasta "+total+" horarios (8 turnos de 90 minutos por día y recurso, de lunes a domingo)."+
    "\nLas reservas existentes se conservarán."))return;
   const b=$("agendaBulkSubmit");b.disabled=true;
   try{
    const answer=await c.rpc("aerosuite_availability_publish_full_week",{
     p_institution_id:c.inst,p_week_start:date,p_activity:activity,
     p_resources:resources,p_capacity:capacity
    });
    $("agendaFilter").value=activity;$("agendaResourceFilter").value="all";
    await c.reload();
    msg("Semana publicada: "+answer.newly_published+" horarios nuevos. "+
     answer.already_published+" ya estaban publicados; "+
     answer.skipped+" vencidos o incompatibles. Los alumnos pueden reservar.");
   }catch(err){msg("No se pudo publicar la semana: "+err.message);}
   finally{b.disabled=!c.school.can_write;}
  }
  function syncResource(){
   const kind=$("agendaType").value;
   $("agendaCapacityLabel").hidden=kind==="flight";
   $("agendaCapacity").value=kind==="flight"?"1":kind==="theory"?"12":"1";
   $("agendaResource").value="";
   $("agendaResource").placeholder=kind==="flight"?"LV-ABC o Cupo vuelo 1":kind==="theory"?"Aula 1":"Simulador 1";
   const list=$("agendaResourceList");list.replaceChildren();
   const resources=kind==="flight"?
    c.aircraft().filter(x=>x.availability==="available"&&!x.archived_at).map(x=>x.registration):
    kind==="simulator"?c.simulators().filter(x=>x.availability==="available"&&!x.archived_at).map(x=>x.name):[];
   for(const name of resources){
    const option=document.createElement("option");option.value=name;list.append(option);
   }
  }
  $("agendaFilter").onchange=()=>{$("agendaResourceFilter").value="all";selectedSlotId=null;render();};
  $("agendaResourceFilter").onchange=()=>{selectedSlotId=null;render();};
  if(c.manager){
   $("agendaBulkType").onchange=syncBulkOptions;
   $("agendaBulkForm").onsubmit=publishFullWeek;
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
   syncResource();syncBulkOptions();
  }
  return {
   async load(){
    try{
     const days=c.weekDates(),x=await c.rpc("aerosuite_availability_week",{p_institution_id:c.inst,p_from:days[0],p_to:days[6]});
     slots=Array.isArray(x?.slots)?x.slots:[];bookings=Array.isArray(x?.reservations)?x.reservations:[];
     if(c.manager){
      try{
       const alerts=await c.rpc("aerosuite_maintenance_alerts",{p_institution_id:c.inst});
       maintenanceChecks=Array.isArray(alerts?.aircraft)?alerts.aircraft:[];
       syncBulkOptions();
      }catch(e){msg("No se pudieron consultar avisos de mantenimiento: "+e.message);}
     }
     msg(slots.filter(s=>s.published).length+" horarios publicados en la semana.");render();
    }catch(e){slots=[];bookings=[];msg("Error al consultar turnos: "+e.message);render();}
   },
   isPublishedBooking(id){return bookings.some(r=>r.booking_id===id);},
   refresh(){render();},
   showReschedule(){render();},
   hideReschedule(){render();}
  };
 }
};