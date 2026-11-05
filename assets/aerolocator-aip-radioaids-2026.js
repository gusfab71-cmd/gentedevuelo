/* AeroLocator · cotejo documental parcial de frecuencias ENR 4.1.
 * Referencia: ANAC SUP AIRAC A 21/2026, efectivo 19-02-2026.
 * Una coincidencia NO certifica que la radioayuda esté actualmente operativa.
 * La fuente vigente (AIP, posteriores AMDT/SUP y NOTAM) siempre prevalece.
 */
(function(root){
'use strict';
const sourceUrl='https://ais.anac.gob.ar/descarga/sup-69724d5ec6f96';
const aipUrl='https://ais.anac.gob.ar/aip';
const notamUrl='https://ais.anac.gob.ar/notam';
const ndb={PDI:325,ILM:210,SVO:405,GES:242,MBI:345};
const vor={GBE:115.6,GPI:112.2,NIN:116.1,PTA:113.7,LYE:116.3,MJZ:114.7,
 SDE:114.8,USU:113.7,VIE:117.1};
const vorDme={BCA:114.3,CAT:114.3,IGU:114.1,ERE:115.5,OEL:113.4,CRV:117.5,
 CBA:114.5,CRS:115.4,ECA:114.7,PAL:115.2,ESQ:117.8,EZE:116.5,
 FSA:115.6,GUA:113.2,JUJ:112.9,LAR:113.5,MLG:117.2,MDP:116.2,
 DOZ:114.9,NEU:116.7,PAR:116.8,POS:114.9,DRY:116.1,PDI:114.1,
 RTA:117.1,SIS:115.1,RCU:114.2,GAL:116.7,GRA:117.3,
 ROS:117.3,SAL:116.7,SNT:117.7,BAR:117.4,FDO:114.4,JUA:113.1,SJU:117.7};
const index=new Map();
for(const [type,records] of [['NDB',ndb],['VOR',vor],['VOR-DME',vorDme]]){
 for(const [ident,frequency] of Object.entries(records))
  index.set(type+':'+ident,frequency);
}
function compare(record){
 const type=String(record.type||'').toUpperCase();
 const ident=String(record.ident||'').trim().toUpperCase();
 const key=type+':'+ident;
 if(!index.has(key))return {status:'not-compared'};
 const referenceFrequency=index.get(key);
 const frequency=Number(record.frequency);
 if(!Number.isFinite(frequency)||frequency<=0)return {status:'frequency-missing',referenceFrequency};
 return {status:Math.abs(frequency-referenceFrequency)<0.0001?'document-match':'frequency-difference',
  referenceFrequency};
}
root.GDV_NAVAIDS_AIP=Object.freeze({compare,sourceUrl,aipUrl,notamUrl,
 referenceDate:'2026-02-19',totalRecords:index.size});
})(typeof window!=='undefined'?window:globalThis);
