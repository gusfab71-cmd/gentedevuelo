/* AeroMeteo · evolución horaria de modelos meteorológicos (punto consultado).
 * Dibuja únicamente valores horarios válidos entregados por Open-Meteo.
 * NO representa un campo nacional ni observaciones instrumentales.
 */
(function(root){
'use strict';
const NS='http://www.w3.org/2000/svg';
const VARIABLES=Object.freeze({
 wind:{key:'windKt',label:'Viento a 10 m',unit:'kt',minimum:0},
 rain:{key:'precipitationMm',label:'Precipitación horaria',unit:'mm',minimum:0,bar:true},
 cloud:{key:'cloudPct',label:'Nubosidad',unit:'%',minimum:0,maximum:100},
 temperature:{key:'temperatureC',label:'Temperatura a 2 m',unit:'°C'}
});
const fmt=n=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(n);
function element(tag,label,cls){
 const node=document.createElement(tag);
 if(label!==undefined&&label!==null)node.textContent=String(label);
 if(cls)node.className=cls;
 return node;
}
function svg(tag,props={},label){
 const node=document.createElementNS(NS,tag);
 for(const [key,value] of Object.entries(props))node.setAttribute(key,String(value));
 if(label!==undefined&&label!==null)node.textContent=String(label);
 return node;
}
function clock(iso){
 const date=new Date(iso);
 if(!Number.isFinite(date.getTime()))return 'Hora desconocida';
 return new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}
function series(data,metric){
 const cfg=VARIABLES[metric];
 if(!cfg||!Array.isArray(data?.forecast))return [];
 return data.forecast.slice(0,24).map(entry=>{
  const stamp=Date.parse(entry?.time);
  const raw=entry?.[cfg.key];
  return {
   iso:Number.isFinite(stamp)?entry.time:null,
   value:typeof raw==='number'&&Number.isFinite(raw)?raw:null
  };
 }).filter(entry=>entry.iso!==null);
}
function render(target,data,metric){
 if(!target)return false;
 target.replaceChildren();
 const cfg=VARIABLES[metric];
 if(!cfg)return false;
 const top=element('div',null,'am-hourly-heading');
 const title=element('strong','Evolución horaria · '+cfg.label);
 const label=element('span','MODELO · Open-Meteo');
 top.append(title,label);target.append(top);
 const rows=series(data,metric);
 const values=rows.filter(row=>row.value!==null).map(row=>row.value);
 if(rows.length<2||values.length<2){
  target.append(element('p','El pronóstico no contiene suficientes horarios válidos para mostrar este gráfico.','am-hourly-empty'));
  return false;
 }
 const WIDTH=680,HEIGHT=240,LEFT=54,RIGHT=20,TOP=26,BOTTOM=47;
 const chartWidth=WIDTH-LEFT-RIGHT,chartHeight=HEIGHT-TOP-BOTTOM;
 const minimum=cfg.minimum??Math.min(...values);
 const maximum=cfg.maximum??Math.max(...values);
 const delta=maximum-minimum;
 const padding=delta===0?(cfg.bar?1:Math.max(1,Math.abs(maximum)*.08)):delta*.12;
 const lo=cfg.minimum!==undefined?minimum:minimum-padding;
 const hi=cfg.maximum!==undefined?maximum:maximum+padding;
 const range=hi-lo||1;
 const x=i=>LEFT+(rows.length===1?.5:i/(rows.length-1))*chartWidth;
 const y=v=>TOP+(hi-v)/range*chartHeight;
 const chart=svg('svg',{viewBox:'0 0 680 240',role:'img',
  'aria-label':cfg.label+' de '+rows.length+' horas, solo modelo de pronóstico',focusable:'false'});
 for(let j=0;j<=4;j++){
  const val=lo+(hi-lo)*j/4,py=y(val);
  chart.append(svg('line',{x1:LEFT,y1:py,x2:WIDTH-RIGHT,y2:py,stroke:'#557180','stroke-width':1,'stroke-dasharray':'4 5'}));
  chart.append(svg('text',{x:LEFT-7,y:py+4,'text-anchor':'end',fill:'#d4e6ed','font-size':11},fmt(val)));
 }
 const pathSections=[];
 let current=[];
 rows.forEach((row,i)=>{
  if(row.value===null){if(current.length)pathSections.push(current);current=[];return}
  const cx=x(i),cy=y(row.value);
  if(cfg.bar){
   const barWidth=Math.min(40,chartWidth/(rows.length*1.6));
   const base=y(Math.max(lo,0));
   chart.append(svg('rect',{x:cx-barWidth/2,y:Math.min(cy,base),width:barWidth,height:Math.max(1,Math.abs(base-cy)),
    rx:3,fill:'#d8a755','fill-opacity':.86,stroke:'#ffe0a4','stroke-width':1}));
  }else{current.push([cx,cy]);}
  const dot=svg('circle',{cx,cy,r:cfg.bar?2.2:4,fill:'#ffc46d',stroke:'#fff1d1','stroke-width':1.3});
  dot.append(svg('title',{},clock(row.iso)+' · '+fmt(row.value)+' '+cfg.unit));
  chart.append(dot);
 });
 if(current.length)pathSections.push(current);
 for(const group of pathSections){
  if(group.length<2)continue;
  const p='M'+group.map(([cx,cy])=>cx.toFixed(1)+' '+cy.toFixed(1)).join(' L');
  chart.append(svg('path',{d:p,fill:'none',stroke:'#ffc46d','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'}));
 }
 const step=Math.max(1,Math.ceil(rows.length/6));
 rows.forEach((row,i)=>{
  if(i%step!==0&&i!==rows.length-1)return;
  chart.append(svg('text',{x:x(i),y:HEIGHT-14,'text-anchor':'middle',fill:'#d3e4e9','font-size':12},clock(row.iso)));
 });
 target.append(chart);
 const first=rows.find(row=>row.value!==null),last=[...rows].reverse().find(row=>row.value!==null);
 const summary=element('p',cfg.label+': '+fmt(Math.min(...values))+' a '+fmt(Math.max(...values))+' '+cfg.unit+
  '. Primer dato: '+clock(first.iso)+'; último: '+clock(last.iso)+' (hora argentina).','am-hourly-summary');
 const note=element('p','Valores estimados para un punto por Open-Meteo (CC BY 4.0), no mediciones ni METAR. Los horarios sin datos quedan sin trazo.','am-hourly-note');
 target.append(summary,note);
 return true;
}
root.GDV_AEROMETEO_HOURLY=Object.freeze({render,series,clock,VARIABLES});
if(typeof module==='object'&&module.exports)module.exports={render,series,clock,VARIABLES};
})(typeof window!=='undefined'?window:globalThis);
