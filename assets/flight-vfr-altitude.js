/* Flight Operations · Verificación VFR de crucero según derrota magnética.
 * Derrota calculada como rumbo ortodrómico inicial de cada tramo geográfico,
 * convertida con WMM2025 (NOAA); entrada manual disponible.
 * No habilita vuelo ni determina AGL / obstáculos / espacio aéreo / ATC.
 * No usa IA ni tokens. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const legs=$('flight-legs-list'),form=$('flight-analysis-form'),rules=$('flight-rules');
const parent=document.querySelector('.flight-leg-editor'),geo=window.GDV_FLIGHT_FIR_GEODATA?.airports,geomag=window.GDV_WMM2025;
if(!legs||!form||!rules||!parent)return;
const panel=document.createElement('section');
panel.id='flight-vfr-guidance';panel.className='flight-vfr-guidance';
panel.setAttribute('aria-labelledby','flight-vfr-heading');
panel.innerHTML='<span class="card-kicker">VERIFICACIÓN DE NIVELES VFR · SIN TOKENS</span>'+
'<h3 id="flight-vfr-heading">Altitud VFR según el rumbo a destino</h3>'+
'<p class="sub">Para aeródromos y puntos con coordenadas conocidas, se estima automáticamente la <strong>derrota magnética de cada tramo</strong> (no el rumbo de brújula). Se calcula el rumbo geográfico y se ajusta por declinación magnética WMM2025. Podés corregirlo con el rumbo obtenido de tus cartas.</p>'+
'<label class="field flight-vfr-policy" for="flight-vfr-context">¿Cuándo corresponde aplicar la serie semicircular VFR?'+
'<select id="flight-vfr-context">'+
'<option value="standard">Crucero VFR a 3.000 pies AGL o más, sin excepción ATC (aplicar control)</option>'+
'<option value="below">Crucero por debajo de 3.000 pies AGL (la serie no es obligatoria)</option>'+
'<option value="controlled">Vuelo VFR controlado con niveles establecidos por ATC (verificar autorización)</option>'+
'<option value="climb">Ascenso, descenso u otro tramo no sujeto a nivel de crucero (verificar)</option>'+
'</select></label>'+
'<p class="flight-vfr-overview" id="flight-vfr-overview" role="status" aria-live="polite">Calculando las derrotas magnéticas…</p>'+
'<p class="sub"><strong>Importante:</strong> la opción inicial presupone crucero VFR en el supuesto donde rige la tabla; el sistema <strong>no conoce la altura AGL</strong> ni puede comprobar que corresponda. Si volás por debajo del umbral, en VFR controlado o durante ascenso/descenso, elegí el caso adecuado. Las sugerencias no comprueban terreno, obstáculos, techo, autorizaciones, espacio aéreo, ni aptitud de la aeronave. El piloto debe revisar AIP y cartas vigentes.</p>'+
'<p class="sub"><a href="https://ais.anac.gob.ar/" target="_blank" rel="noopener noreferrer">AIP Argentina · RAAC 91.159 y tabla de niveles ↗</a></p>';
parent.append(panel);
const overview=$('flight-vfr-overview'),context=$('flight-vfr-context');
const manual=new Map(),tracked=new WeakSet();
const fmt=n=>Math.round(n).toLocaleString('es-AR')+' ft';
const rad=Math.PI/180,deg=180/Math.PI,normalize=angle=>(angle%360+360)%360;
function code(id){
  const node=$(id);if(!node)return '';
  const val=node.value==='OTHER'?$(id+'-other')?.value:node.value;
  return String(val||'').trim().toUpperCase();
}
function resolve(value){
  const name=String(value||'').trim().toUpperCase();
  if(geo?.[name])return geo[name];
  const m=/^(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(name);
  if(m){const lat=Number(m[1]),lon=Number(m[2]);if(Math.abs(lat)<=90&&Math.abs(lon)<=180)return [lat,lon];}
  return null;
}
function positionNames(){
  return [code('flight-origin'),
    ...[...$('flight-waypoints').querySelectorAll('.flight-waypoint-row input')].map(i=>i.value.trim()),
    code('flight-dest')];
}
function initialBearing(a,b){
  const lat1=a[0]*rad,lat2=b[0]*rad,dLon=(b[1]-a[1])*rad;
  const y=Math.sin(dLon)*Math.cos(lat2);
  const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
  if(Math.hypot(x,y)<1e-11)return null;
  return normalize(Math.atan2(y,x)*deg);
}
function angularDistance(a,b){
  const dLat=(b[0]-a[0])*rad,dLon=(b[1]-a[1])*rad;
  const q=Math.sin(dLat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dLon/2)**2;
  return 2*Math.asin(Math.min(1,Math.sqrt(q)));
}
function intermediate(a,b,t,delta){
  if(delta<1e-9)return a;
  const sd=Math.sin(delta),k1=Math.sin((1-t)*delta)/sd,k2=Math.sin(t*delta)/sd;
  const p=a[0]*rad,q=b[0]*rad,u=a[1]*rad,v=b[1]*rad;
  const x=k1*Math.cos(p)*Math.cos(u)+k2*Math.cos(q)*Math.cos(v);
  const y=k1*Math.cos(p)*Math.sin(u)+k2*Math.cos(q)*Math.sin(v);
  const z=k1*Math.sin(p)+k2*Math.sin(q);
  return [Math.atan2(z,Math.hypot(x,y))*deg,Math.atan2(y,x)*deg];
}
function plannedDate(){
  const raw=$('flight-time')?.value.trim().replace(' ','T');
  const planned=raw?new Date(raw+'Z'):new Date();
  return Number.isFinite(planned.valueOf())?planned:new Date();
}
function nearLimit(track){
  const distance=Math.min(Math.abs(track-180),track,360-track);
  return distance<5;
}
function estimatedTrack(a,b,date){
  if(!a||!b||!geomag?.magneticVariation)return null;
  const delta=angularDistance(a,b);
  if(delta<0.0001)return null;
  const points=[0,0.5,0.995],values=[];
  for(const t of points){
    const spot=intermediate(a,b,t,delta);
    const advanced=intermediate(a,b,Math.min(t+0.004,1),delta);
    const bearing=initialBearing(spot,advanced);
    const variation=geomag.magneticVariation(spot[0],spot[1],date);
    if(bearing===null||variation===null||!Number.isFinite(variation))return null;
    values.push(normalize(bearing-variation));
  }
  // Ante cambios de hemisferio semicircular o proximidad al límite,
  // NO bloquear a partir de un cálculo cartográfico aproximado.
  const hemi=values.map(n=>n<180);
  const ambiguous=hemi.some(x=>x!==hemi[0])||values.some(nearLimit);
  return {track:values[0],variation:geomag.magneticVariation(a[0],a[1],date),ambiguous,distanceKm:delta*6371};
}
function evaluate(trackRaw,altRaw,policy,uncertain){
  const t=Number(trackRaw);
  if(trackRaw===''||!Number.isFinite(t)||t<0||t>=360)
    return {state:'unknown',message:'Derrota magnética no disponible: ingresala desde la carta de navegación.',suggestions:[],blocked:false};
  if(altRaw===''||!Number.isFinite(Number(altRaw))||Number(altRaw)<500||Number(altRaw)>45000)
    return {state:'unknown',message:'Ingresá una altitud válida en pies AMSL.',suggestions:[],blocked:false};
  const altitude=Number(altRaw);
  if(policy!=='standard')
    return {state:'exempt',message:'No se bloquea por la regla semicircular VFR: seleccionaste '+(
      policy==='below'?'crucero por debajo de 3.000 ft AGL':
      policy==='controlled'?'VFR controlado por ATC':'tramo de ascenso/descenso')+
      '. Comprobá que esa situación sea real.',suggestions:[],blocked:false};
  if(altitude<3000)
    return {state:'unknown',message:'Altitud inferior a 3.000 ft AMSL: no se puede aplicar automáticamente el criterio de 3.000 ft AGL. Verificá altura sobre el terreno.',suggestions:[],blocked:false};
  const east=t<180,base=east?3500:4500,series=east?'3.500, 5.500, 7.500…':'4.500, 6.500, 8.500…';
  const prefix='Derrota magnética '+t.toFixed(1).padStart(5,'0')+'°: serie '+series+' pies. ';
  const matches=altitude>=base && Math.abs((altitude-base)%2000)<0.0001;
  const uncertainty=Boolean(uncertain)||nearLimit(t);
  if(matches)
    return {state:'match',message:prefix+'Tu altitud coincide con la serie. No se han verificado AGL, terreno ni permisos ATC.',suggestions:[],blocked:false};
  if(uncertainty)
    return {state:'uncertain',message:prefix+'El rumbo estimado está cerca de 000°/180° o cambia de hemisferio durante la pierna. Verificá la derrota en cartas: no se bloquea con un dato incierto.',suggestions:[],blocked:false};
  const choices=[];for(let ft=base;ft<=17500;ft+=2000)choices.push(ft);
  choices.sort((x,y)=>Math.abs(x-altitude)-Math.abs(y-altitude)||x-y);
  if(altitude>17500)return {state:'uncertain',message:prefix+'Nivel alto fuera del alcance del verificador simplificado. Confirmá los niveles autorizados en AIP/ATC.',suggestions:[],blocked:false};
  return {state:'different',message:prefix+'La altitud '+fmt(altitude)+' NO corresponde a esa derrota en crucero VFR de 3.000 ft AGL o más. Corregila o seleccioná una excepción real antes de continuar.',suggestions:choices.slice(0,2).sort((x,y)=>x-y),blocked:true};
}
function updateOverview(){
  const rows=[...legs.querySelectorAll('.flight-leg-row')];
  if(rules.value!=='VFR'){
    overview.dataset.vfrState='unknown';overview.textContent='Plan IFR: este control de crucero VFR no se aplica. Verificá los niveles IFR y ATC.';return;
  }
  const blocked=rows.filter(x=>x.querySelector('.flight-vfr-result')?.dataset.vfrBlocked==='true').length;
  const matched=rows.filter(x=>x.querySelector('.flight-vfr-result')?.dataset.vfrState==='match').length;
  const uncertain=rows.filter(x=>x.querySelector('.flight-vfr-result')?.dataset.vfrState==='unknown'||x.querySelector('.flight-vfr-result')?.dataset.vfrState==='uncertain').length;
  overview.dataset.vfrState=blocked?'different':matched?'match':'unknown';
  overview.textContent=blocked
    ?'ALTITUD VFR NO COMPATIBLE: corregí '+blocked+' pierna(s) para continuar. Consultá el motivo debajo de cada tramo.'
    :uncertain?'Sin bloqueo automático: faltan o son inciertas las derrotas de '+uncertain+' pierna(s). Verificá tu carta antes de volar.'
    :matched===rows.length?'Todas las piernas coinciden con su serie VFR en el supuesto seleccionado. No se verificó altura AGL, seguridad ni autorizaciones.':
    'Control VFR según la condición de vuelo que declaraste. Recordá verificar las alturas sobre el terreno.';
}
function paint(row){
  const track=row.querySelector('.flight-vfr-track'),alt=row.querySelector('.field input[type="number"]'),out=row.querySelector('.flight-vfr-result');
  if(!track||!alt||!out)return;
  const assumed=track.dataset.estimated==='true';
  const uncertain=assumed&&track.dataset.uncertain==='true';
  const result=rules.value==='VFR'
    ?evaluate(track.value,alt.value,context.value,uncertain)
    :{state:'exempt',message:'Plan IFR: consultar niveles IFR y autorización ATC.',blocked:false,suggestions:[]};
  out.dataset.vfrState=result.state;
  out.dataset.vfrBlocked=String(result.blocked);
  alt.setCustomValidity(result.blocked?result.message:'');
  alt.toggleAttribute('aria-invalid',result.blocked);
  out.replaceChildren();
  const message=document.createElement('span');message.textContent=result.message;out.append(message);
  if(result.suggestions.length){
    const options=document.createElement('div');options.className='flight-vfr-options';
    result.suggestions.forEach(ft=>{
      const btn=document.createElement('button');btn.type='button';btn.className='secondary';
      btn.textContent='Usar '+fmt(ft);
      btn.setAttribute('aria-label','Corregir esta pierna a '+fmt(ft)+' sujeto a verificación aeronáutica');
      btn.addEventListener('click',()=>{
        alt.value=String(ft);
        alt.dispatchEvent(new Event('input',{bubbles:true}));
        if(legs.querySelectorAll('.flight-leg-row').length===1){
          const general=$('flight-alt');
          if(general){general.value=String(ft);general.dispatchEvent(new Event('input',{bubbles:true}));}
        }
        paint(row);updateOverview();alt.focus({preventScroll:true});
      });
      options.append(btn);
    });
    out.append(options);
  }
}
function refresh(){
  const rows=[...legs.querySelectorAll('.flight-leg-row')],names=positionNames(),date=plannedDate();
  rows.forEach((row,index)=>{
    const route=row.querySelector('.flight-leg-route');
    const alt=row.querySelector('.field input[type="number"]');
    if(!route||!alt)return;
    const key=String(index)+'|'+(names[index]||'')+'|'+(names[index+1]||'');
    let label=row.querySelector('.flight-vfr-track-label');
    const newlyCreated=!label;
    if(!label){
      label=document.createElement('label');label.className='field flight-vfr-track-label';
      const input=document.createElement('input');input.type='number';input.step='0.1';input.min='0';input.max='359.9';
      input.className='flight-vfr-track';input.inputMode='decimal';input.placeholder='Auto o manual';
      input.setAttribute('aria-label','Derrota magnética de pierna '+(index+1)+' en grados');
      label.append('Derrota magnética (°)',input);
      const result=document.createElement('div');result.className='flight-vfr-result';
      result.dataset.vfrState='unknown';row.append(label,result);
      input.addEventListener('input',()=>{
        input.dataset.estimated='false';manual.set(key,input.value);
        paint(row);updateOverview();
      });
      if(!tracked.has(alt)){
        tracked.add(alt);alt.addEventListener('input',()=>{paint(row);updateOverview();});
      }
    }
    const prevKey=label.dataset.routeKey;
    const dateKey=date.toISOString().slice(0,10);
    const signature=key+'|'+dateKey;
    if(newlyCreated||prevKey!==signature){
      label.dataset.routeKey=signature;
      const input=label.querySelector('.flight-vfr-track');
      const computed=estimatedTrack(resolve(names[index]),resolve(names[index+1]),date);
      if(manual.has(key)){
        input.value=manual.get(key)||'';
        input.dataset.estimated='false';
        input.dataset.uncertain='false';
        label.firstChild.textContent='Derrota magnética (°) · manual';
      }else if(computed){
        input.value=computed.track.toFixed(1);
        input.dataset.estimated='true';
        input.dataset.uncertain=String(computed.ambiguous);
        label.firstChild.textContent='Derrota magnética (°) · estimada';
      }else{
        input.value='';
        input.dataset.estimated='false';input.dataset.uncertain='true';
        label.firstChild.textContent='Derrota magnética (°) · ingresá el valor';
      }
      if(newlyCreated)row.append(label);
      paint(row);
    }
  });
  updateOverview();
}
function checkBlocked(event){
  if(rules.value!=='VFR'||context.value!=='standard')return false;
  const invalid=[...legs.querySelectorAll('.field input[type="number"]')].find(input=>input.validity.customError);
  if(!invalid)return false;
  if(event){event.preventDefault();event.stopImmediatePropagation();}
  $('ops-plan').open=true;
  overview.textContent='No podés continuar: '+invalid.validationMessage;
  overview.dataset.vfrState='different';
  invalid.focus({preventScroll:true});
  invalid.scrollIntoView({behavior:'smooth',block:'center'});
  return true;
}
new MutationObserver(refresh).observe(legs,{childList:true,subtree:true,characterData:true});
for(const id of ['flight-origin','flight-dest','flight-origin-other','flight-dest-other','flight-time']){
  const node=$(id);
  if(node){node.addEventListener('input',refresh);node.addEventListener('change',refresh);}
}
$('flight-waypoints')?.addEventListener('input',refresh);
$('flight-waypoints')?.addEventListener('change',refresh);
new MutationObserver(refresh).observe($('flight-waypoints'),{childList:true});
rules.addEventListener('change',()=>{for(const row of legs.querySelectorAll('.flight-leg-row'))paint(row);updateOverview();});
context.addEventListener('change',()=>{for(const row of legs.querySelectorAll('.flight-leg-row'))paint(row);updateOverview();});
form.addEventListener('submit',checkBlocked,true);
for(const selector of ['[data-ops-target="#consultar"]']){
  document.querySelectorAll(selector).forEach(btn=>btn.addEventListener('click',checkBlocked,true));
}
refresh();
})();