/* Mesa de Vuelo: sugerencias geográficas no operacionales (ANAC datos abiertos, 09/2021).
   Verificar AIP/NOTAM actualizados, meteorología, pista, aeronave y combustible.
   Coordenadas [latitud, longitud] de aeródromos registrados. */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const trigger=el('flight-suggest-alternates'),root=el('flight-suggested-alternates');
const destination=el('flight-dest'),alternate=el('flight-alternate'),origin=el('flight-origin');
if(!trigger||!root||!destination||!alternate||!origin)return;
const GEO={
SAEZ:[-34.8222,-58.5358],SABE:[-34.5589,-58.4164],SADF:[-34.4545,-58.5909],
SADM:[-34.6792,-58.6436],SADP:[-34.6100,-58.6125],SAZM:[-37.9342,-57.5733],
SAZB:[-38.7275,-62.1533],SACO:[-31.3100,-64.2083],SAAR:[-32.9036,-60.7844],
SAAV:[-31.7108,-60.8114],SAAP:[-31.7947,-60.4803],SAOC:[-33.0922,-64.2693],
SAOU:[-33.2722,-66.3567],SAAC:[-31.2969,-57.9967],SAAG:[-33.0056,-58.6128],
SARM:[-30.2703,-57.6394],SAME:[-32.8317,-68.7928],SAMR:[-34.5878,-68.4036],
SANU:[-31.5714,-68.4183],SAMM:[-35.4953,-69.5731],SASA:[-24.8597,-65.4869],
SASJ:[-24.3925,-65.0978],SANT:[-26.8408,-65.1047],SANC:[-28.5931,-65.7511],
SANE:[-27.7656,-64.3100],SANL:[-29.3806,-66.7958],SARI:[-25.7372,-54.4735],
SARE:[-27.4500,-59.0561],SARC:[-27.4456,-58.7619],SARF:[-26.2128,-58.2281],
SARP:[-27.3857,-55.9705],SAZN:[-38.9489,-68.1558],SAZS:[-41.1511,-71.1578],
SAZY:[-40.0753,-71.1372],SAVC:[-45.7853,-67.4656],SAVT:[-43.2106,-65.2703],
SAVE:[-42.9038,-71.1355],SAWC:[-50.2800,-72.0531],SAWG:[-51.6088,-69.3122],
SAWE:[-53.7776,-67.7495],SAWH:[-54.8433,-68.2956],SAZR:[-36.5883,-64.2758],
SAZT:[-37.2344,-59.2286]
};
function code(select){
return (select.value==='OTHER'?el(select.id+'-other')?.value||'':select.value).trim().toUpperCase();
}
function name(id){
const option=Array.from(alternate.options).find(o=>o.value===id);
return option?option.textContent.replace(/\s*·\s*[A-Z]{4}$/,'').trim():id;
}
function straightKm(a,b){
const d=Math.PI/180,lat=(b[0]-a[0])*d,lon=(b[1]-a[1])*d;
const x=Math.sin(lat/2)**2+Math.cos(a[0]*d)*Math.cos(b[0]*d)*Math.sin(lon/2)**2;
return Math.round(12742*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x))));
}
function collapse(){
root.replaceChildren();root.hidden=true;trigger.setAttribute('aria-expanded','false');
}
function suggestions(){
root.replaceChildren();root.hidden=false;trigger.setAttribute('aria-expanded','true');
const to=code(destination),where=GEO[to];
const info=document.createElement('p');info.className='sub';
if(!where){
info.textContent=to?'No tenemos la ubicación de '+to+' en el catálogo. Seleccioná manualmente un alternativo y comprobá la AIP vigente.':'Primero seleccioná el aeródromo de destino del paso 1.';
root.append(info);return;
}
const exclude=new Set([to,code(origin)]);
const airports=Array.from(alternate.options).map(o=>o.value).filter(icao=>GEO[icao]&&!exclude.has(icao));
const nearby=airports.map(icao=>({icao,km:straightKm(where,GEO[icao])})).sort((a,b)=>a.km-b.km).slice(0,4);
info.textContent='Opciones cercanas a '+name(to)+' ('+to+'), por proximidad geográfica:';
root.append(info);
const grid=document.createElement('div');grid.className='flight-alternate-options';
for(const {icao,km} of nearby){
const card=document.createElement('div');card.className='flight-alternate-option';
const title=document.createElement('strong');title.textContent=name(icao)+' · '+icao;
const distance=document.createElement('span');distance.textContent='Aprox. '+km+' km en línea recta. No es distancia de navegación.';
const choose=document.createElement('button');choose.type='button';choose.className='secondary';choose.textContent='Elegir '+icao;
choose.addEventListener('click',()=>{
alternate.value=icao;alternate.dispatchEvent(new Event('change',{bubbles:true}));
collapse();
el('flight-fetch-status').textContent='Alternativo seleccionado: '+icao+'. Ahora podés consultar los boletines del paso 2.';
alternate.focus({preventScroll:true});
});
card.append(title,distance,choose);grid.append(card);
}
root.append(grid);
const note=document.createElement('p');note.className='sub';
note.textContent='Solo cercanía geográfica (ANAC, coordenadas 2021), no aptitud operacional. Verificá AIP/NOTAM vigentes, pista, servicios, meteorología, combustible y performance. Comprobá también las FIR hacia el alternativo.';
root.append(note);
const link=document.createElement('a');
link.href='https://servicios.transporte.gob.ar/gobierno_abierto/detalle.php?d=detalle&t=aeropuertos';
link.target='_blank';link.rel='noopener noreferrer';link.textContent='Fuente de ubicaciones: ANAC ↗';
root.append(link);
}
trigger.addEventListener('click',()=>{if(root.hidden)suggestions();else collapse()});
destination.addEventListener('change',()=>{if(!root.hidden)suggestions()});
el('flight-dest-other')?.addEventListener('input',()=>{if(!root.hidden)suggestions()});
})();