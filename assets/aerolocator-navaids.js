/* AeroLocator · radioayudas argentinas de OurAirports, únicamente como referencia.
 * Capa separada y optativa; los datos no sustituyen cartas AIP ni NOTAM.
 */
(function(root){
'use strict';
const URL='/api/aerolocator-navaids';
function boot({map,L}){
 if(!map||!L)throw Error('Mapa Leaflet no disponible');
 const group=L.layerGroup(),control=L.control({position:'topright'});
 const AIP=root.GDV_NAVAIDS_AIP||null;
 const chosen={ndb:true,vor:true,dme:true};
 let entries=[],loaded=false,loading=false;
 const colors={ndb:'#e2a034',vor:'#2579bd',dme:'#8b68a9'};
 function family(type){
  if(type.startsWith('NDB'))return 'ndb';
  if(type==='DME'||type==='TACAN')return 'dme';
  return 'vor';
 }
 function visible(item){
  if(item.type.startsWith('NDB'))return chosen.ndb||Boolean(item.type.includes('DME')&&chosen.dme);
  if(item.type==='DME'||item.type==='TACAN')return chosen.dme;
  return chosen.vor||Boolean((item.type.includes('DME')||item.type==='VORTAC')&&chosen.dme);
 }
 function line(parent,text,cls=''){
  const p=document.createElement('p');
  if(cls)p.className=cls;
  p.textContent=text;parent.append(p);return p;
 }
 function link(parent,url,text){
  const a=document.createElement('a');
  a.href=url;a.target='_blank';a.rel='noopener noreferrer';
  a.textContent=text;a.style.marginRight='10px';
  parent.append(a);
 }
 function popup(item,check){
  const wrap=document.createElement('section');
  wrap.style.cssText='min-width:220px;max-width:300px;font:12px/1.5 system-ui,sans-serif;color:#163049';
  const title=document.createElement('strong');
  title.textContent=(item.ident||'?')+' · '+item.type;title.style.fontSize='15px';
  wrap.append(title);
  line(wrap,item.name||'Sin nombre');
  const isNdb=item.type.startsWith('NDB');
  const frequency=item.frequency===null||item.frequency===undefined?
   'No informada':String(item.frequency)+' '+item.unit;
  const label=isNdb?'Frecuencia NDB':'Referencia VHF de sintonía';
  line(wrap,label+': '+frequency);
  if(item.dmeChannel)line(wrap,'Canal DME: '+item.dmeChannel);
  if(item.dmePairMHz)line(wrap,'Frecuencia VHF apareada a DME: '+item.dmePairMHz+' MHz');
  if(item.airport)line(wrap,'Aeródromo asociado: '+item.airport);
  line(wrap,'Coordenadas comunitarias: '+item.lat.toFixed(5)+', '+item.lon.toFixed(5));
  if(check.status==='document-match'){
   line(wrap,'Coincidencia de identificador, tipo y frecuencia con AIP ENR 4.1 (19/02/2026). Esto NO verifica operatividad ni NOTAM vigentes.');
  }else if(check.status==='frequency-difference'){
   line(wrap,'ATENCIÓN: OurAirports '+frequency+' difiere de AIP ENR 4.1 (19/02/2026): '+check.referenceFrequency+' '+item.unit+'. No utilizar sin cotejo oficial.','navaid-discrepancy');
  }else if(check.status==='frequency-missing'){
   line(wrap,'OurAirports no indica frecuencia. Referencia AIP ENR 4.1 (19/02/2026): '+check.referenceFrequency+' '+item.unit+'.');
  }else{
   line(wrap,'Sin cotejo documental individual. OurAirports no es una fuente aeronáutica oficial.');
  }
  line(wrap,'Estado operacional: DESCONOCIDO. Antes de volar consultar AIP, actualizaciones AIRAC y NOTAM.');
  const links=document.createElement('div');links.style.marginTop='8px';
  link(links,AIP?.aipUrl||'https://ais.anac.gob.ar/aip','AIP Argentina');
  link(links,AIP?.notamUrl||'https://ais.anac.gob.ar/notam','NOTAM');
  if(check.status!=='not-compared'&&AIP?.sourceUrl)
   link(links,AIP.sourceUrl,'Documento ENR 4.1');
  wrap.append(links);
  return wrap;
 }
 async function loadCatalog(){
  try{
   const response=await fetch(URL,{headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('API HTTP '+response.status);
   const data=await response.json();
   if(!data.ok||!Array.isArray(data.records)||!data.records.length)throw Error('Catálogo API inválido');
   return data;
  }catch(_){
   const response=await fetch('../assets/aerolocator-navaids-ar.geojson',{cache:'no-cache'});
   if(!response.ok)throw Error('Tampoco hay un snapshot local disponible');
   const geo=await response.json();
   if(geo.type!=='FeatureCollection'||!Array.isArray(geo.features)||!geo.features.length)
    throw Error('Snapshot local inválido');
   const records=geo.features.map(f=>{
    const p=f.properties||{},coords=f.geometry?.coordinates||[];
    return {id:Number(p.source_id),ident:String(p.ident||''),name:String(p.name||''),
     type:String(p.navaid_type||''),lat:Number(coords[1]),lon:Number(coords[0]),
     frequency:p.frequency??null,unit:p.frequency_units||'',
     dmeChannel:p.dme_channel||'',dmePairMHz:null,
     airport:p.associated_airport||'',source:'OurAirports',
     verification:'pending',operationalStatus:'unknown'};
   });
   return {ok:true,records,stale:true,source:'Snapshot OurAirports no verificado'};
  }
 }
 function updateMarkers(){
  group.clearLayers();
  let visibleCount=0;
  for(const entry of entries)if(visible(entry.item)){
   entry.marker.addTo(group);visibleCount++;
  }
  return visibleCount;
 }
 control.onAdd=()=>{
  const el=L.DomUtil.create('div','gdv-navaids-control leaflet-bar');
  el.style.cssText='background:#f5f9fd;color:#193247;border:1px solid #739ab8;border-radius:9px;padding:9px 10px;max-width:220px;box-shadow:0 2px 8px #0004;font:12px/1.45 system-ui,sans-serif';
  el.innerHTML='<label style="display:flex;flex-direction:row;gap:6px;align-items:center;font-weight:800;cursor:pointer"><input class="navaids-master" type="checkbox"> Radioayudas NDB / VOR / DME</label><div class="navaids-filters" hidden style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-top:7px"><label><input type="checkbox" data-fam="ndb" checked> NDB</label><label><input type="checkbox" data-fam="vor" checked> VOR</label><label><input type="checkbox" data-fam="dme" checked> DME</label></div><small class="navaids-status" style="display:block;margin-top:4px;line-height:1.3">Fuente comunitaria · SIN verificar</small>';
  L.DomEvent.disableClickPropagation(el);
  L.DomEvent.disableScrollPropagation(el);
  const master=el.querySelector('.navaids-master');
  const filters=el.querySelector('.navaids-filters');
  const status=el.querySelector('.navaids-status');
  filters.hidden=true;filters.style.display='none';
  filters.querySelectorAll('input').forEach(check=>{
   check.addEventListener('change',()=>{
    chosen[check.dataset.fam]=check.checked;
    const showing=updateMarkers();
    if(loaded)status.textContent=showing+' visibles de '+entries.length+' registros · NO operativos verificados';
   });
  });
  master.addEventListener('change',async()=>{
   filters.hidden=!master.checked;filters.style.display=master.checked?'grid':'none';
   if(!master.checked){map.removeLayer(group);return}
   group.addTo(map);
   if(loaded){status.textContent=updateMarkers()+' visibles de '+entries.length+' registros · SIN verificación operacional';return}
   if(loading)return;
   loading=true;status.textContent='Consultando radioayudas argentinas…';
   try{
    const data=await loadCatalog();
    entries=[];
    for(const item of data.records){
     if(!Number.isFinite(item.lat)||!Number.isFinite(item.lon))continue;
     const compare=AIP?.compare(item)||{status:'not-compared'};
     const category=family(item.type);
     const warning=compare.status==='frequency-difference';
     const marker=L.circleMarker([item.lat,item.lon],{
      radius:warning?8:6,weight:warning?3:2,
      color:warning?'#b02e2e':'#fff',fillColor:warning?'#cc443b':colors[category],
      fillOpacity:.96
     });
     marker.bindPopup(()=>popup(item,compare),{maxWidth:360});
     marker.bindTooltip((item.ident||'?')+' · '+item.type+' · referencia no operativa');
     entries.push({item,marker});
    }
    loaded=true;
    const showing=updateMarkers();
    status.textContent=showing+' visibles de '+entries.length+' registros. Frecuencias NO verificadas para uso operacional'+(data.stale?' · caché':'')+'.';
   }catch(_){
    status.textContent='No se pudo consultar el catálogo; comprobá la conexión e intentá nuevamente.';
    master.checked=false;filters.hidden=true;filters.style.display='none';map.removeLayer(group);
   }finally{loading=false}
  });
  return el;
 };
 control.addTo(map);
 return {group,control};
}
root.GDV_NAVAIDS_BOOT=boot;
})(typeof window!=='undefined'?window:globalThis);
