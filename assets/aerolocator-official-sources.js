/* AeroLocator · referencias oficiales y lectura del padrón ANAC septiembre 2026.
 * No descarga NOTAM/MADHEL en vivo: enlaces de consulta manual a los organismos.
 * No atribuir categoría ATS, permiso u operatividad al inventario documental.
 */
(function(root){
 'use strict';
 const urls=Object.freeze({
  madhel:'https://ais.anac.gob.ar/madhel/',
  aip:'https://ais.anac.gob.ar/aip',
  amdt:'https://ais.anac.gob.ar/amdt',
  sup:'https://ais.anac.gob.ar/sup',
  notam:'https://ais.anac.gob.ar/notam',
  sna:'https://www.argentina.gob.ar/orsna/aeropuertos-0',
  snatax:'https://www.argentina.gob.ar/orsna/aeropuertos/sistema-nacional-de-aeropuertos',
  anac:'https://datos.transporte.gob.ar/dataset/aerodromos',
  lad:'https://www.argentina.gob.ar/anac/infraestructura-y-servicios-aeroportuarios/aerodromos',
  metar:'https://ws2.smn.gob.ar',
  taf:'https://ws2.smn.gob.ar/pron%C3%B3stico-de-aer%C3%B3dromo-taf',
  pronarea:'https://ws2.smn.gob.ar/pron%C3%B3stico-de-areas'
 });
 const normalized=(x)=>String(x||'').trim().toUpperCase();
 function sourceLinks({document='',sna='',lad=false}={}){
  const doc=normalized(document);
  const source=(id,label,note)=>({id,label,url:urls[id],note});
  const links=[];
  if(lad)links.push(source('lad','ANAC · LAD','Listado y trámites de LAD'));
  if(doc==='MADHEL'){
   links.push(source('madhel','MADHEL electrónico','Buscar por OACI o nombre'));
   links.push(source('aip','AIP Argentina · AD','Verificar información publicada'));
  }else{
   links.push(source('aip','AIP Argentina · AD','Consultar carta y documentación AD'));
   links.push(source('madhel','MADHEL electrónico','Buscar por OACI o nombre'));
  }
  links.push(source('notam','NOTAM activos · ANAC','Consulta externa de avisos A/C; no es PIB'));
  links.push(source('sup','Suplementos AIP A/B','Cambios temporales publicados'));
  links.push(source('amdt','Enmiendas AIRAC','Comprobar fecha de efectividad'));
  if(['SI','SNA'].includes(normalized(sna)))links.push(source('sna','ORSNA · Aeropuertos','El padrón ANAC lo identifica en el SNA; comprobar vigencia'));
  links.push(source('taf','SMN · TAF','Pronóstico aeronáutico cuando esté disponible'));
  links.push(source('pronarea','SMN · PRONAREA','Pronóstico de área; consultar FIR y vigencia'));
  return links;
 }
 // Datos textuales del padrón: el original siempre prevalece como referencia.
 function runwaySummary(raw,isHeli=false){
  const source=String(raw||'');
  const parsed=[];
  if(isHeli){
   const rx=/FATO\s*:?\s*(?:Circular\s+de\s+)?(\d+(?:[.,]\d+)?)\s*(?:[xX×]\s*(\d+(?:[.,]\d+)?))?\s*M\b/gi;
   for(const match of source.matchAll(rx)){
    const length=Number(match[1].replace(',','.'));
    const width=match[2]?Number(match[2].replace(',','.')):null;
    if(length>0&&length<=500&&(!width||width<=500))
     parsed.push({name:'FATO',lengthMeters:length,widthMeters:width});
   }
  }else{
   const rx=/(\d{1,2}(?:\s*[LR])?\s*\/\s*\d{1,2}(?:\s*[LR])?)\s*-?\s*(\d{1,2}[.]\d{3}|\d{2,5})\s*[xX×]\s*(\d{1,4})\s*(?:M\b)?/gi;
   for(const match of source.matchAll(rx)){
    const length=Number(match[2].replace('.','')),width=Number(match[3]);
    if(length>0&&length<=10000&&width>0&&width<=250)
     parsed.push({name:match[1].replace(/\s+/g,' ').trim(),lengthMeters:length,widthMeters:width});
   }
  }
  const display=parsed.map(item=>
   item.name+': '+item.lengthMeters+' × '+(item.widthMeters??'s/d')+' m').join(' · ');
  const surface=[];
  const add=(key,label)=>{if(key.test(source))surface.push(label)};
  add(/\bASPH\b|\bASFALTO\b|\bASPHALT\b/i,'Asfalto');
  add(/\bCONC\b|\bCONCRETO\b|\bHORMIGON\b/i,'Hormigón');
  add(/\bTIERRA\b|\bSUELO NATURAL\b/i,'Tierra');
  add(/\bC[ÉE]SPED\b|\bGRASS\b/i,'Césped');
  add(/\bRIPIO\b|\bGRAVEL\b/i,'Ripio');
  return {parsed,display,surface:surface.join(' / ')};
 }
 root.GDV_OFFICIAL_SOURCES=Object.freeze({urls,sourceLinks,runwaySummary});
})(window);
