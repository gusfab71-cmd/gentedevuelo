/* AeroLocator · exploración de OpenStreetMap para verificación, NO catálogo oficial.
 * Geometrías Overpass: node, way, relation. Lectura únicamente a demanda.
 */
(function(root){
 'use strict';
 const allowed=new Set(['airstrip','aerodrome','runway','heliport','helipad']);
 function query(bounds){
  if(!bounds||bounds.length!==4||bounds.some(n=>!Number.isFinite(n)))throw Error('Coordenadas del área inválidas');
  const [s,w,n,e]=bounds;
  if(!(s<n&&w<e)||s<-90||n>90||w<-180||e>180||(n-s)*(e-w)>1.5)
   throw Error('Acercá el mapa a una zona más pequeña para consultar OpenStreetMap');
  const box=bounds.map(v=>v.toFixed(5)).join(',');
  return '[out:json][timeout:20];'+
   '(nwr["aeroway"~"^(airstrip|aerodrome|runway|heliport|helipad)$"]('+box+'););'+
   'out geom 250;';
 }
 function decode(input){
  if(!input||!Array.isArray(input.elements))throw Error('La respuesta Overpass no contiene elementos');
  const items=[],seen=new Set();
  for(const o of input.elements.slice(0,250)){
   const kind=String(o.tags?.aeroway||'').trim().toLowerCase();
   if(!allowed.has(kind)||!['node','way','relation'].includes(o.type)||
      !Number.isSafeInteger(o.id)||o.id<1)continue;
   const id=o.type+'/'+o.id;if(seen.has(id))continue;seen.add(id);
   let parts=[];
   if(Array.isArray(o.geometry))parts=[o.geometry];
   else if(o.type==='relation'&&Array.isArray(o.members))
    parts=o.members.filter(m=>Array.isArray(m.geometry)).slice(0,12).map(m=>m.geometry);
   else if(Number.isFinite(o.lat)&&Number.isFinite(o.lon))
    parts=[[{lat:o.lat,lon:o.lon}]];
   parts=parts.map(p=>p.filter(c=>Number.isFinite(c.lat)&&Number.isFinite(c.lon)&&
    c.lat>=-90&&c.lat<=90&&c.lon>=-180&&c.lon<=180).slice(0,1800)
    .map(c=>[c.lat,c.lon])).filter(p=>p.length);
   if(!parts.length)continue;
   const first=parts[0],len=first.length;
   const center=first.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]).map(v=>v/len);
   const tags=o.tags||{};
   const str=(key,limit=160)=>String(tags[key]||'').trim().slice(0,limit);
   items.push({
    id,type:o.type,kind,name:str('name')||str('icao')||str('ref')||
       (kind==='runway'?'Pista cartografiada':kind==='airstrip'?'Pista rural':kind==='helipad'?'Helisuperficie':'Aeródromo sin nombre'),
    lat:center[0],lon:center[1],parts,
    icao:str('icao',10),ref:str('ref',55),surface:str('surface'),
    width:str('width',40),length:str('length',40),access:str('access',80),
    operator:str('operator'),ele:str('ele',40),
    url:'https://www.openstreetmap.org/'+id
   });
  }
  return items;
 }
 root.GDV_OSM_REVIEW=Object.freeze({query,decode});
})(window);
