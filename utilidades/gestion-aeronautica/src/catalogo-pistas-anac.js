/* Catálogo inicial de referencias oficiales aeronáuticas.
 * ÚNICAMENTE registros contrastados con documentos ANAC citados aquí.
 * Esto NO certifica vigencia operacional, habilitación activa ni autorización de acceso.
 * Catálogo PARCIAL: no representa el inventario nacional completo.
 */
(function(root){
 'use strict';
 const LAD_SOURCE='https://www.argentina.gob.ar/sites/default/files/listado_lad_2026-09.pdf';
 const AIP_SOURCE='https://ais.anac.gob.ar/aip';
 const MADHEL_SOURCE='https://ais.anac.gob.ar/madhel/';
 const published='2026-09-28';
 // DDMMSS[.cc] + S/W -> grados decimales. Soporta 0601545,00W del documento ANAC.
 function coordinate(value){
  const str=String(value).trim().toUpperCase().replace(',','.');
  const m=str.match(/^(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)([NSWE])$/);
  if(!m)throw Error('Coordenada documental no reconocida: '+value);
  const d=Number(m[1]),minute=Number(m[2]),seconds=Number(m[3]);
  const axis=m[4],max=(axis==='S'||axis==='N')?90:180;
  if(d>max||minute>=60||seconds>=60)throw Error('Coordenada documental fuera de rango');
  return Number(((d+minute/60+seconds/3600)*(axis==='S'||axis==='W'?-1:1)).toFixed(7));
 }
 const fromDms=(lat,lon)=>({lat:coordinate(lat),lon:coordinate(lon)});
 const LAD_ROWS=[
  [176,'EL ADUAR','10/28','700 x 30 m','Tierra','283428,00S','0601545,00W','Santa Fe'],
  [245,'EO. 10 NOVIEMBRE','17/35','1000 x 30 m','Tierra','353448,00S','0622854,00W','Buenos Aires'],
  [380,'EA. ALEGRIA','18/36','940 x 30 m','Tierra','255200,00S','0584000,00W','Formosa'],
  [451,'EA. EL CENCERRO','02/20','1200 x 30 m','Tierra','303200,00S','0602600,00W','Santa Fe'],
  [496,'EA. EL PINOCHO','02/20','930 x 40 m','Tierra','323400,00S','0583100,00W','Entre Ríos'],
  [513,'EA. EL REY','09/27','800 x 80 m','Tierra','244700,00S','0643200,00W','Salta'],
  [529,'EA. ITA-CAABO','01/19','1000 x 40 m','Tierra','291723,00S','0574336,00W','Corrientes'],
  [576,'EA. LA DOMINGA','18/36','800 x 25 m','Tierra','303653,00S','0595717,00W','Santa Fe'],
  [659,'NUEVA CASTILLA','14/32','840 x 40 m','Tierra','360300,00S','0630200,00W','Buenos Aires'],
  [682,'EA. LA ROSA','18/36','1500 x 25 m','Tierra','303935,00S','0603341,00W','Santa Fe'],
  [723,'EA. LAS TRES MARIAS-CORRIENTES','18/36','900 x 30 m','Tierra','274300,00S','0584700,00W','Corrientes'],
  [750,'EA. LOS LEONES','01/19','1000 x 35 m','Tierra','311000,00S','0604300,00W','Santa Fe'],
  [761,'EA. LOS TAMBOS','02/20','1000 x 35 m','Tierra','360800,00S','0613000,00W','Buenos Aires'],
  [778,'EA. MONTE DINERO','09/27','1000 x 30 m','Tierra','521800,00S','0683200,00W','Santa Cruz'],
  [829,'EA. SAN JOAQUIN','01/19','900 x 40 m','Tierra','304519,00S','0595951,00W','Santa Fe'],
  [938,'EA. TREBOLARES','18/36','1250 x 35 m','Tierra','353800,00S','0633000,00W','La Pampa']
 ];
 const lad=LAD_ROWS.map(([registry,name,runway,dimensions,surface,lat,lon,province])=>({
  id:'anac-lad-'+registry,category:'lad',facilityClass:'lad',legal_use:'lad',ats_service:'unknown',operation_rules:'vfr',access_policy:'prior_permission',facility_kind:'airstrip',name:'LAD '+registry+' · '+name,...fromDms(lat,lon),
  details:{runway,dimensions,surface,province,registry:'LAD '+registry,
   permission:'No confirmada: contactar al responsable',
   notes:'LAD incluido en listado ANAC. No equivale a aeródromo habilitado.'},
  sourceUrl:LAD_SOURCE,sourceLabel:'ANAC · Listado LAD septiembre 2026',sourceDate:published,
  sourceType:'registro_lad',verification:'Referencia documental. Vigencia y aptitud operacional no verificadas.'
 }));
 const official=[
  {id:'aip-sabe',category:'official',facilityClass:'controlled_public',legal_use:'public',ats_service:'twr',operation_rules:'unknown',access_policy:'public',facility_kind:'aerodrome',name:'Aeroparque Jorge Newbery (SABE)',
   ...fromDms('343335S','0582454W'),
   details:{icao:'SABE',runway:'13/31',dimensions:'2350 x 45 m (carta SUP 2023)',province:'Ciudad Autónoma de Buenos Aires',
    permission:'Verificar en AIP, MADHEL y NOTAM; acceso sujeto a condiciones publicadas.',
    notes:'Referencia de carta AIP/SUP ANAC (2023); consultar publicación vigente antes de operar.'},
   sourceUrl:'https://ais.anac.gob.ar/descarga/sup-64d52a2cc61b6',
   sourceLabel:'ANAC · Carta de aeródromo SABE (SUP A 73/2023)',sourceDate:'2023-09-07',
   sourceType:'publicacion_aip',classificationSourceUrl:'https://servicios.transporte.gob.ar/gobierno_abierto/detalle.php?d=detalle&t=aeropuertos',classificationSourceDate:'2021-09',verification:'AIP 2023 y datos de control/uso público de 2021: comprobación operativa actual pendiente.'},
  {id:'aip-saez',category:'official',facilityClass:'controlled_public',legal_use:'public',ats_service:'twr',operation_rules:'unknown',access_policy:'public',facility_kind:'aerodrome',name:'Ezeiza / Ministro Pistarini (SAEZ)',
   ...fromDms('344920S','0583209W'),
   details:{icao:'SAEZ',runway:'11/29 y 17/35 (carta SUP 2023)',province:'Buenos Aires',
    permission:'Verificar en AIP, MADHEL y NOTAM; acceso sujeto a condiciones publicadas.',
    notes:'Referencia de carta AIP/SUP ANAC (2023); consultar publicación vigente antes de operar.'},
   sourceUrl:'https://ais.anac.gob.ar/descarga/sup-652074d8547f1',
   sourceLabel:'ANAC · Carta de aeródromo SAEZ (SUP A 85/2023)',sourceDate:'2023-10-06',
   sourceType:'publicacion_aip',classificationSourceUrl:'https://servicios.transporte.gob.ar/gobierno_abierto/detalle.php?d=detalle&t=aeropuertos',classificationSourceDate:'2021-09',verification:'AIP 2023 y datos de control/uso público de 2021: comprobación operativa actual pendiente.'}
 ];
 root.AEROSUITE_OFFICIAL_AIRSTRIPS=Object.freeze({
  official:Object.freeze(official),lad:Object.freeze(lad),
  sources:Object.freeze({aip:AIP_SOURCE,madhel:MADHEL_SOURCE,lad:LAD_SOURCE}),
  catalogStatus:'parcial',ladEdition:published
 });
})(window);
