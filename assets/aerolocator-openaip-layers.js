/* AeroLocator · incorporación progresiva OpenAIP, sin tocar ANAC ni pistas revisadas.
 * Fase beta para cuentas administradoras. La clave solo reside en Supabase.
 */
(function(root){
'use strict';
const FUNCTION_NAME='aerolocator-openaip-catalog';
const TYPES=new Set(['navaids','airspaces','reporting-points']);
const LIMIT_PAGES=8;
const TITLES={'airspaces':'Espacios aéreos','reporting-points':'Puntos de notificación VFR'};
const AIRSPACE={1:'Restringida (R)',2:'Peligrosa (D)',3:'Prohibida (P)',4:'CTR',
 5:'TMZ',6:'RMZ',7:'TMA',8:'TRA',13:'ATZ',14:'MATZ',15:'Aerovía',21:'Sector de planeadores',26:'CTA'};
const CLASS_LABEL=['A','B','C','D','E','F','G','?','Sin clasificar'];
function limitLabel(lim){
 if(!lim||lim.value==null)return 'No informado';
 const unit=lim.unit===0?'m':lim.unit===1?'ft':('unidad '+String(lim.unit??'?'));
 const datum=lim.referenceDatum==null?'':' (referencia '+String(lim.referenceDatum)+')';
 return lim.value+' '+unit+datum;
}
function haversineNm(latA,lonA,latB,lonB){
 const toRad=Math.PI/180;
 const a1=(latB-latA)*toRad/2,b1=(lonB-lonA)*toRad/2;
 const q=Math.sin(a1)**2+Math.cos(latA*toRad)*Math.cos(latB*toRad)*Math.sin(b1)**2;
 return 3440.065*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)));
}
function navaidType(type){
 return ['DME','TACAN','NDB','VOR','VOR-DME','VORTAC','VOR','VOR-DME','VORTAC'][type]||null;
}
function compatibleType(a,b){
 const group=t=>t==='NDB'||t==='NDB-DME'?'ndb':/VOR|TAC|DME/.test(t||'')?'vor-dme':'other';
 return group(a)===group(b)&&group(a)!=='other';
}
function matchNavaid(records,newRecord){
 const ident=(newRecord.ident||'').trim().toUpperCase(),type=navaidType(newRecord.type);
 if(!ident||!type||!Array.isArray(newRecord.coordinates))return -1;
 const [lon,lat]=newRecord.coordinates;
 if(!Number.isFinite(lon)||!Number.isFinite(lat))return -1;
 let nearest=-1,best=7; // <= 7 NM reduces accidental merges of reused identifiers.
 for(let i=0;i<records.length;i++){
  const it=records[i];
  if((it.ident||'').trim().toUpperCase()!==ident||!compatibleType(it.type,type))continue;
  const d=haversineNm(Number(it.lat),Number(it.lon),lat,lon);
  if(Number.isFinite(d)&&d<best){best=d;nearest=i}
 }
 return nearest;
}
function addText(parent,label,value){
 const p=document.createElement('p');
 const b=document.createElement('strong');b.textContent=label+': ';
 p.append(b,document.createTextNode(String(value)));
 parent.append(p);
}
function addLink(parent,label,url){
 const link=document.createElement('a');
 link.href=url;link.textContent=label;link.rel='noopener noreferrer';link.target='_blank';
 parent.append(link);
}
function makePopup(record){
 const box=document.createElement('section');box.className='openaip-popup';
 const title=document.createElement('h3');title.textContent=record.name||'Sin nombre';box.append(title);
 if(record.kind==='airspaces'){
  addText(box,'Categoría',AIRSPACE[record.type]||'Tipo '+record.type);
  addText(box,'Clase ICAO',CLASS_LABEL[record.icaoClass]||'No informada');
  addText(box,'Límite inferior',limitLabel(record.lowerLimit));
  addText(box,'Límite superior',limitLabel(record.upperLimit));
  if(record.byNotam)addText(box,'Activación','Sujeta a NOTAM; verificar');
  if(record.onRequest)addText(box,'Activación','A requerimiento; verificar');
 }else{
  addText(box,'Tipo',record.compulsory?'Punto de notificación obligatorio':'Punto de notificación (condición sin confirmar)');
  if(Array.isArray(record.coordinates))addText(box,'Coordenadas',
   record.coordinates[1].toFixed(5)+', '+record.coordinates[0].toFixed(5));
 }
 if(record.remarks)addText(box,'Observaciones',record.remarks);
 const warning=document.createElement('p');warning.className='openaip-warning';
 warning.textContent='OpenAIP: referencia comunitaria. No sustituye AIP/NOTAM ni garantiza vigencia u operatividad.';
 box.append(warning);
 const links=document.createElement('div');links.className='openaip-links';
 addLink(links,'OpenAIP','https://www.openaip.net');
 addLink(links,'AIP Argentina','https://ais.anac.gob.ar/aip');
 addLink(links,'NOTAM','https://ais.anac.gob.ar/notam');box.append(links);
 return box;
}

