/* Gente de Vuelo - Flight Operations: etapas, borrador y control previo sin IA */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const date=()=>{const raw=String($('flight-time')?.value||'').trim();const x=raw.replace(' ','T');if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(x))return null;const d=new Date(x+'Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,16)===x?d:null;};
const rows=()=>window.GDV_FLIGHT_NAV?.snapshot?.()||[];
const eta=()=>{
 const dep=date(),rr=rows();
 if(!dep||!rr.length||rr.some(r=>!Number.isFinite(r.gs_kt)||r.gs_kt<=0||!Number.isFinite(r.distance_nm)))return null;
 const hours=rr.reduce((v,r)=>v+r.distance_nm/r.gs_kt,0);
 return hours>0&&hours<72?new Date(dep.getTime()+hours*3600000).toISOString():null;
};
function gate(){
 const raw=$('flight-pronarea')?.value||'',dep=date();
 if(!raw.trim())return {ok:false,message:'Pegá el PRONAREA oficial.'};
 if(!dep)return {ok:false,message:'Cargá fecha y hora UTC de salida.'};
 if(!$('flight-pronarea-confirm')?.checked)return {ok:false,message:'Confirmá que comprobaste emisión, FIR y vigencia real en el SMN.'};
 const matches=[...raw.toUpperCase().matchAll(/\bPRONAREA\s+FIR\s+([A-Z]{3,4})\s+VALIDEZ\s+(\d{4})(?!\d)/g)];
 if(!matches.length)return {ok:false,message:'No se puede identificar la cabecera FIR / VALIDEZ del PRONAREA.'};
 const aliases={SAEF:['EZE','SAEF'],SACF:['CBA','COR','SACF'],SAMF:['MZA','SAMF'],SARR:['RES','SARR'],SAVF:['CRV','SAVF']};
 const present=matches.map(m=>m[1]);
 for(const f of document.querySelectorAll('.flight-fir:checked')){
  if(!(aliases[f.value]||[f.value]).some(name=>present.includes(name)))
   return {ok:false,message:'Falta PRONAREA de la FIR '+f.value+'. Cargá el boletín correspondiente o revisá las FIR del vuelo.'};
 }

 const end=eta();
 if(!end)return {ok:false,message:'No se conoce la ETA completa: verificá distancias y vientos de todas las piernas antes de activar la IA.'};
 for(const m of matches){
  const validityWindow=window.GDV_PRONAREA_WIND?.resolveWindow?.(m[2],dep);
  if(!validityWindow)return {ok:false,message:'VALIDEZ del PRONAREA ilegible o incorrecta.'};
  if(dep.getTime()<validityWindow.start||dep.getTime()>=validityWindow.end)return {ok:false,message:'PRONAREA '+m[1]+' '+m[2]+' no cubre la salida '+dep.toISOString().slice(11,16)+' UTC.'};
  if(Date.parse(end)>=validityWindow.end)return {ok:false,message:'PRONAREA '+m[1]+' '+m[2]+' no cubre el arribo estimado '+end.slice(11,16)+' UTC.'};
 }
 return {ok:true,message:'Fecha UTC tomada de la salida prevista y horario compatible hasta la ETA. La emisión y vigencia reales deben confirmarse en el SMN.'};
}
window.GDV_FLIGHT_PRONAREA_GATE=Object.freeze({check:gate,estimatedArrivalUtc:eta});
function refreshGate(){
 const e=$('flight-pronarea-gate'),b=$('flight-essential-ask'),result=gate();
 if(e){e.textContent=result.message;e.dataset.validity=result.ok?'compatible':'blocked';}
 if(b){b.disabled=!result.ok;b.title=result.ok?'':'IA bloqueada sin tokens: '+result.message;}
}
['flight-pronarea','flight-pronarea-confirm','flight-time'].forEach(id=>{$(id)?.addEventListener('input',refreshGate);$(id)?.addEventListener('change',refreshGate)});
const plan=$('ops-plan'),weather=$('ops-consultar'),report=$('ops-meteo'),p=$('gdv-meteo-private');
if(!plan||!weather||!report||!p)return;
const css=document.createElement('style');
css.textContent='.ops-accordion[hidden],.flight-wizard-nav-panel[hidden],.flight-leg-editor[hidden],.flight-base-fields[hidden]{display:none!important}'+
'.ops-cards-heading,.ops-cards,.jump{display:none!important}'+
'#nubosidad[hidden],#fuentes[hidden],#ops-fuentes[hidden]{display:none!important}'+
'.flight-wizard-ui{padding:19px;margin:18px 0;border:1px solid #577389;background:#202e3b;border-radius:18px;color:#ecf3f8}'+
'.flight-wizard-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:16px 0}'+
'.flight-wizard-steps button,.flight-wizard-toolbar button{padding:11px;border:1px solid #7f98aa;border-radius:11px;background:#354c5f;color:#ecf5fa;font:inherit;cursor:pointer}'+
'.flight-wizard-steps button[aria-current=step]{background:#b3c9d8;color:#162f41;font-weight:700}'+
'.flight-wizard-toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding-top:13px;border-top:1px solid #526879}'+
'.flight-wizard-toolbar #flight-wizard-status{flex:1 1 230px;font-size:13px;color:#d8e9f4}'+
'.flight-wizard-back-row{display:flex;justify-content:flex-start;margin:20px 0 6px;padding-top:14px;border-top:1px solid #526879}'+
'.flight-wizard-back-row[hidden]{display:none!important}.flight-wizard-back-row button{padding:11px 17px;border:1px solid #91b3ca;border-radius:11px;background:#354c5f;color:#ecf5fa;font:inherit;font-weight:700;cursor:pointer}'+
'.flight-wizard-back-row button:hover,.flight-wizard-back-row button:focus-visible,.flight-wizard-toolbar button:hover:not(:disabled),.flight-wizard-steps button:hover:not(:disabled){background:#476b86;color:#fff}'+
'.flight-report-stale{margin:15px 0;padding:12px 15px;border:1px solid #e1b76e;border-radius:11px;background:#56472e;color:#fff0d3;line-height:1.55}'+
'.flight-report-stale[hidden]{display:none!important}'+
'.flight-pronarea-confirm-missing{border:2px solid #f3b258!important;box-shadow:0 0 0 3px #f3b25844!important}'+
'.flight-pronarea-confirm-error{flex:0 0 100%;box-sizing:border-box;padding:10px 13px;margin:0;border:1px solid #f3b258;border-radius:9px;background:#5a4029;color:#fff1d7;font-size:13px;font-weight:700}'+
'.flight-pronarea-confirm-error[hidden]{display:none!important}'+
'.flight-wizard-continue-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:14px 0;padding:14px;border:1px solid #6793ad;border-radius:13px;background:#203b4d}'+
'.flight-wizard-continue-row button{border:1px solid #bbdfed;border-radius:10px;padding:12px 18px;background:#b3d6e8;color:#102c3d;font:inherit;font-weight:800;cursor:pointer}'+
'.flight-wizard-continue-row button:disabled{opacity:.55;cursor:wait}.flight-wizard-continue-row .feedback{flex:1 1 190px;color:#d7e9f3;font-size:12px}'+
'.flight-wizard-nav-panel{background:#253847;border:1px solid #557080;border-radius:15px;padding:18px;margin:12px 0;color:#eef5fb}'+
'.flight-fuel-inputs{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:12px;margin:15px 0}'+
'#flight-wizard-leg-table{overflow-x:auto;margin:15px 0}#flight-wizard-leg-table table{width:100%;border-collapse:collapse;font-size:12px;color:#eef5fa}#flight-wizard-leg-table th,#flight-wizard-leg-table td{padding:9px 6px;border-bottom:1px solid #566e80;text-align:left;white-space:nowrap}'+
'#flight-wizard-leg-table .flight-magnetic-heading{background:#294c5f;color:#e5f8ff;font-weight:800;border-left:2px solid #9fc6dc;border-right:2px solid #9fc6dc}'+
'#flight-wizard-leg-table .flight-leg-legend{color:#bfd7e7;font-size:12px;line-height:1.5;margin:9px 0 0}'+
'.flight-fuel-inputs label{display:grid;gap:5px;font-size:13px}.flight-fuel-inputs input{padding:9px;border-radius:8px;background:#31495d;color:#fff;border:1px solid #7893a8;width:100%;box-sizing:border-box}'+
'.flight-fuel-editable{display:flex;min-width:0;width:100%}.flight-fuel-editable input{flex:1 1 auto;min-width:0;border-radius:8px 0 0 8px;border-right:0;appearance:textfield}'+
'.flight-fuel-editable input::-webkit-inner-spin-button,.flight-fuel-editable input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}'+
'.flight-fuel-stepper{display:grid;grid-template-rows:1fr 1fr;flex:0 0 27px}.flight-fuel-stepper button{display:block;width:100%;min-height:0;margin:0;padding:0;border:1px solid #91b3ca;border-radius:0;background:#47667d;color:#fff;font:700 12px/1 Arial,sans-serif;cursor:pointer}'+
'.flight-fuel-stepper button:first-child{border-radius:0 8px 0 0;border-bottom:0}.flight-fuel-stepper button:last-child{border-radius:0 0 8px 0}.flight-fuel-stepper button:hover,.flight-fuel-stepper button:focus-visible{background:#658eaa;outline-offset:1px}'+
'#flight-fuel-summary{padding:17px;background:#33495b;border:1px solid #57758b;border-radius:12px}'+
'.flight-fuel-chart{padding:2px 1px 14px}.flight-fuel-chart-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}'+
'.flight-fuel-chart-head strong{display:block;color:#eefaff;font-size:16px}.flight-fuel-chart-head span{display:block;color:#b6cfdf;font-size:12px;margin-top:2px}'+
'.flight-fuel-chart-total{background:#1c465e;border:1px solid #69a5c4;border-radius:11px;padding:7px 13px;color:#e1f8ff;text-align:right;min-width:94px}'+
'.flight-fuel-chart-total b{display:block;font-size:19px;line-height:1.15;font-variant-numeric:tabular-nums}.flight-fuel-chart-total small{color:#b5d9ec;font-size:11px}'+
'.flight-fuel-chart-plot{margin:8px 0 3px;border:1px solid #536f86;border-radius:11px;background:linear-gradient(180deg,#293f52,#27394a);overflow:hidden}'+
'.flight-fuel-chart-plot svg{display:block;width:100%;height:auto;max-height:272px}'+
'.flight-fuel-chart-note{color:#b9d0df;font-size:12px;line-height:1.5}'+
'.flight-fuel-details{white-space:pre-line;line-height:1.8;border-top:1px solid #607b8e;padding-top:12px;margin-top:2px;color:#edf5fa}'+
'@media(max-width:700px){.flight-wizard-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.flight-wizard-ui,.flight-wizard-nav-panel{padding:12px}}'+
'@media print{body>*:not(#flight-print-sheet){display:none!important}#flight-print-sheet{display:block!important;white-space:pre-wrap;background:#fff!important;color:#111!important;font:11pt/1.5 Arial;padding:8mm}@page{size:A4;margin:12mm}}';
document.head.append(css);
const ui=document.createElement('section');ui.className='flight-wizard-ui';
ui.innerHTML='<strong>FLIGHT OPERATIONS · Planificación guiada</strong><p>Una etapa por vez · UTC · Guardado privado al continuar</p><div id="flight-wizard-steps" class="flight-wizard-steps"></div><div class="flight-wizard-toolbar"><button id="flight-wizard-back" type="button">← Anterior</button><button id="flight-wizard-next" type="button">Guardar y continuar →</button><span id="flight-wizard-status" role="status" aria-live="polite"></span></div><div class="flight-wizard-toolbar"><button id="flight-wizard-resume" type="button" hidden>Continuar vuelo guardado</button><button id="flight-wizard-new" type="button">Nuevo vuelo</button></div>';
plan.before(ui);
const nav=document.createElement('section');nav.className='flight-wizard-nav-panel';nav.id='flight-wizard-navigation';
nav.innerHTML='<h2>Etapa 4 · Cálculos de navegación y combustible</h2><p>Precomputada VFR: curso verdadero, viento, corrección de deriva, variación magnética, GS, tiempo y combustible. El rumbo magnético a mantener aparece después de la derrota magnética. Resultados estimados sujetos a verificación en cartas y boletines oficiales. Sin tokens de IA.</p>';
report.before(nav);
const navSettings=$('flight-nav-settings'),navOutput=$('flight-essential-navigation');
if(navSettings)nav.append(navSettings);if(navOutput)nav.append(navOutput);
const fuel=document.createElement('div');fuel.id='flight-wizard-fuel';
const inputs=[['flight-fuel-burn','Consumo (litros/hora)',''],['flight-fuel-available','Combustible utilizable (litros)',''],['flight-fuel-start','Inicial: rodaje y ascenso (litros)','5'],['flight-fuel-contingency','Contingencia (%)','10'],['flight-fuel-reserve','Reserva final (minutos)','45']];
fuel.innerHTML='<h3>Planificación de combustible</h3><div class="flight-fuel-inputs">'+inputs.map(x=>'<label>'+x[1]+'<span class="flight-fuel-editable"><input id="'+x[0]+'" type="number" min="0" max="10000" step="0.1" value="'+x[2]+'"><span class="flight-fuel-stepper"><button type="button" data-fuel-target="'+x[0]+'" data-fuel-direction="1" aria-label="Aumentar '+x[1]+'" title="Aumentar">▲</button><button type="button" data-fuel-target="'+x[0]+'" data-fuel-direction="-1" aria-label="Disminuir '+x[1]+'" title="Disminuir">▼</button></span></span></label>').join('')+'</div><div id="flight-fuel-summary"><div class="flight-fuel-chart" id="flight-fuel-chart"><div class="flight-fuel-chart-head"><div><strong>Consumo acumulado durante el vuelo</strong><span>Litros estimados · minutos transcurridos</span></div><div class="flight-fuel-chart-total"><b id="flight-fuel-chart-total">— L</b><small id="flight-fuel-chart-duration">Tiempo pendiente</small></div></div><div class="flight-fuel-chart-plot"><svg id="flight-fuel-chart-svg" viewBox="0 0 690 235" role="img" aria-label="Gráfico de combustible pendiente de datos"></svg></div><div class="flight-fuel-chart-note" id="flight-fuel-chart-note">Ingresá el consumo horario para ver una proyección de 60 minutos; luego se adaptará a la ruta.</div></div><div id="flight-fuel-details" class="flight-fuel-details" role="status" aria-live="polite">Completá los datos del plan.</div></div><p class="sub">5 litros iniciales, 10 % y 45 minutos son valores orientativos editables, no garantías ni mínimos reglamentarios. Validá el POH/AFM, reservas, fases de ascenso y rutas oficiales.</p><button type="button" id="flight-wizard-print">Imprimir o guardar como PDF A4</button>';
const legTable=document.createElement('section');legTable.id='flight-wizard-leg-table';legTable.setAttribute('aria-label','Planilla de navegación por piernas');nav.append(legTable);
nav.append(fuel);
let step=0,busy=false,stored=null;
const essentialRow=document.createElement('div');essentialRow.className='flight-wizard-continue-row';
const essentialButton=document.createElement('button');essentialButton.type='button';essentialButton.textContent='Guardar y continuar al informe esencial →';
const essentialFeedback=document.createElement('span');essentialFeedback.className='feedback';essentialFeedback.setAttribute('role','status');
essentialFeedback.textContent='Siguiente etapa: informe esencial y consultas del piloto.';
essentialButton.addEventListener('click',async()=>{
 if(step!==3||busy)return;
 essentialButton.disabled=true;essentialFeedback.textContent=document.documentElement.dataset.flightRole==='member'?'Guardando cálculos y abriendo la planilla final…':'Guardando cálculos y abriendo el informe esencial…';
 await go(4);
 essentialFeedback.textContent=step===4?(document.documentElement.dataset.flightRole==='member'?'Planilla final abierta.':'Informe esencial abierto.'):$('flight-wizard-status').textContent;
 essentialButton.disabled=false;
});
essentialRow.append(essentialButton,essentialFeedback);nav.append(essentialRow);
const all=[plan,weather,$('ops-boletines'),$('nubosidad'),$('fuentes'),$('ops-fuentes'),report,$('ops-piloto'),$('ops-precauciones'),$('ops-cartas'),nav].filter(Boolean);
const titles=['Datos del vuelo','Planificar piernas','Meteorología','Cálculos y combustible','Informe esencial'];
const steps=titles.map((x,i)=>{const b=document.createElement('button');b.textContent=(i+1)+' · '+x;b.type='button';b.onclick=()=>{if(i<=step)void go(i);else notify('Avanzá utilizando Guardar y continuar.');};$('flight-wizard-steps').append(b);return b;});
// Un acceso de regreso al pie de cada etapa, además del botón superior.
// No desmontamos los formularios al navegar: los valores editados permanecen.
const bottomBackRows=[plan,$('ops-boletines'),nav,$('ops-cartas')].map(section=>{
 if(!section)return null;
 const row=document.createElement('div');row.className='flight-wizard-back-row';
 const button=document.createElement('button');button.type='button';button.textContent='← Volver a la etapa anterior';
 button.addEventListener('click',()=>{void go(step-1);});
 row.append(button);section.append(row);
 return row;
});
const reportStale=document.createElement('p');
reportStale.className='flight-report-stale';reportStale.hidden=true;reportStale.setAttribute('role','status');
reportStale.textContent='Se modificaron datos del vuelo después de generar este informe. La evaluación anterior puede estar desactualizada: revisá nuevamente los boletines y generá otro informe solo si lo autorizás.';
$('informe-esencial')?.insertBefore(reportStale,$('flight-essential-result'));
for(const section of [plan,weather,$('ops-boletines'),nav].filter(Boolean)){
 const markStale=()=>{if(!$('flight-essential-result')?.hidden)reportStale.hidden=false;};
 section.addEventListener('input',markStale);
 section.addEventListener('change',markStale);
}
// Una respuesta nueva de la IA reemplaza la advertencia; nunca se solicita
// automáticamente, para respetar el consentimiento y el consumo de tokens.
if($('flight-essential-analysis'))new MutationObserver(()=>{if(!$('flight-essential-result')?.hidden)reportStale.hidden=true;})
 .observe($('flight-essential-analysis'),{childList:true,characterData:true,subtree:true});
const base=plan.querySelector('.form'),editor=plan.querySelector('.flight-leg-editor');
if(base)base.classList.add('flight-base-fields');
const notify=s=>$('flight-wizard-status').textContent=s;
const pronareaConfirm=$('flight-pronarea-confirm');
const pronareaConfirmLabel=pronareaConfirm?.closest('label');
const pronareaConfirmError=document.createElement('p');
pronareaConfirmError.className='flight-pronarea-confirm-error';
pronareaConfirmError.id='flight-pronarea-confirm-error';
pronareaConfirmError.setAttribute('role','alert');
pronareaConfirmError.textContent='Para pasar a Cálculos y combustible, confirmá que verificaste en el SMN la FIR, la emisión y la vigencia del PRONAREA.';
pronareaConfirmError.hidden=true;
pronareaConfirmLabel?.after(pronareaConfirmError);
function clearPronareaConfirmationError(){
 pronareaConfirmError.hidden=true;
 pronareaConfirmLabel?.classList.remove('flight-pronarea-confirm-missing');
 pronareaConfirm?.removeAttribute('aria-invalid');
 pronareaConfirm?.removeAttribute('aria-describedby');
}
pronareaConfirm?.addEventListener('change',()=>{
 if(pronareaConfirm.checked){clearPronareaConfirmationError();notify('PRONAREA confirmado. Ya podés continuar a Cálculos y combustible.');}
});
function display(s){
 step=s;all.forEach(x=>x.hidden=true);
 const visible=s===0||s===1?[plan]:s===2?[weather,$('ops-boletines'),$('nubosidad'),$('ops-fuentes')]:s===3?[nav]:[report,$('ops-piloto'),$('fuentes'),$('ops-cartas')];
 visible.forEach(x=>{if(x){x.hidden=false;if(x.tagName==='DETAILS')x.open=true;}});
 if(base)base.hidden=s===1;if(editor)editor.hidden=s===0;
 const title=$('plan-vuelo')?.querySelector('h2');if(title)title.textContent=s===1?'Planificación asistida de piernas':'Datos del vuelo';
 if(s===1)refreshDistanceFields();
 steps.forEach((b,i)=>b.setAttribute('aria-current',i===s?'step':'false'));
 $('flight-wizard-back').disabled=s===0;$('flight-wizard-next').textContent=s===4?'Guardar planificación':s===2?'Guardar y pasar a cálculos →':'Guardar y continuar →';
 bottomBackRows.forEach((row,i)=>{if(row)row.hidden=(i===0?s===0:i!==s-1);});
 $('consumo-ia').hidden=s!==4;
 if(s>=3)calcFuel();if(s===4)refreshGate();
 ui.scrollIntoView({behavior:'smooth',block:'start'});
}
// Resolver nombres de aeródromos del catálogo, sin inventar coordenadas.
function plainName(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
}
const airportNames=new Map();
for(const o of document.querySelectorAll('#flight-origin option,#flight-dest option')){
 if(!/^SA[A-Z]{2}$/.test(o.value))continue;
 const label=o.textContent.split(' · ')[0].trim(),name=plainName(label);
 if(!name)continue;
 if(!airportNames.has(name))airportNames.set(name,o.value);
 else if(airportNames.get(name)!==o.value)airportNames.set(name,null);
}
// Distancia de cada pierna en millas náuticas. La fuente queda identificada.
const pilotNm=new Map();
const routePoints=()=>{
 const choice=id=>{
  const n=$(id);return String((n?.value==='OTHER'?$(id+'-other')?.value:n?.value)||'').trim().toUpperCase();
 };
 return [choice('flight-origin'),...[...document.querySelectorAll('#flight-waypoints .flight-waypoint-row input')].map(n=>n.value.trim().toUpperCase()),choice('flight-dest')];
};
function knownPoint(name){
 const key=String(name||'').toUpperCase(),geo=window.GDV_FLIGHT_FIR_GEODATA?.airports||{},named=window.GDV_FLIGHT_NAMED_POINTS||{};
 const found=geo[key]||named[key];
 if(Array.isArray(found)&&found.length===2&&found.every(Number.isFinite))return found;
 const raw=/^(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(key);
 if(!raw)return null;
 const lat=Number(raw[1]),lon=Number(raw[2]);
 return Math.abs(lat)<=90&&Math.abs(lon)<=180?[lat,lon]:null;
}
function haversineNm(a,b){
 if(!a||!b)return null;
 const rad=Math.PI/180,dlat=(b[0]-a[0])*rad,dlon=(b[1]-a[1])*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dlon/2)**2;
 return 3440.065*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
function nmKey(index,points){return index+'|'+(points[index]||'')+'|'+(points[index+1]||'');}
function refreshDistanceFields(){
 const points=routePoints();
 [...document.querySelectorAll('#flight-legs-list .flight-leg-row')].forEach((row,i)=>{
  let wrap=row.querySelector('.flight-leg-nm-field');
  if(!wrap){
   wrap=document.createElement('label');wrap.className='field flight-leg-nm-field';
   const label=document.createElement('span');wrap.append(label);
   const input=document.createElement('input');
   input.type='number';input.min='0.1';input.max='20000';input.step='0.1';
   input.className='flight-leg-distance';input.inputMode='decimal';
   input.setAttribute('aria-label','Distancia de la pierna '+(i+1)+' en millas náuticas');
   wrap.append(input);
   input.addEventListener('input',()=>{
    const key=wrap.dataset.routeKey;
    if(!key)return;
    const raw=input.value.trim();
    if(raw===''||!Number.isFinite(Number(raw))||Number(raw)<=0||Number(raw)>20000)pilotNm.delete(key);
    else pilotNm.set(key,raw);
    wrap.querySelector('span').textContent=raw===''?'Distancia (NM) · pendiente':'Distancia (NM) · ingresada por piloto';
   });
   row.insertBefore(wrap,row.querySelector('.flight-vfr-result'));
  }
  const key=nmKey(i,points),input=wrap.querySelector('input');
  wrap.dataset.routeKey=key;
  const pilot=pilotNm.get(key),auto=haversineNm(knownPoint(points[i]),knownPoint(points[i+1]));
  const next=pilot!==undefined?pilot:Number.isFinite(auto)&&auto>0?auto.toFixed(1):'';
  if(document.activeElement!==input&&input.value!==next)input.value=next;
  input.dataset.distanceSource=pilot!==undefined?'pilot':Number.isFinite(auto)&&auto>0?'geometric':'unknown';
  const text=pilot!==undefined?'Distancia (NM) · ingresada por piloto':Number.isFinite(auto)&&auto>0?'Distancia (NM) · calculada':'Distancia (NM) · ingresá el valor';
  if(wrap.querySelector('span').textContent!==text)wrap.querySelector('span').textContent=text;
 });
}
const scheduleNm=()=>queueMicrotask(refreshDistanceFields);
new MutationObserver(scheduleNm).observe($('flight-legs-list'),{childList:true,subtree:true});
$('flight-waypoints')?.addEventListener('input',scheduleNm);
for(const id of ['flight-origin','flight-dest','flight-origin-other','flight-dest-other']){
 $(id)?.addEventListener('change',scheduleNm);
 $(id)?.addEventListener('input',scheduleNm);
}
window.GDV_FLIGHT_DISTANCE=Object.freeze({
 refresh:refreshDistanceFields,
 get:(index)=>{const input=document.querySelectorAll('#flight-legs-list .flight-leg-distance')[index];
  const n=Number(input?.value);return input?.value.trim()!==''&&Number.isFinite(n)&&n>0?n:null;},
 getSource:(index)=>document.querySelectorAll('#flight-legs-list .flight-leg-distance')[index]?.dataset.distanceSource||'unknown',
 save:()=>[...pilotNm.entries()].map(([key,value])=>({key,value})),
 restore:entries=>{
  pilotNm.clear();
  if(Array.isArray(entries))for(const row of entries.slice(0,9)){
   if(typeof row?.key==='string'&&row.key.length<160&&
      typeof row.value==='string'&&row.value.length<14&&Number(row.value)>0&&Number(row.value)<=20000)
    pilotNm.set(row.key,row.value);
  }
  refreshDistanceFields();
 }
});
scheduleNm();
function normalizeWaypoint(input){
 if(!input||!input.matches('#flight-waypoints .flight-waypoint-row input'))return false;
 const raw=input.value.trim(),name=plainName(raw);
 const code=/^SA[A-Z]{2}$/.test(name)?name:airportNames.get(name);
 if(!code||!window.GDV_FLIGHT_FIR_GEODATA?.airports?.[code]||raw===code)return false;
 const legIndex=[...document.querySelectorAll('#flight-waypoints .flight-waypoint-row input')].indexOf(input);
 const oldTrue=[legIndex,legIndex+1].map(index=>{
  const x=[...document.querySelectorAll('#flight-legs-list .flight-true-track')][index];
  return x&&x.value!==''&&x.dataset.estimated==='false'?x.value:null;
 });
 input.value=code;
 const option=document.querySelector('#flight-origin option[value="'+code+'"]');
 input.title=(option?.textContent?.trim()||code)+' · Referencia reconocida del catálogo';
 input.dispatchEvent(new Event('input',{bubbles:true}));
 input.dispatchEvent(new Event('change',{bubbles:true}));
 oldTrue.forEach((val,j)=>{
  if(val===null)return;
  const x=[...document.querySelectorAll('#flight-legs-list .flight-true-track')][legIndex+j];
  if(x){x.value=val;x.dispatchEvent(new Event('input',{bubbles:true}));}
 });
 refreshDistanceFields();
 return true;
}
function normalizeWaypoints(){
 for(const node of document.querySelectorAll('#flight-waypoints .flight-waypoint-row input'))normalizeWaypoint(node);
}
$('flight-waypoints')?.addEventListener('focusout',event=>{
 if(normalizeWaypoint(event.target))notify('Punto identificado por su código OACI. Revisá las piernas actualizadas.');
});
const legacyNext=document.querySelector('#ops-plan .ops-next[data-ops-target="#consultar"]');
if(legacyNext){
 legacyNext.textContent='Guardar y continuar →';
 legacyNext.setAttribute('aria-label','Guardar el vuelo y continuar a la siguiente etapa');
 // Interceptar ANTES del listener histórico que solo hacía scroll a boletines.
 legacyNext.addEventListener('click',event=>{
  event.preventDefault();event.stopImmediatePropagation();
  if(step<2)void go(step+1);
  else notify('Usá el botón Guardar y continuar de la etapa actual.');
 },true);
}
function valid(){
 if(step===0){
  for(const id of ['flight-origin','flight-dest','flight-alternate','flight-time','flight-alt']){
   const e=$(id);if(!e?.value||!e.checkValidity()){e?.reportValidity();notify('Completá los datos obligatorios del vuelo.');return false;}
  }
  if(!date()){notify('Ingresá una salida UTC válida.');return false;}
  if($('flight-alternate').value===$('flight-dest').value){notify('El alternativo debe ser distinto del destino.');return false;}
 }
 if(step===1){
  normalizeWaypoints();
  refreshDistanceFields();
  const waypoints=[...document.querySelectorAll('#flight-waypoints input')],legs=[...document.querySelectorAll('#flight-legs-list .flight-leg-row > .field:not(.flight-vfr-track-label):not(.flight-true-track-label):not(.flight-leg-nm-field) input[type=number]')];
  const distances=[...document.querySelectorAll('#flight-legs-list .flight-leg-distance')];
  const courses=[...document.querySelectorAll('#flight-legs-list .flight-true-track')];
  if(courses.length!==legs.length||courses.some(e=>!e.value.trim()||!e.checkValidity())){
   courses.find(e=>!e.value.trim()||!e.checkValidity())?.focus();
   notify('Ingresá o corregí el curso verdadero (°T) de cada pierna; comprobalo con tu carta de navegación.');return false;
  }
  if(!distances.length||distances.length!==legs.length||distances.some(e=>!e.value.trim()||!e.checkValidity())){
   notify('Completá las distancias en millas náuticas (NM) de cada pierna.');return false;
  }
  if(waypoints.some(e=>!e.value.trim())||legs.some(e=>!e.value||!e.checkValidity())){notify('Completá todas las piernas y altitudes.');return false;}
 }
 if(step===2&& !pronareaConfirm?.checked){
  pronareaConfirmError.hidden=false;
  pronareaConfirmLabel?.classList.add('flight-pronarea-confirm-missing');
  pronareaConfirm?.setAttribute('aria-invalid','true');
  pronareaConfirm?.setAttribute('aria-describedby',pronareaConfirmError.id);
  pronareaConfirm?.focus({preventScroll:true});
  pronareaConfirmLabel?.scrollIntoView({behavior:'smooth',block:'center'});
  notify('Falta confirmar la verificación del PRONAREA en el SMN. Marcá la casilla resaltada para continuar.');
  return false;
 }
 if(step===3){
  const burn=Number($('flight-fuel-burn')?.value),available=Number($('flight-fuel-available')?.value);
  if(!Number.isFinite(burn)||burn<=0||!Number.isFinite(available)||available<=0){
   notify('Completá consumo en litros/hora y combustible utilizable en litros para finalizar la navegación.');return false;
  }
  // Los boletines pueden revisarse en la etapa siguiente: la vigencia del
  // PRONAREA bloquea la consulta a IA, nunca la navegación entre pantallas.
 }
 return true;
}
function pack(){
 const fields={};p.querySelectorAll('#flight-analysis-form [id],#flight-nav-tas,#flight-pronarea,#flight-pronarea-confirm,#flight-atis,#flight-wizard-fuel input').forEach(e=>{
  if(!('value' in e)||e.closest('#flight-legs-list')||e.closest('#flight-waypoints'))return;
  fields[e.id]=e.type==='checkbox'?e.checked:e.value;
 });
 return {version:1,step,fields,manualWinds:window.GDV_FLIGHT_NAV?.saveWind?.()||[],trueTracks:window.GDV_FLIGHT_VFR_TRACK?.exportManual?.()||[],manualNm:window.GDV_FLIGHT_DISTANCE?.save?.()||[],stops:[...document.querySelectorAll('#flight-waypoints input')].map(x=>x.value),levels:[...document.querySelectorAll('#flight-legs-list .flight-leg-row > .field:not(.flight-vfr-track-label):not(.flight-true-track-label):not(.flight-leg-nm-field) input[type=number]')].map(x=>x.value),
 firs:[...document.querySelectorAll('.flight-fir')].filter(x=>x.checked).map(x=>x.value)};
}
async function userClient(){
 const client=window.GDV_AUTH?.client;if(!client)throw Error('No hay conexión con Supabase.');
 const {data,error}=await client.auth.getUser();if(error||!data?.user?.id)throw Error('Necesitás iniciar sesión.');
 return {client,user:data.user};
}
async function save(targetStep=step){
 const {client,user}=await userClient();
 const planData=pack();planData.step=targetStep;
 const {error}=await client.from('gdv_flight_plan_drafts').upsert({user_id:user.id,plan:planData,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(error)throw Error('No se guardó el borrador: '+error.message);
}
async function go(n){
 if(busy||n===step||n<0||n>=titles.length)return;
 // Retroceder es una acción local: nunca debe depender de Supabase ni de una
 // validación de campos que el piloto precisamente volvió para corregir.
 if(n<step){display(n);notify('Etapa '+(step+1)+' de cinco. Revisá o modificá los datos; se guardarán al continuar.');return;}
 if(!valid())return;
 busy=true;notify('Guardando borrador privado…');
 try{await save(n);display(n);notify('Plan guardado. Etapa '+(step+1)+' de cinco.');}
 catch(e){notify(e?.message||'Error al guardar. No se cambió de etapa.');}
 finally{busy=false;}
}
$('flight-wizard-next').onclick=()=>{if(step===4){void save().then(()=>notify('Plan guardado. Podés descargar o imprimir la planilla.')).catch(e=>notify(e.message));}else void go(step+1);};
$('flight-wizard-back').onclick=()=>{void go(Math.max(0,step-1));};
// Un único botón al pie de la evaluación meteorológica; mantiene el guardado.
const calculationsButtons=[],calculationsMessages=[];
async function continueToCalculations(){
 if(step!==2){notify('Este acceso corresponde a la etapa de Meteorología.');return;}
 if(busy)return;
 calculationsButtons.forEach(button=>{button.disabled=true;});
 calculationsMessages.forEach(node=>{node.textContent='Guardando vuelo y abriendo cálculos…';});
 await go(3);
 if(step!==3)calculationsMessages.forEach(node=>{node.textContent=$('flight-wizard-status').textContent;});
 calculationsButtons.forEach(button=>{button.disabled=false;});
}
for(const section of [$('ops-boletines')].filter(Boolean)){
 const row=document.createElement('div');row.className='flight-wizard-continue-row';
 const button=document.createElement('button');button.type='button';button.textContent='Guardar y continuar a cálculos →';
 const feedback=document.createElement('span');feedback.className='feedback';feedback.setAttribute('role','status');
 feedback.textContent='Siguiente etapa: rumbo, velocidad sobre el suelo, tiempos y combustible.';
 button.addEventListener('click',()=>{void continueToCalculations();});
 row.append(button,feedback);section.append(row);
 calculationsButtons.push(button);calculationsMessages.push(feedback);
}
function emit(e){e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
function restore(plan){
 if(!plan||plan.version!==1)return;
 for(const [id,val] of Object.entries(plan.fields||{})){const e=$(id);if(!e||!('value' in e))continue;if(e.type==='checkbox')e.checked=!!val;else e.value=String(val??'');emit(e);}
 const stops=Array.isArray(plan.stops)?plan.stops.slice(0,8):[];
 stops.forEach(()=>{$('flight-add-stop')?.click();});
 const w=[...document.querySelectorAll('#flight-waypoints input')];stops.forEach((s,i)=>{if(w[i]){w[i].value=String(s);emit(w[i]);}});
 const a=[...document.querySelectorAll('#flight-legs-list .flight-leg-row > .field:not(.flight-vfr-track-label):not(.flight-true-track-label):not(.flight-leg-nm-field) input[type=number]')];
 (plan.levels||[]).forEach((v,i)=>{if(a[i]){a[i].value=String(v);emit(a[i]);}});
 document.querySelectorAll('.flight-fir').forEach(e=>{e.checked=(plan.firs||[]).includes(e.value);emit(e);});
 $('flight-auto-results').hidden=true;
 queueMicrotask(()=>{
  window.GDV_FLIGHT_VFR_TRACK?.restoreManual?.(plan.trueTracks||[],plan.magneticTracks||[]);
  window.GDV_FLIGHT_DISTANCE?.restore?.(plan.manualNm||[]);
  window.GDV_FLIGHT_NAV?.restoreWind?.(plan.manualWinds||[]);
 });
 display(Math.max(0,Math.min(3,Number(plan.step)||0)));
 notify('Plan recuperado. Volvé a consultar METAR, TAF y SIGMET: los informes anteriores no se consideran vigentes.');
}
async function loadSaved(){
 try{const {client,user}=await userClient();const {data,error}=await client.from('gdv_flight_plan_drafts').select('plan').eq('user_id',user.id).maybeSingle();if(error)throw Error(error.message);
  if(data?.plan?.version===1){stored=data.plan;$('flight-wizard-resume').hidden=false;notify('Hay un borrador privado. Podés continuarlo o iniciar un vuelo nuevo.');}
  else notify('Vuelo nuevo. El borrador se guardará al cambiar de etapa.');
 }catch(e){notify('Guardado privado no disponible: '+e.message);}
}
$('flight-wizard-resume').onclick=()=>{if(stored&&confirm('¿Continuar el plan guardado y reemplazar los campos visibles?')){restore(stored);$('flight-wizard-resume').hidden=true;}};
$('flight-wizard-new').onclick=async()=>{
 if(!confirm('¿Descartar el borrador guardado y comenzar un vuelo nuevo?'))return;
 try{const {client,user}=await userClient();const {error}=await client.from('gdv_flight_plan_drafts').delete().eq('user_id',user.id);if(error)throw Error(error.message);location.reload();}
 catch(e){notify('No fue posible iniciar un vuelo nuevo: '+e.message);}
};
const value=id=>{const s=$(id)?.value??'';return s!==''&&Number.isFinite(Number(s))?Number(s):null};
const fmt=v=>Number.isFinite(v)?v.toLocaleString('es-AR',{maximumFractionDigits:1}):'Pendiente';
const fmtBearing=v=>Number.isFinite(v)?
 ((Math.round((((v%360)+360)%360)*10)%3600)/10).toLocaleString('es-AR',{minimumIntegerDigits:3,minimumFractionDigits:1,maximumFractionDigits:1}):'Pendiente';
function fuelRemainder(available,trip,initial,contingency,reserve){
 const amounts=[trip,initial,contingency,reserve];
 const planned=amounts.every(Number.isFinite)?amounts.reduce((sum,liters)=>sum+liters,0):null;
 return {planned,remainder:planned!==null&&Number.isFinite(available)?available-planned:null};
}
function fuelChartPoints(legs,burn,initial){
 if(!Array.isArray(legs)||!legs.length||!Number.isFinite(burn)||burn<0||!Number.isFinite(initial)||initial<0)return null;
 const points=[{minutes:0,liters:initial}];let minutes=0;
 for(const leg of legs){
  if(!Number.isFinite(leg.distance_nm)||leg.distance_nm<0||!Number.isFinite(leg.gs_kt)||leg.gs_kt<=0)return null;
  minutes+=60*leg.distance_nm/leg.gs_kt;
  const liters=initial+minutes*burn/60;
  if(!Number.isFinite(minutes)||!Number.isFinite(liters))return null;
  points.push({minutes,liters});
 }
 return minutes>0?points:null;
}
function renderFuelChart(legs,burn,initial){
 const routePoints=fuelChartPoints(legs,burn,initial);
 const projection=!routePoints&&Number.isFinite(burn)&&burn>=0&&Number.isFinite(initial)&&initial>=0;
 const points=routePoints||(projection?[0,15,30,45,60].map(minutes=>({minutes,liters:initial+minutes*burn/60})):null);
 const svg=$('flight-fuel-chart-svg'),total=$('flight-fuel-chart-total'),duration=$('flight-fuel-chart-duration'),note=$('flight-fuel-chart-note');
 const left=54,right=663,top=22,bottom=188,width=right-left,height=bottom-top;
 const grid=[0,.25,.5,.75,1].map(t=>'<line x1="'+left+'" y1="'+(bottom-t*height)+'" x2="'+right+'" y2="'+(bottom-t*height)+'" stroke="#608095" stroke-opacity=".35" stroke-dasharray="4 6"/>').join('');
 if(!points){
  total.textContent='— L';duration.textContent='Tiempo pendiente';
  note.textContent='Ingresá el consumo horario para ver una proyección de 60 minutos. Al calcular la ruta, el gráfico se ajustará a sus tramos reales.';
  svg.setAttribute('aria-label','Gráfico de consumo pendiente: falta consumo horario o un tramo de ruta válido.');
  svg.innerHTML=grid+'<text x="345" y="104" text-anchor="middle" fill="#d3e7f4" font-size="17" font-weight="600">Tu curva de consumo aparecerá acá</text><text x="345" y="125" text-anchor="middle" fill="#a8c3d4" font-size="12">Al completar los datos del vuelo</text><text x="345" y="223" text-anchor="middle" fill="#b5cfdf" font-size="12">Tiempo transcurrido (min)</text><text x="16" y="107" text-anchor="middle" transform="rotate(-90 16 107)" fill="#b5cfdf" font-size="12">Litros</text>';
  return;
 }
 const final=points[points.length-1],peak=Math.max(1,final.liters),yMax=Math.ceil(peak*1.15/5)*5;
 const x=v=>left+v/final.minutes*width,y=v=>bottom-v/yMax*height;
 const plot=points.map((point,i)=>(i?'L':'M')+x(point.minutes).toFixed(1)+' '+y(point.liters).toFixed(1)).join(' ');
 const area=plot+' L'+right+' '+bottom+' L'+left+' '+bottom+' Z';
 const dots=points.map((point,i)=>'<circle cx="'+x(point.minutes).toFixed(1)+'" cy="'+y(point.liters).toFixed(1)+'" r="'+(i===points.length-1?5:3.3)+'" fill="#d5fbff" stroke="#1c829d" stroke-width="2"/>').join('');
 const yLabels=[0,.5,1].map(t=>'<text x="44" y="'+(bottom-t*height+4)+'" text-anchor="end" fill="#b5cfdf" font-size="12">'+fmt(t*yMax)+'</text>').join('');
 const xLabels=[0,.5,1].map(t=>'<text x="'+(left+t*width)+'" y="205" text-anchor="middle" fill="#b5cfdf" font-size="12">'+fmt(t*final.minutes)+'</text>').join('');
 svg.setAttribute('aria-label',(projection?'Proyección de referencia de una hora: ':'Consumo estimado acumulado de la ruta: ')+fmt(points[0].liters)+' litros al inicio y '+fmt(final.liters)+' litros después de '+fmt(final.minutes)+' minutos. No incluye alternativo.');
 svg.innerHTML='<defs><linearGradient id="flight-fuel-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#45c5e4" stop-opacity=".46"/><stop offset="100%" stop-color="#45c5e4" stop-opacity=".03"/></linearGradient></defs>'+grid+ yLabels+xLabels+
  '<path d="'+area+'" fill="url(#flight-fuel-area)"/><path d="'+plot+'" fill="none" stroke="#8be5f5" stroke-width="3.7" stroke-linecap="round" stroke-linejoin="round"/>'+dots+
  '<text x="345" y="229" text-anchor="middle" fill="#b5cfdf" font-size="12">Tiempo transcurrido (min)</text><text x="15" y="107" text-anchor="middle" transform="rotate(-90 15 107)" fill="#b5cfdf" font-size="12">Litros</text>';
 total.textContent=fmt(final.liters)+' L';duration.textContent=projection?'Referencia de 60 min':fmt(final.minutes)+' min de vuelo';
 note.textContent=projection?'Proyección orientativa de 60 minutos con '+fmt(burn)+' L/h e inicial '+fmt(initial)+' L. No representa todavía los tramos de la ruta.':
  'Curva acumulada: inicia con '+fmt(initial)+' L de rodaje y ascenso y suma '+fmt(burn)+' L/h durante los tramos. No incluye contingencia, reserva final ni alternativo.';
}
function calcFuel(){
 const list=rows(),burn=value('flight-fuel-burn'),available=value('flight-fuel-available');
 const ground=value('flight-fuel-start'),pct=value('flight-fuel-contingency'),reserve=value('flight-fuel-reserve');
 const known=list.length&&list.every(x=>Number.isFinite(x.distance_nm)&&Number.isFinite(x.gs_kt)&&x.gs_kt>0);
 const distance=known?list.reduce((v,x)=>v+x.distance_nm,0):null;
 const hours=known?list.reduce((v,x)=>v+x.distance_nm/x.gs_kt,0):null;
 const trip=hours!==null&&burn!==null?hours*burn:null;
 const extra=trip!==null&&pct!==null?trip*pct/100:null;
 const reserveFuel=burn!==null&&reserve!==null?burn*reserve/60:null;
 const {planned,remainder}=fuelRemainder(available,trip,ground,extra,reserveFuel);
 $('flight-fuel-details').textContent='Ruta: '+fmt(distance)+' NM · '+fmt(hours===null?null:hours*60)+' min'+
 '\nPartida prevista: '+(date()?.toISOString().slice(0,16).replace('T',' ')||'Pendiente')+' UTC'+
 '\nETA destino: '+(eta()?.slice(0,16).replace('T',' ')||'Pendiente')+' UTC'+
 '\nRuta: '+fmt(trip)+' L · Inicial: '+fmt(ground)+' L'+
 '\nContingencia: '+fmt(extra)+' L · Reserva final: '+fmt(reserveFuel)+' L'+
 '\nUtilizable: '+fmt(available)+' L · Previsto sin alternativo: '+fmt(planned)+' L'+
 '\nRemanente para alternativo (sin calcular consumo): '+fmt(remainder)+' L'+
 (remainder!==null&&remainder<0?'\nATENCIÓN: remanente negativo antes de considerar el alternativo.':'')+
 '\nEl consumo del tramo al alternativo no está calculado: verificá su viabilidad por separado.';
 renderFuelChart(list,burn,ground);
 const el=$('flight-wizard-leg-table');
 if(el){
  const tbl=document.createElement('table'),header=document.createElement('tr');
  const columns=[
   ['Pierna','Tramo de vuelo'],['CV','Curso verdadero'],['Alt. ft','Altitud prevista en pies'],
   ['Viento °T/kt','Dirección verdadera de procedencia y velocidad del viento'],
   ['CD','Corrección de deriva'],['RV','Rumbo verdadero'],['Var','Variación magnética'],
   ['DM','Derrota magnética'],['RM','Rumbo magnético a mantener: dirección hacia la que apunta la nariz'],
   ['NM','Distancia en millas náuticas'],['GS kt','Velocidad respecto del suelo'],
   ['ETE min','Tiempo estimado en ruta'],['ETA UTC','Hora estimada de llegada UTC'],['Cons. L','Consumo en litros']
  ];
  columns.forEach(([label,description],i)=>{const cell=document.createElement('th');cell.scope='col';cell.textContent=label;cell.title=description;if(i===8)cell.className='flight-magnetic-heading';header.append(cell);});
  const thead=document.createElement('thead');thead.append(header);tbl.append(thead);
  const tbody=document.createElement('tbody');let elapsed=0,knownEta=!!date();
  for(const r of list){
   const duration=Number.isFinite(r.distance_nm)&&Number.isFinite(r.gs_kt)&&r.gs_kt>0?r.distance_nm/r.gs_kt:null;
   if(duration===null)knownEta=false;else if(knownEta)elapsed+=duration;
   const at=knownEta?new Date(date().getTime()+elapsed*3600000).toISOString().slice(0,16).replace('T',' '):'Pendiente';
   const wind=Number.isFinite(r.wind_true_from_deg)&&Number.isFinite(r.wind_speed_kt)?fmt(r.wind_true_from_deg)+' / '+fmt(r.wind_speed_kt):'Pendiente';
   const vals=[r.name,fmtBearing(r.course_true_deg),fmt(r.altitude_ft),wind,fmt(r.wind_correction_deg),fmtBearing(r.heading_true_deg),fmt(r.variation_deg),fmtBearing(r.magnetic_track_deg),fmtBearing(r.heading_magnetic_deg),fmt(r.distance_nm),fmt(r.gs_kt),fmt(duration===null?null:duration*60),at,
    duration===null||burn===null?'Pendiente':fmt(duration*burn)];
   const row=document.createElement('tr');vals.forEach((v,i)=>{const td=document.createElement('td');td.textContent=String(v);if(i===8)td.className='flight-magnetic-heading';row.append(td);});tbody.append(row);
  }tbl.append(tbody);
  const legend=document.createElement('p');legend.className='flight-leg-legend';legend.textContent='CV: curso verdadero · CD: corrección de deriva · RV: rumbo verdadero · DM: derrota magnética · RM: rumbo magnético a mantener.';
  el.replaceChildren(tbl,legend);
 }
 refreshGate();
}
fuel.querySelectorAll('input').forEach(x=>x.addEventListener('input',calcFuel));
function adjustFuelValue(input,direction,increment){
 const current=Number(input.value)||0;
 const next=Math.max(0,Math.min(Number(input.max)||10000,Math.round((current+direction*increment)*10)/10));
 input.value=String(next);
 input.dispatchEvent(new Event('input',{bubbles:true}));
}
fuel.querySelectorAll('.flight-fuel-stepper button').forEach(button=>button.addEventListener('click',()=>{
 const input=$(button.dataset.fuelTarget);
 if(!input)return;
 const increment=input.id==='flight-fuel-reserve'?5:1;
 adjustFuelValue(input,Number(button.dataset.fuelDirection),increment);
}));
p.querySelector('#flight-analysis-form')?.addEventListener('input',()=>queueMicrotask(calcFuel));
// La planilla de piernas siempre toma el valor actual, aun tras volver atrás
// y corregir un curso °T que altera la derrota °M y la corrección por viento.
for(const type of ['input','change'])$('flight-legs-list')?.addEventListener(type,event=>{
 if(event.target?.matches?.('.flight-true-track'))queueMicrotask(calcFuel);
});
$('flight-nav-tas')?.addEventListener('input',()=>queueMicrotask(calcFuel));
new MutationObserver(()=>queueMicrotask(calcFuel)).observe($('flight-legs-list'),{childList:true,subtree:true});
new MutationObserver(()=>queueMicrotask(calcFuel)).observe($('flight-nav-wind-legs'),{childList:true,subtree:true});
let sheet=null;
$('flight-wizard-print').onclick=()=>{
 calcFuel();
 const out=['FLIGHT OPERATIONS · GENTE DE VUELO','PLANILLA ORIENTATIVA DE VUELO · UTC','',
 'Salida: '+$('flight-origin')?.value+' · Destino: '+$('flight-dest')?.value+' · Alternativo: '+$('flight-alternate')?.value,
 'Despegue: '+$('flight-time')?.value+' UTC · Reglas: '+$('flight-rules')?.value,'TAS: '+$('flight-nav-tas')?.value+' kt',''];
 let printElapsed=0,printEtaKnown=!!date();
 rows().forEach(r=>{
  const hours=Number.isFinite(r.distance_nm)&&Number.isFinite(r.gs_kt)&&r.gs_kt>0?r.distance_nm/r.gs_kt:null;
  if(hours===null)printEtaKnown=false;else if(printEtaKnown)printElapsed+=hours;
  const arrival=printEtaKnown?new Date(date().getTime()+printElapsed*3600000).toISOString().slice(0,16).replace('T',' ')+' UTC':'Pendiente';
  out.push('Pierna '+(r.index+1)+' '+r.name+' · CV '+fmtBearing(r.course_true_deg)+'°T · Alt. '+fmt(r.altitude_ft)+' ft · Viento '+r.wind_source,
   'CD '+fmt(r.wind_correction_deg)+'° · RV '+fmtBearing(r.heading_true_deg)+'°T · Var. '+fmt(r.variation_deg)+'° · DM '+fmtBearing(r.magnetic_track_deg)+'°M · RM '+fmtBearing(r.heading_magnetic_deg)+'°M',
   'NM '+fmt(r.distance_nm)+' ('+(r.distance_source==='pilot'?'piloto':'geometría')+') · GS '+fmt(r.gs_kt)+' kt · ETE '+fmt(hours===null?null:hours*60)+' min · ETA '+arrival+' · Cons. '+fmt(hours!==null&&value('flight-fuel-burn')!==null?hours*value('flight-fuel-burn'):null)+' L');
 });
 out.push('CV: curso verdadero · CD: corrección de deriva · RV: rumbo verdadero · DM: derrota magnética · RM: rumbo magnético a mantener.');
 out.push('','COMBUSTIBLE',$('flight-fuel-details')?.textContent||'Pendiente','','PRONAREA',gate().message,
 'Fuente PRONAREA: carga manual · fecha de referencia UTC '+(date()?.toISOString().slice(0,10)||'sin fecha de salida')+' · emisión y vigencia real sujetas a verificación SMN',
 'ATIS aportado: '+($('flight-atis')?.value?.trim()||'No aportado.'),
 'DATOS METEOROLÓGICOS RECUPERADOS',
 $('flight-auto-results')?.hidden?'Boletines automáticos pendientes de nueva consulta.':($('flight-auto-time')?.textContent||'Fecha de consulta no informada.'),
 'METAR/TAF/SIGMET: verificar fecha y vigencia en fuentes oficiales.','',
 'INFORME ESENCIAL DE IA',document.documentElement.dataset.flightRole==='member'?'Reservado a la administración. No se realizó ninguna consulta de IA.':($('flight-essential-result')?.hidden?'No generado.':$('flight-essential-analysis')?.textContent||'No generado.'),'',
 'Herramienta orientativa: el piloto debe verificar información meteorológica oficial, NOTAM, cartas, reglamentación y performance.');
 if(!sheet){sheet=document.createElement('section');sheet.id='flight-print-sheet';sheet.hidden=true;document.body.append(sheet);}
 sheet.textContent=out.join('\n');window.print();
};
const printAfterReport=document.createElement('button');
printAfterReport.type='button';printAfterReport.className='secondary';
printAfterReport.textContent='Imprimir o guardar planificación completa en PDF';
printAfterReport.addEventListener('click',()=>$('flight-wizard-print').click());
$('informe-esencial')?.append(printAfterReport);
display(0);refreshGate();void loadSaved();
})();
