/* AeroLocator · capa independiente de radioayudas argentinas.
 * OurAirports es comunitario. Coincidencia documental ANAC no equivale
 * a vigencia, operatividad ni autorización para navegación.
 */
(function(root){
'use strict';
const API='/api/aerolocator-navaids';
const SNAPSHOT='../assets/aerolocator-navaids-ar.geojson';
const TYPES=new Set(['NDB','NDB-DME','VOR','VOR-DME','DME','VORTAC','TACAN']);
function typeGroup(type){
 if(type==='NDB'||type==='NDB-DME')return 'ndb';
 if(type==='VOR'||type==='VOR-DME'||type==='VORTAC')return 'vor';
 return 'dme';
}
function allowed(item,selected){
 const t=item.type;
 if(t==='NDB-DME')return selected.ndb||selected.dme;
 if(t==='VOR-DME'||t==='VORTAC')return selected.vor||selected.dme;
 return Boolean(selected[typeGroup(t)]);
}
function iconSvg(type){
 const font='font-family:system-ui,sans-serif;font-weight:900;font-size:12px;text-anchor:middle';
 let figure,label;
 if(type==='NDB'||type==='NDB-DME'){
  figure='<circle cx="16" cy="16" r="13" fill="#bc812c" stroke="#f9edcf" stroke-width="2"/>';
  label=type==='NDB'?'N':'ND';
 }else if(type==='DME'||type==='TACAN'){
  figure='<rect x="3" y="3" width="26" height="26" rx="5" fill="#8a6cab" stroke="#f3e9ff" stroke-width="2"/>';
  label='D';
 }else{
  figure='<polygon points="16,2 30,16 16,30 2,16" fill="#2169a6" stroke="#ecf7ff" stroke-width="2"/>';
  label=type==='VOR'?'V':'VD';
 }
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">'+
  figure+'<text x="16" y="20" style="'+font+'" fill="#fff">'+label+'</text></svg>';
}
function line(parent,label,value){
 const row=document.createElement('p');
 const strong=document.createElement('strong');
 strong.textContent=label+': ';
 row.append(strong,document.createTextNode(String(value)));
 parent.append(row);
}
function extLink(parent,title,url){
 const a=document.createElement('a');
 a.textContent=title;a.href=url;a.target='_blank';a.rel='noopener noreferrer';
 parent.append(a);
}
async function readCatalog(){
 try{
  const response=await fetch(API,{headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('API no disponible');
  const data=await response.json();
  if(!data?.ok||!Array.isArray(data.records)||!data.records.length)throw Error('Respuesta de API inválida');
  return data;
 }catch(_){
  const response=await fetch(SNAPSHOT,{cache:'no-store'});
  if(!response.ok)throw Error('La API y el catálogo de respaldo no están disponibles');
  const geo=await response.json();
  if(geo?.type!=='FeatureCollection'||!Array.isArray(geo.features)||!geo.features.length)
   throw Error('Respaldo GeoJSON inválido');
  return {ok:true,stale:true,source:'OurAirports · snapshot local',records:geo.features.map(f=>{
   const p=f.properties||{},coordinates=f.geometry?.coordinates||[];
   return {id:p.source_id,ident:p.ident,name:p.name,type:p.navaid_type,
    lat:Number(coordinates[1]),lon:Number(coordinates[0]),frequency:p.frequency,
    unit:p.frequency_units,dmeChannel:p.dme_channel||'',
    airport:p.associated_airport||'',source:'OurAirports',
    operationalStatus:'unknown',verification:'pending'};
  })};
 }
}
function boot({map,L,panel}){
 if(!map||!L||!panel)throw Error('No se pudo iniciar la capa de radioayudas');
 const aip=root.GDV_NAVAIDS_AIP||null;
 const group=L.layerGroup();
 const flags={ndb:true,vor:true,dme:true};
 const status=panel.querySelector('#navaid-status');
 let active=false,loaded=false,loading=null,entries=[],sourceRecords=0;
 function popup(item,comparison){
  const box=document.createElement('section');
  box.className='navaid-popup';
  const heading=document.createElement('h3');
  heading.textContent=(item.ident||'S/I')+' · '+item.type;box.append(heading);
  line(box,'Nombre',item.name||'Sin dato');
  const official=item.source==='ANAC_AIP_2026';
  line(box,'Fuente',official?'ANAC · suplemento ENR 4.1 (19/02/2026)':'OurAirports · catálogo comunitario');
  line(box,'Posición referencial',item.lat.toFixed(5)+', '+item.lon.toFixed(5));
  line(box,'Frecuencia',item.frequency==null?'No informada':item.frequency+' '+(item.unit||''));
  if(item.dmeChannel)line(box,'Canal DME',item.dmeChannel);
  if(item.airport)line(box,'Aeródromo relacionado',item.airport);
  const note=document.createElement('p');
  note.className='navaid-popup-warning';
  if(official)note.textContent='Referencia documental ANAC de febrero de 2026; NO confirma servicio actual.';
  else if(comparison.status==='document-match')note.textContent='Identificador, tipo y frecuencia coinciden con referencia ANAC 2026. NO confirma operatividad.';
  else if(comparison.status==='frequency-difference')note.textContent='ATENCIÓN: frecuencia distinta de la referencia ANAC 2026 ('+comparison.referenceFrequency+' '+(item.unit||'')+').';
  else if(comparison.status==='frequency-missing')note.textContent='OurAirports no declara frecuencia; existe una referencia ANAC de 2026 ('+comparison.referenceFrequency+' '+(item.unit||'')+').';
  else note.textContent='Dato sin cotejo documental individual con ANAC.';
  box.append(note);
  line(box,'Estado operativo','Desconocido. No utilizar como fuente de navegación.');
  const links=document.createElement('div');
  links.className='navaid-popup-links';
  extLink(links,'Consultar AIP',aip?.aipUrl||'https://ais.anac.gob.ar/aip');
  extLink(links,'Consultar NOTAM',aip?.notamUrl||'https://ais.anac.gob.ar/notam');
  if(comparison.status!=='not-compared'&&aip?.sourceUrl)
   extLink(links,'Referencia ENR 4.1',aip.sourceUrl);
  box.append(links);
  return box;
 }
 function paint(){
  group.clearLayers();
  let visible=0;
  for(const {item,marker} of entries){
   if(allowed(item,flags)){group.addLayer(marker);visible++}
  }
  return visible;
 }
 function statusUpdate(stale=false){
  const count=paint();
  status.textContent=count+' visibles · '+sourceRecords+
   ' OurAirports'+(entries.length>sourceRecords?' + '+(entries.length-sourceRecords)+' ANAC documental':'')+
   (stale?' · respaldo local':'')+'. Estado operativo sin confirmar.';
 }
 async function show(){
  active=true;panel.hidden=false;
  if(!map.hasLayer(group))group.addTo(map);
  if(loaded){statusUpdate();return}
  if(loading)return loading;
  status.textContent='Cargando catálogo argentino de radioayudas…';
  loading=(async()=>{
   try{
    const data=await readCatalog();
    const records=data.records.filter(x=>TYPES.has(x.type)&&Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&
     x.lat>=-90&&x.lat<=90&&x.lon>=-180&&x.lon<=180);
    sourceRecords=records.length;
    const documentary=aip?.documentaryExtras(records)||[];
    entries=[];
    for(const item of [...records,...documentary]){
     const comparison=aip?.compare(item)||{status:'not-compared'};
     const marker=L.marker([item.lat,item.lon],{
      icon:L.divIcon({className:'navaid-icon',html:iconSvg(item.type),
       iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-13]}),
      keyboard:true
     });
     const tip=document.createElement('span');
     tip.textContent=(item.ident||'?')+' · '+item.type+' · referencia';
     marker.bindTooltip(tip,{sticky:true});
     marker.bindPopup(()=>popup(item,comparison),{maxWidth:330});
     entries.push({item,marker});
    }
    loaded=true;
    if(active)statusUpdate(Boolean(data.stale));
   }catch(_){
    if(active)status.textContent='No se pudo cargar la fuente. Volvé a seleccionar la capa para reintentar.';
   }finally{loading=null}
  })();
  return loading;
 }
 function hide(){
  active=false;panel.hidden=true;map.removeLayer(group);
 }
 panel.querySelectorAll('input[data-navaid-kind]').forEach(control=>{
  control.addEventListener('change',()=>{
   flags[control.dataset.navaidKind]=control.checked;
   if(loaded)statusUpdate();
  });
 });
 L.DomEvent.disableClickPropagation(panel);
 L.DomEvent.disableScrollPropagation(panel);
 return Object.freeze({show,hide,getState:()=>({active,loaded,count:sourceRecords})});
}
root.GDV_NAVAIDS_LAYER=Object.freeze({boot,typeGroup,allowed,iconSvg});
})(typeof window!=='undefined'?window:globalThis);