/* Contraste por función del espacio: colores de esta interfaz, NO simbología oficial AIP. */
const AIRSPACE_PALETTE=Object.freeze({
 CTR:{label:'CTR',color:'#2F91E3',dashArray:null},
 TMA:{label:'TMA',color:'#A88AE8',dashArray:null},
 CTA:{label:'CTA',color:'#29B7AC',dashArray:null},
 ATZ:{label:'ATZ',color:'#68C880',dashArray:null},
 R:{label:'Restringida (R)',color:'#F06957',dashArray:'8 5'},
 D:{label:'Peligrosa (D)',color:'#F0B64B',dashArray:'3 5'},
 P:{label:'Prohibida (P)',color:'#EC4358',dashArray:null},
 OTHER:{label:'Otros espacios',color:'#B7C7D7',dashArray:'5 4'}
});
const AIRSPACE_ORDER=Object.keys(AIRSPACE_PALETTE);
function airspaceCategory(type){
 switch(type){
  case 4:return 'CTR';
  case 7:return 'TMA';
  case 26:return 'CTA';
  case 13:return 'ATZ';
  case 1:return 'R';
  case 2:return 'D';
  case 3:return 'P';
  default:return 'OTHER';
 }
}
function sectorTitle(record){
 const category=airspaceCategory(record.type);
 const name=(record.name||'Sector sin nombre').trim();
 if(category==='OTHER'||new RegExp('\\b'+category+'\\b','i').test(name))return name;
 return category+' · '+name;
}
function sectorStyle(category,selected=false,dimmed=false){
 const cfg=AIRSPACE_PALETTE[category]||AIRSPACE_PALETTE.OTHER;
 return {color:cfg.color,fillColor:cfg.color,dashArray:cfg.dashArray,
  weight:selected?4:(category==='P'?2.7:2.1),
  opacity:dimmed?0.29:1,fillOpacity:dimmed?0.035:(selected?0.31:0.13)};
}

