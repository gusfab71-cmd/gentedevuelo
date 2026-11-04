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
   sourceType:'publicacion_aip',classificationSourceUrl:'https://servicios.transporte.gob.ar/gobierno_abierto/detalle.php?d=detalle&t=aeropuertos',classificationSourceDate:'2021-09',verification:'AIP 2023 y datos de control/uso público de 2021: verificación operativa actual pendiente.'},
  {id:'aip-saez',category:'official',facilityClass:'controlled_public',legal_use:'public',ats_service:'twr',operation_rules:'unknown',access_policy:'public',facility_kind:'aerodrome',name:'Ezeiza / Ministro Pistarini (SAEZ)',
   ...fromDms('344920S','0583209W'),
   details:{icao:'SAEZ',runway:'11/29 y 17/35 (carta SUP 2023)',province:'Buenos Aires',
    permission:'Verificar en AIP, MADHEL y NOTAM; acceso sujeto a condiciones publicadas.',
    notes:'Referencia de carta AIP/SUP ANAC (2023); consultar publicación vigente antes de operar.'},
   sourceUrl:'https://ais.anac.gob.ar/descarga/sup-652074d8547f1',
   sourceLabel:'ANAC · Carta de aeródromo SAEZ (SUP A 85/2023)',sourceDate:'2023-10-06',
   sourceType:'publicacion_aip',classificationSourceUrl:'https://servicios.transporte.gob.ar/gobierno_abierto/detalle.php?d=detalle&t=aeropuertos',classificationSourceDate:'2021-09',verification:'AIP 2023 y datos de control/uso público de 2021: verificación operativa actual pendiente.'}
 ];

 // Registros geográficos de la nómina pública ANAC (septiembre 2021).
 // Información HISTÓRICA: categorías y servicios no equivalen a condición operativa actual.
 // La edición nacional septiembre 2026 no pudo descargarse del servidor oficial (error 502).
 const ANAC_2021_SOURCE='https://servicios.transporte.gob.ar/gobierno_abierto/detalle.php?d=detalle&t=aeropuertos';
 const ANAC_2021_ROWS=[
  ["SAAV","Santa Fe / Sauce Viejo",-31.71083333,-60.81138889,"Santa Fe","controlled_public","twr",18],
  ["SAAR","Rosario / Islas Malvinas",-32.90361111,-60.78444444,"Santa Fe","controlled_public","twr",26],
  ["SACO","Córdoba / Ambrosio Taravella",-31.31,-64.20833333,"Córdoba","controlled_public","twr",489],
  ["SANT","Tucumán / Teniente Benjamín Matienzo",-26.84083333,-65.10472222,"Tucumán","controlled_public","twr",455],
  ["SAZS","San Carlos de Bariloche",-41.15111111,-71.15777778,"Río Negro","controlled_public","twr",846],
  ["SAWH","Ushuaia / Malvinas Argentinas",-54.84333333,-68.29555556,"Tierra del Fuego","controlled_public","twr",31],
  ["SAME","Mendoza / El Plumerillo",-32.83166667,-68.79277778,"Mendoza","controlled_public","twr",704],
  ["SARE","Resistencia",-27.45,-59.05611111,"Chaco","controlled_public","twr",53],
  ["SASA","Salta / Martín Miguel de Güemes",-24.85972222,-65.48694444,"Salta","controlled_public","twr",1246],
  ["SARF","Formosa",-26.21277778,-58.22805556,"Formosa","controlled_public","twr",59],
  ["SARL","Paso de los Libres",-29.68805556,-57.15222222,"Corrientes","controlled_public","twr",70],
  ["SADF","San Fernando",-34.45454,-58.59091,"Buenos Aires","controlled_public","twr",3],
  ["SADL","La Plata",-34.96916667,-57.89305556,"Buenos Aires","uncontrolled_public","air_radio",22],
  ["SADM","Morón",-34.67916667,-58.64361111,"Buenos Aires","controlled_public","twr",29],
  ["SAZN","Neuquén / Presidente Perón",-38.94888889,-68.15583333,"Neuquén","controlled_public","twr",273],
  ["SAZM","Mar del Plata / Astor Piazzolla",-37.93416667,-57.57333333,"Buenos Aires","controlled_public","twr",22],
  ["SAWG","Río Gallegos",-51.60881,-69.31217,"Santa Cruz","controlled_public","twr",19],
  ["SAWC","El Calafate",-50.28,-72.05305556,"Santa Cruz","controlled_public","twr",204],
  ["SAZB","Bahía Blanca / Comandante Espora",-38.7275,-62.15333333,"Buenos Aires","controlled_public","twr",75],
  ["SAAJ","Junín",-34.54589,-60.93051,"Buenos Aires","uncontrolled_public","air_radio",80],
  ["SAZR","Santa Rosa",-36.58833333,-64.27583333,"La Pampa","controlled_public","twr",192],
  ["SACA","Córdoba / Capitán Gelardi",-31.44195,-64.25847,"Córdoba","uncontrolled_public","air_radio",486],
  ["SAWD","Puerto Deseado",-47.73511,-65.9041,"Santa Cruz","uncontrolled_public","air_radio",82],
  ["SAAP","Paraná / General Urquiza",-31.79472222,-60.48027778,"Entre Ríos","controlled_public","twr",74],
  ["SARI","Cataratas del Iguazú",-25.73722,-54.47354,"Misiones","controlled_public","twr",279],
  ["SARP","Posadas",-27.38573,-55.97049,"Misiones","controlled_public","twr",131],
  ["SAVC","Comodoro Rivadavia",-45.78527778,-67.46555556,"Chubut","controlled_public","twr",57.6],
  ["SAWE","Río Grande",-53.7776,-67.74952,"Tierra del Fuego","controlled_public","twr",20],
  ["SARC","Corrientes",-27.44555556,-58.76194444,"Corrientes","controlled_public","twr",61.5],
  ["SAZF","Olavarría",-36.88888889,-60.22777778,"Buenos Aires","uncontrolled_public","air_radio",168],
  ["SAZC","Coronel Suárez",-37.44609,-61.88934,"Buenos Aires","uncontrolled_public","unknown",234],
  ["SASO","San Ramón de la Nueva Orán",-23.15221,-64.3288,"Salta","uncontrolled_public","air_radio",357]
 ];
 official.push(...ANAC_2021_ROWS.map(([icao,site,lat,lon,province,facilityClass,ats,meters])=>{
  const isSauceViejo=icao==='SAAV';
  return {
   id:'anac-'+icao.toLowerCase(),category:'official',facilityClass,
   legal_use:'public',ats_service:ats,operation_rules:'unknown',access_policy:'public',
   facility_kind:'aerodrome',name:site+' ('+icao+')',lat,lon,
   details:{icao,province,elevation:isSauceViejo?'18 m / 59 ft (AIP)':' '+meters+' m (ANAC, 2021)',
    ...(isSauceViejo?{runway:'03/21',dimensions:'2325 × 30 m (AIP histórico; verificar vigencia)',surface:'Asfalto',
      frequency:'TWR 118.95 / 118.45 MHz (AIRAC A 222/2025, verificar vigencia)'}:{}),
    permission:'Consultar AIP, MADHEL, NOTAM y condiciones vigentes antes de operar',
    notes:isSauceViejo?'AIP SUP A 126/2026 actualiza partes de SAAV. Pista y frecuencias son referencias documentales previas; verificar cambios posteriores.':'Catálogo ANAC de septiembre 2021. Clasificación, ATS y elevación son históricos: no corroboran el estado operacional actual.'},
   sourceUrl:isSauceViejo?'https://ais.anac.gob.ar/descarga/sup-6a1857d67f4ac':ANAC_2021_SOURCE,
   sourceLabel:isSauceViejo?'ANAC · SUP A 126/2026 (SAAV)':'ANAC · Nómina aeródromos y helipuertos 09/2021',
   sourceDate:isSauceViejo?'2026-05-28':'2021-09',
   sourceType:isSauceViejo?'publicacion_aip':'registro_anac_historico',
   classificationSourceUrl:ANAC_2021_SOURCE,classificationSourceDate:'2021-09',
   verification:isSauceViejo?'Suplemento AIP de 2026 identificado; consultar AIP y NOTAM vigentes.':'Referencia documental histórica de ANAC (2021). Vigencia operativa no verificada.'
  };
 }));
 root.AEROSUITE_OFFICIAL_AIRSTRIPS=Object.freeze({
  official:Object.freeze(official),lad:Object.freeze(lad),
  sources:Object.freeze({aip:AIP_SOURCE,madhel:MADHEL_SOURCE,lad:LAD_SOURCE}),
  catalogStatus:'parcial',ladEdition:published
 });
})(window);
