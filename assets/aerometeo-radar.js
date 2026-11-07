/* AeroMeteo · Radar de ecos de precipitación (histórico) · DEMOSTRACIÓN.
 * RainViewer Weather Maps API: solo imágenes pasadas, esquema Universal Blue 2,
 * zoom nativo <=7, sin pronóstico ni alerta de tormentas. Uso educativo/comunitario;
 * verificar autorización para cualquier integración comercial antes de producción.
 */
(function(root){
'use strict';
const API='https://api.rainviewer.com/public/weather-maps.json';
const CREDIT='Weather data by <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">RainViewer</a>';
const MAX_NATIVE_ZOOM=7;
const MIN_FRAME_STEP_MS=6500; // Límite conservador: menos mosaicos por minuto, sin precargar 13 cuadros.
const $=id=>document.getElementById(id);
function validManifest(value,nowSeconds=Date.now()/1000){
 if(!value||typeof value!=='object')throw Error('La fuente no entregó metadatos del radar.');
 const host=typeof value.host==='string'?value.host.replace(/\/$/,''):'';
 if(!/^https:\/\/(?:[a-z0-9-]+\.)+rainviewer\.com$/i.test(host))
  throw Error('El servidor de mosaicos no está autorizado.');
 const past=Array.isArray(value.radar?.past)?value.radar.past:[];
 const seen=new Set(),frames=[];
 for(const item of past){
  const path=item?.path,time=Number(item?.time);
  if(typeof path!=='string'||!/^\/v2\/radar\/[a-z0-9]{6,64}$/i.test(path)||
     !Number.isInteger(time)||time<nowSeconds-5*3600||time>nowSeconds+300||
     seen.has(time))continue;
  seen.add(time);
  frames.push({path,time});
 }
 frames.sort((a,b)=>a.time-b.time);
 if(!frames.length)throw Error('No hay imágenes históricas disponibles en el radar.');
 return {host,frames:frames.slice(-13),generated:Number(value.generated)||null};
}
function frameUrl(host,frame){
 if(!/^https:\/\/(?:[a-z0-9-]+\.)+rainviewer\.com$/i.test(host)||!/^\/v2\/radar\/[a-z0-9]{6,64}$/i.test(frame?.path||''))
  throw Error('URL radar no válida');
 return host+frame.path+'/256/{z}/{x}/{y}/2/1_1.png';
}
function timestamp(utc){
 return new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',
   hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',hour12:false}).format(new Date(utc*1000))+' ART';
}
function animationIndices(length){
 if(!Number.isInteger(length)||length<1)return [];
 // Recorre hasta seis imágenes espaciadas a lo largo de las últimas dos horas,
 // y limita el tráfico de teselas para respetar la cuota comunitaria.
 const span=Math.min(5,length-1),result=[];
 for(let i=0;i<=span;i++){
  const index=Math.round((length-1)*i/Math.max(1,span));
  if(!result.includes(index))result.push(index);
 }
 return result;
}
function boot({map,L}){
 const toggle=$('aerometeo-radar-toggle'),panel=$('am-radar-panel'),status=$('am-radar-status'),
  time=$('am-radar-time'),refresh=$('am-radar-refresh'),prev=$('am-radar-prev'),
  next=$('am-radar-next'),play=$('am-radar-play'),slider=$('am-radar-frame');
 if(!map||!L||!toggle||!panel||!slider||!status||!time||!play)return null;
 let enabled=false,busy=false,request=0,frames=[],host='',index=-1,layer=null,playing=false,timer=null,lastLoaded=0;
 function say(message){status.textContent=message}
 function stop(){
  if(timer!==null){clearInterval(timer);timer=null;}
  playing=false;play.textContent='▶ Reproducir';play.setAttribute('aria-label','Reproducir imágenes históricas');
 }
 function showIndex(nextIndex){
  if(!enabled||!frames.length)return;
  const i=Math.max(0,Math.min(frames.length-1,Math.floor(Number(nextIndex))));
  if(!Number.isFinite(i))return;
  index=i;
  const src=frameUrl(host,frames[i]);
  if(!layer){
   layer=L.tileLayer(src,{
    attribution:CREDIT,opacity:.76,tileSize:256,maxNativeZoom:MAX_NATIVE_ZOOM,maxZoom:19,
    updateWhenIdle:true,keepBuffer:1,errorTileUrl:''
   });
   layer.addTo(map);
  }else{
   layer.setUrl(src);
  }
  slider.value=String(i);
  const ageMin=Math.max(0,Math.floor((Date.now()/1000-frames[i].time)/60));
  time.textContent=timestamp(frames[i].time);
  say('Imagen '+(i+1)+' de '+frames.length+' · '+ageMin+' min atrás. Ecos de precipitación; no son alertas.');
 }
 async function load(force=false){
  if(busy||!enabled)return;
  if(!force&&frames.length&&Date.now()-lastLoaded<8*60000){
   showIndex(index<0?frames.length-1:index);
   return;
  }
  stop();busy=true;const current=++request;
  refresh.disabled=true;
  say('Consultando imágenes históricas de RainViewer…');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9500);
  try{
   const response=await fetch(API,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('El servicio radar no respondió (HTTP '+response.status+').');
   const data=validManifest(await response.json());
   if(current!==request||!enabled)return;
   frames=data.frames;host=data.host;lastLoaded=Date.now();index=frames.length-1;
   slider.min='0';slider.max=String(index);
   slider.disabled=false;prev.disabled=false;next.disabled=false;play.disabled=frames.length<2;
   showIndex(index);
   if(data.generated&&Date.now()/1000-data.generated>40*60){
    say('Atención: catálogo radar desactualizado; verificá la fecha de cada imagen.');
   }
  }catch(err){
   if(current!==request||!enabled)return;
   frames=[];index=-1;
   if(layer){map.removeLayer(layer);layer=null;}
   slider.disabled=true;prev.disabled=true;next.disabled=true;play.disabled=true;
   time.textContent='Sin imágenes';
   say((err?.name==='AbortError'?'El servicio radar demoró demasiado.':
      err?.message||'No se pudo cargar el radar.')+' Podés reintentar o consultar SINARAME.');
  }finally{clearTimeout(timeout);busy=false;refresh.disabled=false}
 }
 function setEnabled(value){
  enabled=Boolean(value);request++;
  stop();toggle.setAttribute('aria-pressed',String(enabled));
  toggle.setAttribute('aria-expanded',String(enabled));
  toggle.classList.toggle('is-selected',enabled);
  panel.hidden=!enabled;
  if(!enabled){
   if(layer){map.removeLayer(layer);layer=null;}
   return;
  }
  void load();
 }
 function goStep(direction){
  stop();
  showIndex(index+direction);
 }
 function playFrames(){
  if(!enabled||frames.length<2)return;
  if(playing){stop();return;}
  playing=true;play.textContent='❚❚ Pausar';play.setAttribute('aria-label','Pausar animación');
  const selected=animationIndices(frames.length);
  const next=selected.find(i=>i>index);
  showIndex(next===undefined?selected[0]:next);
  timer=setInterval(()=>{
   if(document.hidden||!enabled){stop();return}
   const nextIndex=selected.find(i=>i>index);
   showIndex(nextIndex===undefined?selected[0]:nextIndex);
  },MIN_FRAME_STEP_MS);
 }
 toggle.addEventListener('click',()=>setEnabled(!enabled));
 refresh.addEventListener('click',()=>{if(enabled)void load(true)});
 prev.addEventListener('click',()=>goStep(-1));
 next.addEventListener('click',()=>goStep(1));
 slider.addEventListener('input',()=>{stop();showIndex(slider.value)});
 play.addEventListener('click',playFrames);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
 root.addEventListener('pagehide',stop);
 return {disable:()=>setEnabled(false),enable:()=>setEnabled(true),state:()=>({enabled,index,frames:frames.length,playing})};
}
root.GDV_AEROMETEO_RADAR={boot,validManifest,frameUrl,animationIndices,MAX_NATIVE_ZOOM,MIN_FRAME_STEP_MS};
if(typeof module==='object'&&module.exports)module.exports={boot,validManifest,frameUrl,animationIndices,MAX_NATIVE_ZOOM,MIN_FRAME_STEP_MS};
})(typeof window!=='undefined'?window:globalThis);
