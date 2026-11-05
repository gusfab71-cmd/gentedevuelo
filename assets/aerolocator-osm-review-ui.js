/* AeroLocator · UI de candidatos OpenStreetMap (no oficiales).
 * Consulta por área visible; el mapa principal jamás recibe estos objetos.
 */
(function(root){
 'use strict';
 function boot({map,layer,documented,community,communityLocation,nauticalMiles,
                showReview,reviewMode,syncLayers}){
  const parser=root.GDV_OSM_REVIEW, L=root.L;
  if(!parser||!L)throw Error('No está disponible el lector cartográfico OSM.');
  const results=document.getElementById('osm-review-results');
  const status=document.getElementById('osm-review-status');
  const mainStatus=document.getElementById('osm-status');
  const search=document.getElementById('osm-review-find');
  const clear=document.getElementById('osm-review-clear');
  let lastQuery=0, requestEpoch=0, busy=false;
  function matchKind(item){
   const code=item.icao.toUpperCase();
   for(const point of documented()){
    const distance=nauticalMiles(point.lat,point.lon,item.lat,item.lon);
    const officialCode=String(point.details?.icao||'').trim().toUpperCase();
    if(distance<.20||(code&&officialCode===code&&distance<6))return 'ANAC';
   }
   for(const record of community()){
    const pos=communityLocation(record);
    if(nauticalMiles(pos.lat,pos.lng,item.lat,item.lon)<.12)return 'OurAirports';
   }
   return '';
  }
  function popup(item,match){
   const box=document.createElement('section');box.className='oa-review-detail';
   const title=document.createElement('h4');title.textContent=item.name;box.append(title);
   const lines=[
    'Fuente: OpenStreetMap · '+item.type+'/'+item.id+' · '+item.kind,
    'Estado: SIN VALIDACIÓN AERONÁUTICA. No certifica habilitación ni aptitud.',
    match?'Coincidencia espacial probable con '+match+'; requiere cotejo manual.':'Sin coincidencia detectada en los catálogos cargados.',
    'Posición referencial: '+item.lat.toFixed(6)+', '+item.lon.toFixed(6),
    item.icao&&'OACI etiquetado: '+item.icao,
    item.ref&&'Designación: '+item.ref,
    item.surface&&'Superficie OSM: '+item.surface,
    item.width&&'Ancho OSM: '+item.width,
    item.length&&'Largo OSM: '+item.length,
    item.access&&'Acceso etiquetado: '+item.access,
    item.operator&&'Operador etiquetado: '+item.operator
   ].filter(Boolean);
   for(const line of lines){const p=document.createElement('p');p.textContent=line;box.append(p);}
   const link=document.createElement('a');link.href=item.url;link.target='_blank';
   link.rel='noopener noreferrer';link.textContent='Ver objeto original en OpenStreetMap';
   box.append(link);
   return box;
  }
  function layerFor(path,color){
   if(path.length===1)return L.circleMarker(path[0],{
    radius:6,color:'#f8fbff',weight:1.5,fillColor:color,fillOpacity:.96
   });
   const p=path[0],last=path[path.length-1];
   const closed=path.length>=4&&Math.abs(p[0]-last[0])<.00001&&Math.abs(p[1]-last[1])<.00001;
   const style={color,weight:3,opacity:.94,dashArray:'6 5'};
   return closed?L.polygon(path,{...style,fillOpacity:.12}):L.polyline(path,style);
  }
  async function discover(){
   if(busy||!reviewMode())return;
   if(map.getZoom()<10){
    status.textContent='Acercá el mapa al menos a zoom 10 para buscar pistas OSM.';return;
   }
   const bounds=map.getBounds();
   let query;
   try{query=parser.query([bounds.getSouth(),bounds.getWest(),bounds.getNorth(),bounds.getEast()]);}
   catch(error){status.textContent=error.message;return;}
   if(Date.now()-lastQuery<7000){
    status.textContent='Esperá unos segundos antes de buscar en otra zona.';return;
   }
   lastQuery=Date.now();const epoch=++requestEpoch;
   busy=true;search.disabled=true;
   status.textContent='Consultando OpenStreetMap · capa de revisión, sin publicación automática…';
   try{
    const response=await fetch('https://overpass.private.coffee/api/interpreter',{
     method:'POST',body:new URLSearchParams({data:query}),
     signal:AbortSignal.timeout(28000)
    });
    if(!response.ok)throw Error('HTTP '+response.status+' del servicio Overpass');
    const json=await response.json();
    const found=parser.decode(json);
    if(epoch!==requestEpoch)return;
    layer.clearLayers();results.replaceChildren();
    let candidates=0,anacMatches=0,oaMatches=0,shapes=0;
    for(const item of found){
     const match=matchKind(item);
     if(match==='ANAC')anacMatches++;else if(match==='OurAirports')oaMatches++;else candidates++;
     const color=match?'#8198ad':'#eaa64a';
     const drawn=[];
     for(const part of item.parts){
      const shape=layerFor(part,color);
      if(part.length>1)shapes++;
      shape.bindPopup(()=>popup(item,match),{minWidth:245,maxWidth:330});
      shape.bindTooltip(item.name+' · OSM, SIN verificar',{sticky:true});
      shape.addTo(layer);drawn.push(shape);
     }
     if(!drawn.length||results.children.length>=80)continue;
     const entry=document.createElement('button');entry.type='button';
     entry.textContent=(match?'[Coincide '+match+'] ':'[Candidato] ')+item.name;
     const subtitle=document.createElement('small');
     subtitle.textContent=item.kind+' · '+item.id+(item.surface?' · '+item.surface:'')+
      ' · OpenStreetMap no oficial';
     entry.append(subtitle);
     entry.addEventListener('click',()=>{
      map.setView([item.lat,item.lon],Math.max(14,map.getZoom()),{animate:false});
      drawn[0].openPopup();
     });
     results.append(entry);
    }
    results.hidden=!results.children.length;syncLayers();
    const summary=found.length+' objetos OSM: '+candidates+' candidatos, '+
     anacMatches+' cercanos a ANAC y '+oaMatches+' cercanos a OurAirports. '+
     shapes+' trazados/áreas. Hasta 80 fichas visibles. Sin validación aeronáutica.';
    status.textContent=summary;mainStatus.textContent=summary;
   }catch(error){
    if(epoch===requestEpoch)
     status.textContent='La consulta OSM falló: '+String(error?.message||error)+
      '. Se conserva la última capa válida.';
   }finally{busy=false;search.disabled=false;}
  }
  search.addEventListener('click',()=>{void discover()});
  clear.addEventListener('click',()=>{
   requestEpoch++;layer.clearLayers();results.replaceChildren();results.hidden=true;
   status.textContent='Capa OSM retirada. Podés consultar otra zona.';
   if(map.hasLayer(layer))map.removeLayer(layer);
  });
  document.getElementById('explore').addEventListener('click',()=>{
   if(map.getZoom()<10){
    mainStatus.textContent='Acercá la zona del mapa a zoom 10 o superior para revisar OSM.';return;
   }
   showReview();
   void discover();
  });
  return {discover};
 }
 root.GDV_OSM_REVIEW_UI_BOOT=boot;
})(window);