function boot({map,L,client,panel}){
 if(!map||!L||!client||!panel)throw Error('OpenAIP: inicialización incompleta');
 const groups={airspaces:L.layerGroup(), 'reporting-points':L.layerGroup()};
 const cache=new Map();
 let active=null;
 const status=panel.querySelector('#openaip-layer-status');
 async function fetchPage(kind,page){
  const {data:{session},error:sessionError}=await client.auth.getSession();
  if(sessionError||!session?.access_token)throw Error('Se requiere iniciar sesión como administrador de Gente de Vuelo.');
  const query=new URLSearchParams({kind,page:String(page)});
  // Only the Supabase public key and user JWT go to the Supabase project.
  const res=await fetch(root.GDV_CONFIG.url+'/functions/v1/'+FUNCTION_NAME+'?'+query,{
   headers:{'authorization':'Bearer '+session.access_token,'apikey':root.GDV_CONFIG.key,'Accept':'application/json'}
  });
  const payload=await res.json().catch(()=>null);
  if(!res.ok||!payload?.ok||payload.kind!==kind||payload.page!==page){
   const reason=payload?.error;
   if(res.status===401||res.status===403)throw Error('Esta capa requiere una sesión de administrador.');
   if(reason==='openaip_provider_error')throw Error('OpenAIP devolvió HTTP '+payload.providerStatus+'.');
   throw Error('No fue posible consultar OpenAIP ('+res.status+').');
  }
  return payload;
 }
 async function readKind(kind){
  if(!TYPES.has(kind))throw Error('Tipo de capa desconocido');
  if(cache.has(kind))return cache.get(kind);
  const all=[];
  let partial=false,pages=0,total=null;
  for(let page=1;page<=LIMIT_PAGES;page++){
   const payload=await fetchPage(kind,page);
   pages++;all.push(...(payload.records||[]));
   total=payload.totalCount;
   if(!payload.totalPages || page>=payload.totalPages ||
      (payload.records||[]).length<payload.pageLimit && total==null)break;
   if(page===LIMIT_PAGES)partial=true;
  }
  // No source overwrite: retain external id and provenance.
  const data={records:all,partial,pages,total};
  cache.set(kind,data);
  return data;
 }

 const filterPanel=document.createElement('div');
 filterPanel.id='openaip-airspace-filters';
 filterPanel.hidden=true;
 const filterHeader=document.createElement('div');
 filterHeader.className='openaip-filter-header';
 const filterTitle=document.createElement('strong');
 filterTitle.textContent='Mostrar espacios por tipo';
 const filterActions=document.createElement('div');
 filterActions.className='openaip-filter-actions';
 const allButton=document.createElement('button');
 allButton.type='button';allButton.textContent='Todos';
 const noneButton=document.createElement('button');
 noneButton.type='button';noneButton.textContent='Ninguno';
 filterActions.append(allButton,noneButton);
 filterHeader.append(filterTitle,filterActions);
 const filterList=document.createElement('div');
 filterList.className='openaip-filter-list';
 filterList.setAttribute('role','group');
 filterList.setAttribute('aria-label','Filtrar espacios aéreos según su función');
 const enabledCategories=new Set(AIRSPACE_ORDER);
 const categoryCheckboxes=new Map(),categoryCounts=new Map();
 for(const category of AIRSPACE_ORDER){
  const cfg=AIRSPACE_PALETTE[category],label=document.createElement('label');
  label.className='openaip-filter-choice';
  const checkbox=document.createElement('input');
  checkbox.type='checkbox';checkbox.checked=true;
  checkbox.setAttribute('aria-label',cfg.label);
  const swatch=document.createElement('span');
  swatch.className='openaip-filter-swatch';
  swatch.style.borderColor=cfg.color;
  swatch.style.backgroundColor=cfg.color+'33';
  if(cfg.dashArray)swatch.style.borderStyle='dashed';
  const name=document.createElement('span');
  name.textContent=cfg.label;
  const count=document.createElement('small');
  count.className='openaip-filter-count';
  count.textContent='0';
  label.append(checkbox,swatch,name,count);
  checkbox.addEventListener('change',()=>{
   if(checkbox.checked)enabledCategories.add(category);
   else enabledCategories.delete(category);
   refreshVisibility();
  });
  categoryCheckboxes.set(category,checkbox);
  categoryCounts.set(category,count);
  filterList.append(label);
 }
 const selectedNote=document.createElement('p');
 selectedNote.id='openaip-selection-status';
 selectedNote.textContent='Tocá un sector para resaltarlo y consultar sus límites.';
 const clearSelectionButton=document.createElement('button');
 clearSelectionButton.type='button';
 clearSelectionButton.id='openaip-clear-selection';
 clearSelectionButton.textContent='Quitar selección';
 clearSelectionButton.hidden=true;
 const zoomNote=document.createElement('p');
 zoomNote.className='openaip-zoom-note';
 zoomNote.textContent='Acercá el mapa para ver etiquetas. Los colores son de esta interfaz y no reemplazan las cartas oficiales.';
 filterPanel.append(filterHeader,filterList,selectedNote,clearSelectionButton,zoomNote);
 status.after(filterPanel);
 let descriptors=[],visibleDescriptors=[],selected=null,loadedData=null;
 const nameLabels=L.layerGroup();

 function refreshStyles(){
  for(const item of visibleDescriptors){
   item.layer.setStyle(sectorStyle(item.category,item===selected,selected!==null&&item!==selected));
  }
 }
 function updateSelectionNote(){
  selectedNote.textContent=selected
   ?'Seleccionado: '+sectorTitle(selected.record)+'. Consultá los límites en la ficha.'
   :'Tocá un sector para resaltarlo y consultar sus límites.';
  clearSelectionButton.hidden=!selected;
 }
 function renderLabels(){
  nameLabels.clearLayers();
  if(active!=='airspaces'||!map.hasLayer(groups.airspaces))return;
  const zoom=map.getZoom(),candidates=zoom>=9
   ?visibleDescriptors
   :selected?[selected]:[];
  const priority={CTR:0,ATZ:1,TMA:2,CTA:3,R:4,D:5,P:6,OTHER:7};
  const ordered=candidates.slice().sort((a,b)=>
   (a===selected?-100:priority[a.category])-(b===selected?-100:priority[b.category]));
  const occupied=[],bounds=map.getBounds();
  for(const item of ordered){
   if(occupied.length>=26)break;
   if(zoom<9&&item!==selected)continue;
   if(item.category==='OTHER'&&item!==selected)continue;
   const center=item.layer.getBounds().getCenter();
   if(!bounds.contains(center))continue;
   const point=map.latLngToContainerPoint(center);
   if(occupied.some(p=>Math.abs(p.x-point.x)<105&&Math.abs(p.y-point.y)<26))continue;
   const el=document.createElement('span');el.textContent=sectorTitle(item.record);
   const tag=L.tooltip({permanent:true,direction:'center',interactive:false,opacity:0.92,
    className:item===selected?'openaip-sector-name is-selected':'openaip-sector-name'});
   tag.setLatLng(center).setContent(el);
   nameLabels.addLayer(tag);occupied.push(point);
  }
 }
 function focusSector(item){
  if(active!=='airspaces'||!enabledCategories.has(item.category))return;
  selected=item;
  refreshStyles();updateSelectionNote();renderLabels();
  item.layer.eachLayer(shape=>{if(typeof shape.bringToFront==='function')shape.bringToFront()});
 }
 function refreshStatus(){
  if(!loadedData||active!=='airspaces')return;
  const count=visibleDescriptors.length;
  status.textContent=count+' sectores visibles de '+descriptors.length+
   ' cargados desde OpenAIP'+(loadedData.total!=null?' ('+loadedData.total+' en origen)':'')+
   ' · CC BY-NC 4.0'+(loadedData.partial?' · consulta parcial, quedan páginas pendientes':'')+
   '. Solo referencia: verificar AIP/NOTAM.';
 }
 function refreshVisibility(){
  if(active!=='airspaces'||!loadedData)return;
  const group=groups.airspaces;
  if(selected&&!enabledCategories.has(selected.category)){
   selected=null;
   map.closePopup();
  }
  group.clearLayers();
  visibleDescriptors=descriptors.filter(item=>enabledCategories.has(item.category));
  for(const item of visibleDescriptors)group.addLayer(item.layer);
  refreshStyles();updateSelectionNote();refreshStatus();renderLabels();
 }
 allButton.addEventListener('click',()=>{
  for(const category of AIRSPACE_ORDER){enabledCategories.add(category);categoryCheckboxes.get(category).checked=true}
  refreshVisibility();
 });
 noneButton.addEventListener('click',()=>{
  enabledCategories.clear();
  for(const checkbox of categoryCheckboxes.values())checkbox.checked=false;
  refreshVisibility();
 });
 clearSelectionButton.addEventListener('click',()=>{
  selected=null;map.closePopup();refreshStyles();updateSelectionNote();renderLabels();
 });
 map.on('zoomend',renderLabels);
 map.on('moveend',renderLabels);
 function clearCurrent(){
  for(const group of Object.values(groups)){
   if(map.hasLayer(group))map.removeLayer(group);
   group.clearLayers();
  }
  if(map.hasLayer(nameLabels))map.removeLayer(nameLabels);
  nameLabels.clearLayers();
  panel.hidden=true;filterPanel.hidden=true;
  panel.removeAttribute('data-openaip-kind');
  active=null;descriptors=[];visibleDescriptors=[];selected=null;loadedData=null;
 }
 async function show(kind){
  if(!groups[kind])throw Error('Capa no compatible');
  clearCurrent();
  active=kind;panel.hidden=false;filterPanel.hidden=kind!=='airspaces';
  panel.setAttribute('data-openaip-kind',kind);
  panel.querySelector('h3').textContent=TITLES[kind]+' · OpenAIP';
  status.textContent='Consultando OpenAIP (Argentina)…';
  const request=kind;
  try{
   const data=await readKind(kind);
   if(active!==request)return;
   const group=groups[kind];group.clearLayers();
   let rendered=0;
   if(kind==='airspaces'){
    loadedData=data;
    descriptors=[];
    const counts=Object.fromEntries(AIRSPACE_ORDER.map(category=>[category,0]));
    for(const entry of data.records){
     try{
      if(!entry.geometry||!['Polygon','MultiPolygon'].includes(entry.geometry.type))continue;
      const category=airspaceCategory(entry.type);
      const layer=L.geoJSON({type:'Feature',properties:{},geometry:entry.geometry},
       {style:sectorStyle(category)});
      const item={record:entry,category,layer};
      layer.bindPopup(()=>makePopup(entry),{maxWidth:330});
      const tooltipText=document.createElement('span');
      tooltipText.textContent=sectorTitle(entry);
      layer.bindTooltip(tooltipText,{sticky:true,direction:'top'});
      layer.on('click',()=>focusSector(item));
      layer.on('popupclose',()=>{
       if(selected===item){selected=null;refreshStyles();updateSelectionNote();renderLabels()}
      });
      descriptors.push(item);counts[category]++;
     }catch(_){/* Una geometría errónea nunca oculta las restantes. */}
    }
    for(const category of AIRSPACE_ORDER)categoryCounts.get(category).textContent=String(counts[category]);
    group.addTo(map);nameLabels.addTo(map);
    refreshVisibility();
   }else{
    for(const entry of data.records){
     try{
      if(!Array.isArray(entry.coordinates)||entry.coordinates.length!==2)continue;
      const [lon,lat]=entry.coordinates;
      if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
      const marker=L.circleMarker([lat,lon],{radius:entry.compulsory?7:5,
       color:'#f4faff',weight:1.8,fillColor:entry.compulsory?'#227f6b':'#6e66b2',fillOpacity:0.95});
      const label=document.createElement('span');
      label.textContent=entry.name||'Punto VFR';
      marker.bindTooltip(label);
      marker.bindPopup(()=>makePopup(entry),{maxWidth:330});
      group.addLayer(marker);rendered++;
     }catch(_){/* Descartar solo el registro malformado. */}
    }
    group.addTo(map);
    status.textContent=rendered+' visibles'+(data.total!=null?' de '+data.total:'')+
     ' registros OpenAIP · CC BY-NC 4.0'+(data.partial?' · consulta parcial, quedan páginas pendientes':'')+
     '. Solo referencia, verificar AIP/NOTAM.';
   }
  }catch(error){
   if(active===request)status.textContent=error.message||'No se pudo consultar OpenAIP.';
  }
 }
 return Object.freeze({show,hide:clearCurrent,readNavaids:()=>readKind('navaids'),
  matchNavaid,navaidType,haversineNm,airspaceCategory,sectorStyle});

}
root.GDV_OPENAIP_LAYERS=Object.freeze({boot,navaidType,matchNavaid,limitLabel,haversineNm,airspaceCategory,sectorStyle});
})(typeof window!=='undefined'?window:globalThis);
