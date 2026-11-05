/* AeroLocator: optional community reference layer of Argentine navaids.
 * OurAirports public-domain dataset. NOT for operational navigation.
 * Load on demand; never overwrite ANAC data or community records.
 */
(function(root){
'use strict';
const URL='https://davidmegginson.github.io/ourairports-data/navaids.csv';
const TYPES=new Set(['NDB','NDB-DME','VOR','VOR-DME','DME','VORTAC','TACAN']);
function parseCSV(csv){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<csv.length;i++){
  const c=csv[i];
  if(c==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
  else if(c===','&&!quoted){row.push(cell);cell=''}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell=''}
  else cell+=c;
 }
 if(cell||row.length){row.push(cell);rows.push(row)}
 const columns=rows.shift()||[];
 return rows.map(values=>Object.fromEntries(columns.map((key,i)=>[key,values[i]||''])));
}
function boot({map,L}){
 const group=L.layerGroup(),control=L.control({position:'topright'});
 let loaded=false,loading=false;
 control.onAdd=()=>{
  const el=L.DomUtil.create('div','leaflet-bar');
  el.style.cssText='background:white;padding:7px 9px;max-width:190px;font:12px/1.4 system-ui,sans-serif';
  el.innerHTML='<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" aria-label="Mostrar radioayudas de Argentina"> NDB / VOR / DME</label><small class="gdv-navaid-status" style="display:block">Fuente: OurAirports · no verificada</small>';
  L.DomEvent.disableClickPropagation(el);
  L.DomEvent.disableScrollPropagation(el);
  const checkbox=el.querySelector('input'),status=el.querySelector('small');
  checkbox.addEventListener('change',async()=>{
   if(!checkbox.checked){map.removeLayer(group);return}
   group.addTo(map);
   if(loaded||loading)return;
   loading=true;status.textContent='Descargando radioayudas…';
   try{
    const response=await fetch(URL,{mode:'cors',cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const data=parseCSV(await response.text());
    let count=0;
    for(const item of data){
     if(item.iso_country!=='AR'||!TYPES.has(item.type))continue;
     const lat=Number(item.latitude_deg),lon=Number(item.longitude_deg);
     if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)continue;
     const freq=Number(item.frequency_khz);
     const frequency=freq>0?(item.type.startsWith('NDB')?freq+' kHz':(freq/1000).toFixed(3)+' MHz'):'Sin dato';
     const safe=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
     L.circleMarker([lat,lon],{radius:5,color:'#305d91',weight:2,fillColor:'#fff',fillOpacity:0.9})
      .bindPopup('<strong>'+safe(item.ident)+' · '+safe(item.type)+'</strong><div>'+safe(item.name)+'</div><div>Frecuencia: '+safe(frequency)+'</div><small>OurAirports · pendiente de verificar con AIP/NOTAM. No usar para navegación.</small>')
      .addTo(group);
     count++;
    }
    loaded=true;status.textContent=count+' radioayudas · datos no verificados';
   }catch(err){status.textContent='Fuente no disponible. Desactivá y volvé a intentar.';checkbox.checked=false;map.removeLayer(group)}
   finally{loading=false}
  });
  return el;
 };
 control.addTo(map);
 return {group,control};
}
root.GDV_NAVAIDS_BOOT=boot;
})(typeof window!=='undefined'?window:globalThis);
