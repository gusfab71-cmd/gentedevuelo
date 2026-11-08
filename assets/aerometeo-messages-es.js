/* AeroMeteo · Interpretación PARCIAL de METAR y TAF en español sencillo.
 * El mensaje original es la fuente; jamás se determina aptitud operativa ni VFR/IFR.
 * No se deducen datos que el texto no contiene. Horas de grupos TAF expresadas en UTC.
 */
(function(root){
'use strict';
const LIMIT=4200;
const cloudWord={FEW:'Pocas nubes',SCT:'Nubes dispersas',BKN:'Cielo mayormente nublado',OVC:'Cielo cubierto'};
const weatherWord={
 TSRA:'tormenta con lluvia',TS:'tormenta eléctrica',SHRA:'chubascos de lluvia',
 RA:'lluvia',DZ:'llovizna',SN:'nieve',SHSN:'chubascos de nieve',
 FG:'niebla',BR:'neblina',HZ:'calima',GR:'granizo',GS:'granizo pequeño',
 FZRA:'lluvia engelante',FZDZ:'llovizna engelante',SQ:'turbonada',
 FU:'humo',DU:'polvo en suspensión',SA:'arena'
};
function cardinal(angle){
 const names=['norte','noreste','este','sudeste','sur','sudoeste','oeste','noroeste'];
 return names[Math.round(angle/45)%8];
}
function wind(tokens){
 const token=tokens.find(x=>/^(?:\d{3}|VRB)\d{2,3}(?:G\d{2,3})?KT$/.test(x));
 if(!token)return null;
 const m=/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT$/.exec(token);
 const angle=m[1]==='VRB'?null:Number(m[1]),speed=Number(m[2]);
 if(angle===0&&speed===0)return 'Viento en calma.';
 const direction=angle===null?'de dirección variable':
  'desde el '+cardinal(angle)+' ('+angle+'°)';
 return 'Viento '+direction+' a '+speed+' nudos'+
   (m[3]?' con ráfagas de '+Number(m[3])+' nudos':'')+'.';
}
function visibility(tokens){
 if(tokens.includes('CAVOK'))return 'CAVOK: visibilidad de al menos 10 km, sin nubes de importancia operacional ni fenómenos significativos, según el código.';
 // No se intenta decodificar visibilidad expresada en millas terrestres (SM).
 const windAt=tokens.findIndex(x=>/^(?:\d{3}|VRB)\d{2,3}(?:G\d{2,3})?KT$/.test(x));
 const look=windAt>=0?tokens.slice(windAt+1,windAt+4):tokens;
 const token=look.find(x=>/^\d{4}$/.test(x));
 if(!token)return null;
 const metres=Number(token);
 return token==='9999'?'Visibilidad horizontal de 10 km o más.':
  'Visibilidad horizontal indicada: '+(metres>=1000?(metres/1000).toLocaleString('es-AR')+' km':metres+' metros')+'.';
}
function phenomena(tokens){
 const found=[];
 for(const item of tokens){
  const trimmed=item.replace(/^[+-]/,'');
  if(!Object.prototype.hasOwnProperty.call(weatherWord,trimmed))continue;
  const label=weatherWord[trimmed];
  const level=item.startsWith('+')?'intensa':item.startsWith('-')?'débil':null;
  const phrase=level?label+' ('+level+')':label;
  if(!found.includes(phrase))found.push(phrase);
  if(found.length===2)break;
 }
 return found.length?'Fenómenos informados: '+found.join(' y ')+'.':null;
}
function clouds(tokens){
 if(tokens.includes('CAVOK'))return null;
 const found=[];
 for(const item of tokens){
  const m=/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/.exec(item);
  if(!m)continue;
  const base=Number(m[2])*100;
  found.push(cloudWord[m[1]]+' con base aproximada a '+base.toLocaleString('es-AR')+
   ' pies sobre el aeródromo'+(m[3]==='CB'?' (cumulonimbos)':
    m[3]==='TCU'?' (nubes de gran desarrollo vertical)':''));
  if(found.length===3)break;
 }
 if(found.length)return 'Nubes: '+found.join('; ')+'.';
 if(tokens.includes('NSC'))return 'No se informan nubes significativas (NSC).';
 if(tokens.includes('SKC'))return 'Cielo despejado según el reporte (SKC).';
 if(tokens.includes('NCD'))return 'El sistema automático no detectó nubes (NCD).';
 const vv=tokens.find(x=>/^VV\d{3}$/.test(x));
 if(vv)return 'Visibilidad vertical indicada: '+(Number(vv.slice(2))*100).toLocaleString('es-AR')+' pies.';
 return null;
}
function temperature(tokens){
 const token=tokens.find(x=>/^(?:M?\d{2})\/(?:M?\d{2}|\/\/)$/.test(x));
 if(!token)return null;
 const [t,d]=token.split('/');
 const val=x=>x.startsWith('M')?-Number(x.slice(1)):Number(x);
 return 'Temperatura: '+val(t)+' °C'+(d==='//'?' (sin punto de rocío informado)':
  '; punto de rocío: '+val(d)+' °C')+'.';
}
function pressure(tokens){
 const token=tokens.find(x=>/^Q\d{4}$/.test(x));
 if(!token)return null;
 const p=Number(token.slice(1));
 return p>=870&&p<=1085?'Presión atmosférica de referencia (QNH): '+p+' hPa.':null;
}
function standardLines(tokens,type){
 const lines=[wind(tokens),visibility(tokens),phenomena(tokens),clouds(tokens)];
 if(type==='metar')lines.push(temperature(tokens),pressure(tokens));
 return lines.filter(Boolean);
}
function atDayTime(day,hour,minute='00'){
 return 'día '+day+', '+hour+':'+minute+' UTC';
}
function period(segment){
 const m=/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(segment||'');
 if(!m)return null;
 return 'desde el '+atDayTime(m[1],m[2])+' hasta el '+atDayTime(m[3],m[4]);
}
function heading(type,window){
 if(type==='TEMPO')return 'Temporalmente '+(window||'en el período indicado');
 if(type==='BECMG')return 'Cambio gradual '+(window||'en el período indicado');
 if(type==='PROB30'||type==='PROB40')return (type==='PROB30'?'30 %':'40 %')+' de probabilidad '+(window||'durante el período indicado');
 if(type==='FM'){
  const match=/^FM(\d{2})(\d{2})(\d{2})$/.exec(window||'');
  return match?'Desde el '+atDayTime(match[1],match[2],match[3]):'Desde un cambio indicado en el reporte';
 }
 return 'Previsión inicial';
}
function tafSections(tokens){
 // El encabezado no es meteorología: TAF [AMD/COR] OACI DDHHMMZ DDHH/DDHH.
 let i=0;
 if(tokens[i]==='TAF')i++;
 if(tokens[i]==='AMD'||tokens[i]==='COR')i++;
 if(/^[A-Z]{4}$/.test(tokens[i]||''))i++;
 if(/^\d{6}Z$/.test(tokens[i]||''))i++;
 const valid=/^\d{4}\/\d{4}$/.test(tokens[i]||'')?tokens[i++]:null;
 const groups=[{type:'BASE',window:null,tokens:[]}];
 while(i<tokens.length){
  const token=tokens[i++];
  if(token==='RMK'||token==='=')break;
  if(/^FM\d{6}$/.test(token)){
   groups.push({type:'FM',window:token,tokens:[]});continue;
  }
  if(token==='TEMPO'||token==='BECMG'||token==='PROB30'||token==='PROB40'){
   let type=token;
   if((type==='PROB30'||type==='PROB40')&&tokens[i]==='TEMPO'){
    type+=' TEMPO';i++;
   }
   const window=/^\d{4}\/\d{4}$/.test(tokens[i]||'')?tokens[i++]:null;
   groups.push({type,window,tokens:[]});continue;
  }
  groups[groups.length-1].tokens.push(token);
 }
 return {valid,groups};
}
function explain(raw,type){
 if(type!=='metar'&&type!=='taf')return [];
 if(typeof raw!=='string'||!raw.trim())return [];
 // El código no es una interpretación normativa completa y nunca informa "apto para volar".
 const tokens=raw.trim().toUpperCase().slice(0,LIMIT).replace(/=/g,' = ').split(/\s+/).filter(Boolean);
 if(type==='metar'){
  const body=tokens.slice(0,tokens.indexOf('RMK')>=0?tokens.indexOf('RMK'):undefined);
  const lines=standardLines(body,'metar');
  if(body.includes('NOSIG'))lines.push('Tendencia NOSIG: no se indican cambios significativos en el período de tendencia.');
  if(!lines.length)lines.push('Este reporte contiene códigos que no podemos explicar con suficiente seguridad.');
  return lines.slice(0,9);
 }
 const {valid,groups}=tafSections(tokens);
 const lines=[];
 if(valid)lines.push('Período del TAF indicado en el texto: '+(period(valid)||valid)+'.');
 for(const group of groups.slice(0,5)){
  const label=group.type.startsWith('PROB')&&group.type.includes('TEMPO')?
   (group.type.startsWith('PROB30')?'30 %':'40 %')+' de probabilidad de condiciones temporales '+(period(group.window)||'en el período indicado'):
   heading(group.type,group.window?period(group.window)||group.window:group.window);
  const details=standardLines(group.tokens,'taf');
  if(details.length)lines.push(label+': '+details.join(' '));
  else if(group.type!=='BASE')lines.push(label+': consultar los códigos originales para los detalles.');
 }
 if(groups.length>5)lines.push('Hay más períodos o cambios que no se muestran en este resumen.');
 if(!lines.length)lines.push('No se pudieron interpretar con seguridad los grupos de este TAF.');
 return lines.slice(0,8);
}
root.GDV_AEROMETEO_MESSAGES=Object.freeze({explain});
if(typeof module==='object'&&module.exports)module.exports={explain};
})(typeof window!=='undefined'?window:globalThis);
