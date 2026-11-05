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
 function clearCurrent(){
  for(const group of Object.values(groups))if(map.hasLayer(group))map.removeLayer(group);
  panel.hidden=true;active=null;
 }
 async function show(kind){
  if(!groups[kind])throw Error('Capa no compatible');
  clearCurrent();
  active=kind;panel.hidden=false;
  panel.querySelector('h3').textContent=TITLES[kind]+' · OpenAIP';
  status.textContent='Consultando OpenAIP (Argentina)…';
  const request=kind;
  try{
   const data=await readKind(kind);
   if(active!==request)return;
   const group=groups[kind];group.clearLayers();
   let rendered=0;
   for(const entry of data.records){
    try{
     if(kind==='airspaces'){
      if(!entry.geometry||!['Polygon','MultiPolygon'].includes(entry.geometry.type))continue;
      const cat=entry.type;
      const color=[1,3].includes(cat)?'#c64c4c':cat===2?'#d89b36':'#58a0da';
      const dashed=[1,2,8].includes(cat)?'7 6':null;
      const shape=L.geoJSON({type:'Feature',properties:{},geometry:entry.geometry},
       {style:{color,weight:2,dashArray:dashed,fillOpacity:0.11,fillColor:color}});
      shape.bindPopup(()=>makePopup(entry),{maxWidth:330});
      group.addLayer(shape);rendered++;
     }else{
      if(!Array.isArray(entry.coordinates)||entry.coordinates.length!==2)continue;
      const [lon,lat]=entry.coordinates;
      if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
      const marker=L.circleMarker([lat,lon],{radius:entry.compulsory?7:5,
       color:'#f4faff',weight:1.8,fillColor:entry.compulsory?'#227f6b':'#6e66b2',fillOpacity:0.95});
      marker.bindTooltip(entry.name||'Punto VFR');
      marker.bindPopup(()=>makePopup(entry),{maxWidth:330});group.addLayer(marker);rendered++;
     }
    }catch(_){ /* Skip malformed individual geometry, never the complete map. */ }
   }
   if(active===request)group.addTo(map);
   status.textContent=rendered+' visibles'+(data.total!=null?' de '+data.total:'')+
     ' registros OpenAIP · CC BY-NC 4.0'+(data.partial?' · consulta parcial, quedan páginas pendientes':'')+
     '. Solo referencia, verificar AIP/NOTAM.';
  }catch(error){
   if(active===request)status.textContent=error.message||'No se pudo consultar OpenAIP.';
  }
 }
 return Object.freeze({show,hide:clearCurrent,readNavaids:()=>readKind('navaids'),
  matchNavaid,navaidType,haversineNm});
}
root.GDV_OPENAIP_LAYERS=Object.freeze({boot,navaidType,matchNavaid,limitLabel,haversineNm});
})(typeof window!=='undefined'?window:globalThis);
