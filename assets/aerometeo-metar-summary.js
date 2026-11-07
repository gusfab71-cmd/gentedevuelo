/* AeroMeteo · Lectura PARCIAL conservadora de grupos METAR.
 * El texto original y su hora siguen siendo la autoridad.
 * No se infieren humedad, techo, visibilidad operacional ni aptitud VFR.
 */
(function(root){
 'use strict';
 function signed(token){
  if(!/^(?:M?\d{2})$/.test(token))return null;
  return token[0]==='M'?-Number(token.slice(1)):Number(token);
 }
 function decode(raw){
  const tokens=String(raw||'').trim().split(/\s+/).slice(0,100);
  const result={windDirection:null,windKt:null,gustKt:null,temperatureC:null,pressureHpa:null,cloudLabel:null};
  const wind=tokens.find(t=>/^(?:\d{3}|VRB)\d{2,3}(?:G\d{2,3})?KT$/.test(t));
  if(wind){
   const match=/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT$/.exec(wind);
   result.windDirection=match[1]==='VRB'?'Variable':Number(match[1]);
   result.windKt=Number(match[2]);
   result.gustKt=match[3]!==undefined?Number(match[3]):null;
  }
  const temp=tokens.find(t=>/^(?:M?\d{2})\/(?:M?\d{2}|\/\/)$/.test(t));
  if(temp)result.temperatureC=signed(temp.split('/')[0]);
  const qnh=tokens.find(t=>/^Q\d{4}$/.test(t));
  if(qnh){
   const hpa=Number(qnh.slice(1));
   if(hpa>=870&&hpa<=1085)result.pressureHpa=hpa;
  }
  const clouds=tokens.filter(t=>/^(?:FEW|SCT|BKN|OVC)\d{3}(?:CB|TCU)?$/.test(t));
  const other=tokens.find(t=>/^(?:CAVOK|SKC|NSC|NCD|VV\d{3})$/.test(t));
  result.cloudLabel=clouds.length?clouds.join(' · '):other||null;
  return result;
 }
 root.GDV_AEROMETEO_METAR=Object.freeze({decode});
 if(typeof module==='object'&&module.exports)module.exports={decode};
})(typeof window!=='undefined'?window:globalThis);
