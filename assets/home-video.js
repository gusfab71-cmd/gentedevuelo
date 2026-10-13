(() => {
  'use strict';
  const db = window.GDV_AUTH?.client;
  const el = id => document.getElementById(id);
  function parseVideo(value) {
    let u;
    try { u = new URL(value); } catch { return null; }
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    const h = u.hostname.toLowerCase(), p = u.pathname.split('/').filter(Boolean);
    if (['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(h)) {
      const id = h === 'youtu.be' ? p[0] : u.searchParams.get('v') || (['shorts','embed','live'].includes(p[0]) ? p[1] : '');
      if (!/^[a-zA-Z0-9_-]{11}$/.test(id || '')) return null;
      return {type:'iframe',src:'https://www.youtube-nocookie.com/embed/'+id};
    }
    if (['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(h)) {
      const id = p.find(x => /^\d+$/.test(x));
      return id ? {type:'iframe',src:'https://player.vimeo.com/video/'+id} : null;
    }
    if (h === 'iframe.videodelivery.net' && /^[a-zA-Z0-9]+$/.test(p[0] || ''))
      return {type:'iframe',src:'https://iframe.videodelivery.net/'+p[0]};
    if (/^customer-[a-z0-9]+\.cloudflarestream\.com$/.test(h) && /^[a-zA-Z0-9]+$/.test(p[0] || ''))
      return {type:'iframe',src:'https://'+h+'/'+p[0]+'/iframe'};
    if (/\.(mp4|webm|ogv)$/i.test(u.pathname)) return {type:'video',src:u.href};
    return null;
  }

  // Ubicación de video guardada en Supabase. Coordenadas relativas a la portada,
  // dimensiones verticales 9:16; en móviles siempre se respeta el flujo original.
  const originalPosition={pos_x_pct:null,pos_y_pct:null,width_px:null};
  let savedPosition={...originalPosition},draftPosition=null,editPanel=null,dragging=null,resizeHandle=null;
  const hero=()=>document.querySelector('.portada-completa');
  const isMobile=()=>matchMedia('(max-width:700px)').matches;
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  const isValidLayout=p=>p&&Number.isFinite(Number(p.pos_x_pct))&&Number.isFinite(Number(p.pos_y_pct))&&Number.isFinite(Number(p.width_px))
    &&p.pos_x_pct!==null&&p.pos_y_pct!==null&&p.width_px!==null;
  const pxGeometry=()=>{
    const box=hero()?.getBoundingClientRect();
    return box?{rect:box,w:box.width,h:box.height}:null;
  };
  function blocks() {
    return ['.portada-accesos','.atajos-portada','.menu-principal','.logo-emblema','.hero-titulo']
      .map(selector=>document.querySelector('.portada-completa '+selector))
      .filter(node=>node&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden')
      .map(node=>node.getBoundingClientRect());
  }
  function bounds(x,y,width){
    const geo=pxGeometry();
    if(!geo)return {x:0,y:0,width:224};
    const w=clamp(width,160,Math.min(360,geo.w-24));
    return {x:clamp(x,12,Math.max(12,geo.w-w-12)),
      y:clamp(y,70,Math.max(70,geo.h-w*16/9-12)),width:w};
  }
  function isFree(location) {
    const geo=pxGeometry();if(!geo)return false;
    const pad=8, cx=geo.rect.left+location.x, cy=geo.rect.top+location.y,
      right=cx+location.width, bottom=cy+location.width*16/9;
    return blocks().every(b=>right+pad<=b.left||cx-pad>=b.right||bottom+pad<=b.top||cy-pad>=b.bottom);
  }
  function locateUnobstructed(location){
    if(isFree(location))return location;
    const geo=pxGeometry();if(!geo)return location;
    let best=null,score=Infinity;
    for(let yy=72;yy<=Math.max(72,geo.h-location.width*16/9-12);yy+=18){
      for(let xx=12;xx<=Math.max(12,geo.w-location.width-12);xx+=18){
        const c=bounds(xx,yy,location.width);
        if(!isFree(c))continue;
        const distance=(c.x-location.x)**2+(c.y-location.y)**2;
        if(distance<score){best=c;score=distance;}
      }
    }
    return best||null;
  }
  function rawCardPosition(){
    const card=el('stolEnAccion'),geo=pxGeometry();
    if(!card||!geo)return bounds(geo?.w-246||0,geo?.h-430||0,224);
    const box=card.getBoundingClientRect();
    return bounds(box.left-geo.rect.left,box.top-geo.rect.top,box.width||224);
  }
  function pctToPixels(layout){
    const geo=pxGeometry();if(!geo)return bounds(0,0,224);
    return bounds(geo.w*Number(layout.pos_x_pct)/100,geo.h*Number(layout.pos_y_pct)/100,Number(layout.width_px));
  }
  function asStored(pixels){
    const geo=pxGeometry();
    if(!geo)return {...originalPosition};
    return {pos_x_pct:+(100*pixels.x/geo.w).toFixed(2),
      pos_y_pct:+(100*pixels.y/geo.h).toFixed(2),width_px:Math.round(pixels.width)};
  }
  function setPixels(pixels) {
    const card=el('stolEnAccion');if(!card)return;
    card.style.left=pixels.x+'px';card.style.top=pixels.y+'px';
    card.style.width=pixels.width+'px';card.style.right='auto';card.style.bottom='auto';
  }
  function resetPosition(){
    const card=el('stolEnAccion');if(!card)return;
    for(const key of ['left','top','width','right','bottom'])card.style[key]='';
  }
  function applyPosition(){
    const card=el('stolEnAccion');
    if(!card)return;
    if(isMobile()){resetPosition();return;}
    if(draftPosition){setPixels(bounds(draftPosition.x,draftPosition.y,draftPosition.width));return;}
    if(isValidLayout(savedPosition)){
      const p=locateUnobstructed(pctToPixels(savedPosition));
      if(p){setPixels(p);return;}
    }
    resetPosition();
  }
  function editorStatus(message){
    const notice=el('gdvVideoEditStatus');if(notice)notice.textContent=message;
  }
  function closeEditor(){
    dragging=null;draftPosition=null;editPanel?.remove();editPanel=null;resizeHandle?.remove();resizeHandle=null;
    el('stolEnAccion')?.classList.remove('gdv-video-editing');
    applyPosition();
    const url=new URL(location.href);url.searchParams.delete('editar-video');
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }
  function pointerStart(evt,type) {
    if(evt.button!==0||!draftPosition)return;
    evt.preventDefault();
    const card=el('stolEnAccion');if(!card)return;
    dragging={type,id:evt.pointerId,x:evt.clientX,y:evt.clientY,...draftPosition};
    card.setPointerCapture(evt.pointerId);
    editorStatus(type==='resize'?'Arrastrá la esquina para cambiar el tamaño.':'Arrastrá el recuadro a una zona libre.');
  }
  function pointerMove(evt){
    if(!dragging||evt.pointerId!==dragging.id)return;
    const dx=evt.clientX-dragging.x,dy=evt.clientY-dragging.y;
    const candidate=dragging.type==='resize'
      ?bounds(dragging.x===undefined?draftPosition.x:dragging.xpos,dragging.ypos,dragging.width+dx)
      :bounds(dragging.xpos+dx,dragging.ypos+dy,dragging.width);
    if(isFree(candidate)){
      draftPosition=candidate;setPixels(candidate);
      const slider=el('gdvVideoWidth');if(slider)slider.value=String(Math.round(candidate.width));
      editorStatus('Vista previa. Para publicar esta ubicación, pulsá Guardar posición.');
    } else editorStatus('Esa posición tapa otro elemento de la portada. Elegí un espacio libre.');
  }
  function pointerEnd(evt){
    if(!dragging||evt.pointerId!==dragging.id)return;
    const card=el('stolEnAccion');
    if(card?.hasPointerCapture(evt.pointerId))card.releasePointerCapture(evt.pointerId);
    dragging=null;
  }
  function canEdit(){
    return new URLSearchParams(location.search).get('editar-video')==='1'
      &&!!window.gdvLegacyAdmin&&!isMobile();
  }
  function openEditor(){
    const card=el('stolEnAccion');
    if(!canEdit()||!card||card.hidden||editPanel)return;
    // Primero usar la ubicación visible; cancelar restaura los valores de Supabase.
    draftPosition=rawCardPosition();
    if(!isFree(draftPosition)){
      const nearest=locateUnobstructed(draftPosition);
      if(nearest)draftPosition=nearest;
    }
    setPixels(draftPosition);
    card.classList.add('gdv-video-editing');
    const tools=document.createElement('div');
    tools.id='gdvVideoLayoutTools';tools.setAttribute('role','toolbar');tools.setAttribute('aria-label','Editor del video de portada');
    tools.innerHTML='<strong>EDITAR VIDEO DE PORTADA</strong><span>Arrastrá el recuadro. Cambiá el tamaño desde la esquina o con el control.</span>'+
       '<label> Tamaño <input id="gdvVideoWidth" aria-label="Ancho del video" type="range" min="160" max="360" step="4"></label>'+
       '<button type="button" id="gdvVideoSave">Guardar posición</button>'+
       '<button type="button" id="gdvVideoReset">Restaurar original</button>'+
       '<button type="button" id="gdvVideoCancel">Cancelar</button>'+
       '<span id="gdvVideoEditStatus" role="status" aria-live="polite"></span>';
    document.body.append(tools);editPanel=tools;
    const handle=document.createElement('div');
    handle.id='gdvVideoResizeHandle';handle.title='Arrastrá para agrandar o achicar el video';handle.setAttribute('aria-label','Cambiar tamaño');
    card.append(handle);resizeHandle=handle;
    el('gdvVideoWidth').value=String(Math.round(draftPosition.width));
    card.addEventListener('pointerdown',onVideoPointerDown);
    card.addEventListener('pointermove',pointerMove);
    card.addEventListener('pointerup',pointerEnd);
    card.addEventListener('pointercancel',pointerEnd);
    el('gdvVideoWidth').addEventListener('input',evt=>{
      if(!draftPosition)return;
      const p=bounds(draftPosition.x,draftPosition.y,Number(evt.target.value));
      if(isFree(p)){draftPosition=p;setPixels(p);editorStatus('Tamaño ajustado. Pulsá Guardar posición para publicarlo.');}
      else {evt.target.value=String(Math.round(draftPosition.width));editorStatus('Ese tamaño se superpone con otro elemento.');}
    });
    el('gdvVideoSave').addEventListener('click',async()=>{
      const btn=el('gdvVideoSave');if(!draftPosition)return;
      if(!isFree(draftPosition)){editorStatus('Mové el video a una zona libre antes de guardar.');return;}
      btn.disabled=true;editorStatus('Guardando ubicación en Supabase…');
      const payload=asStored(draftPosition);
      try{
        const {data,error}=await db.from('gdv_home_video').update({...payload,updated_at:new Date().toISOString()})
          .eq('id',1).select('id,pos_x_pct,pos_y_pct,width_px').maybeSingle();
        if(error||!data)throw Error(error?.message||'Permiso denegado');
        savedPosition={pos_x_pct:Number(data.pos_x_pct),pos_y_pct:Number(data.pos_y_pct),width_px:data.width_px};
        closeEditor();showToast('Ubicación y tamaño guardados. Ya están visibles para todos.');
      }catch(e){btn.disabled=false;editorStatus('No se pudo guardar: '+(e.message||'Error de conexión'));}
    });
    el('gdvVideoReset').addEventListener('click',async()=>{
      if(!confirm('¿Restaurar y guardar la ubicación original del video?'))return;
      const btn=el('gdvVideoReset');btn.disabled=true;editorStatus('Restaurando ubicación original…');
      try{
        const {data,error}=await db.from('gdv_home_video')
          .update({...originalPosition,updated_at:new Date().toISOString()}).eq('id',1).select('id').maybeSingle();
        if(error||!data)throw Error(error?.message||'Permiso denegado');
        savedPosition={...originalPosition};
        closeEditor();showToast('Ubicación original restaurada para todos.');
      }catch(e){btn.disabled=false;editorStatus('No se pudo restaurar: '+(e.message||'Error de conexión'));}
    });
    el('gdvVideoCancel').addEventListener('click',closeEditor);
    editorStatus('Mové el video con el mouse y guardá. En celulares no se modifica la posición.');
  }
  function onVideoPointerDown(evt){
    if(!editPanel||evt.target.closest('#gdvVideoLayoutTools'))return;
    if(!dragging){
      const p=draftPosition||rawCardPosition();
      draftPosition=p;
      dragging={type:evt.target.closest('#gdvVideoResizeHandle')?'resize':'move',
        id:evt.pointerId,x:evt.clientX,y:evt.clientY,
        xpos:p.x,ypos:p.y,width:p.width};
      evt.preventDefault();evt.currentTarget.setPointerCapture(evt.pointerId);
    }
  }
  function showToast(message){
    const tag=document.createElement('div');tag.className='gdv-video-toast';tag.textContent=message;
    document.body.append(tag);setTimeout(()=>tag.remove(),4700);
  }
  function syncEditor(){
    if(new URLSearchParams(location.search).get('editar-video')!=='1')return;
    if(isMobile()){showToast('Para mover el video, abrí la portada en una PC. En celular permanece al final.');return;}
    if(window.gdvLegacyAdmin)openEditor();
  }
  window.addEventListener('gdv-admin-ready',e=>{if(e.detail?.isAdmin)syncEditor();});
  window.addEventListener('resize',()=>{if(!dragging)applyPosition();});

  // Iniciar la reproducción sin audio: los navegadores suelen bloquear el autoplay con sonido.
  function autoplayIframeSrc(src) {
    const url = new URL(src);
    const host = url.hostname.toLowerCase();
    if (host === 'www.youtube-nocookie.com') {
      url.searchParams.set('autoplay','1');
      url.searchParams.set('mute','1');
      url.searchParams.set('playsinline','1');
    } else if (host === 'player.vimeo.com') {
      url.searchParams.set('autoplay','1');
      url.searchParams.set('muted','1');
      url.searchParams.set('playsinline','1');
    } else if (host === 'iframe.videodelivery.net' || host.endsWith('.cloudflarestream.com')) {
      url.searchParams.set('autoplay','true');
      url.searchParams.set('muted','true');
    }
    return url.href;
  }
  async function home() {
    const area=el('gdvStolPlayer'), card=el('stolEnAccion');
    if(!db||!area||!card)return;
    card.hidden=true; // No dejar un recuadro vacío mientras falta cargar el video.
    try {
      const {data,error}=await db.from('gdv_home_video')
        .select('video_url,is_active,pos_x_pct,pos_y_pct,width_px').eq('id',1).maybeSingle();
      if(error||data?.is_active===false)return;
      savedPosition=data?{pos_x_pct:data.pos_x_pct,pos_y_pct:data.pos_y_pct,width_px:data.width_px}:{...originalPosition};
      const r=parseVideo(data?.video_url||'');
      if(!r)return;
      const node=document.createElement(r.type==='video'?'video':'iframe');
      node.src=r.type==='iframe'?autoplayIframeSrc(r.src):r.src;
      node.setAttribute('title','Video de portada');
      if(r.type==='video'){
        node.controls=true;
        node.autoplay=true;
        node.muted=true;
        node.defaultMuted=true;
        node.setAttribute('muted','');
        node.playsInline=true;
        node.setAttribute('playsinline','');
        node.preload='auto';
      } else {
        node.loading='eager';
        node.allow='autoplay; encrypted-media; picture-in-picture; web-share';
        node.allowFullscreen=true;
      }
      area.replaceChildren(node);
      card.hidden=false;
      applyPosition();
      syncEditor();
      if(r.type==='video')node.play().catch(()=>{});
    } catch(err) { console.warn('No se pudo cargar el video de portada:',err); }
  }
  async function admin() {
    const box=el('gdvStolAdmin'); if(!box||!db)return;box.hidden=false;
    const {data,error}=await db.from('gdv_home_video').select('title,video_url,is_active').eq('id',1).maybeSingle();
    el('gdvStolAdminStatus').textContent=error?'Error al consultar video: '+error.message:'';
    if(data){el('gdvStolInputTitle').value=data.title;el('gdvStolInputUrl').value=data.video_url;el('gdvStolActive').checked=data.is_active!==false;}
  }
  async function save(evt) {
    evt.preventDefault();
    const url=el('gdvStolInputUrl').value.trim(),title=el('gdvStolInputTitle').value.trim(), status=el('gdvStolAdminStatus');
    if(url&&!parseVideo(url)){status.textContent='Enlace no compatible. Usá YouTube, Vimeo, Cloudflare Stream o MP4/WebM.';return;}
    if(!title){status.textContent='Ingresá un título.';return;}
    const btn=el('gdvStolSave');btn.disabled=true;
    const {data,error}=await db.from('gdv_home_video').update({title,video_url:url,is_active:el('gdvStolActive').checked,updated_at:new Date().toISOString()}).eq('id',1).select('id').maybeSingle();
    btn.disabled=false;
    status.textContent=error?'No se pudo guardar: '+error.message:!data?'Permiso denegado.':'Video actualizado en la portada.';
  }
  function preview() {
    const area=el('gdvStolPreview'),status=el('gdvStolAdminStatus');
    if(!area)return;
    const r=parseVideo(el('gdvStolInputUrl').value.trim());
    if(!r){status.textContent='Agregá un enlace compatible para previsualizar.';area.hidden=true;return;}
    const node=document.createElement(r.type==='video'?'video':'iframe');
    node.src=r.src;node.title='Vista previa del video de portada';node.style.cssText='width:100%;height:100%;border:0;display:block;';
    if(r.type==='video'){node.controls=true;node.playsInline=true;node.preload='metadata';}
    else {node.allow='encrypted-media; picture-in-picture; web-share';node.allowFullscreen=true;}
    area.replaceChildren(node);area.hidden=false;
    status.textContent='Vista previa. Guardá para publicar el cambio.';
  }
  async function validatePortrait(file) {
    const blobUrl=URL.createObjectURL(file);
    const video=document.createElement('video');
    video.preload='metadata';
    video.muted=true;
    video.playsInline=true;
    try {
      const dimensions=await new Promise((resolve,reject)=>{
        video.onloadedmetadata=()=>resolve({width:video.videoWidth,height:video.videoHeight});
        video.onerror=()=>reject(new Error('No se pudieron leer las dimensiones del archivo.'));
        video.src=blobUrl;
      });
      const ratio=dimensions.width/dimensions.height;
      if (!Number.isFinite(ratio) || dimensions.height < dimensions.width || Math.abs(ratio-9/16)>0.045)
        throw new Error('El video debe estar grabado en vertical 9:16 (por ejemplo, 1080 × 1920 píxeles).');
      return dimensions;
    } finally {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(blobUrl);
    }
  }
  async function upload() {
    const file=el('gdvStolUpload')?.files?.[0],status=el('gdvStolAdminStatus'),btn=el('gdvStolUploadBtn');
    if(!file){status.textContent='Elegí primero un video MP4 o WebM.';return;}
    if(!['video/mp4','video/webm'].includes(file.type)||file.size>40*1024*1024||file.size===0){
      status.textContent='Usá un video MP4 o WebM de hasta 40 MB.';return;
    }
    if(!window.GDV_R2_MEDIA?.upload){status.textContent='No está disponible el servicio de carga a Cloudflare.';return;}
    btn.disabled=true;status.textContent='Comprobando formato vertical 9:16…';
    try{
      await validatePortrait(file);
      status.textContent='Subiendo video vertical a Cloudflare R2…';
      const cfg=window.GDV_CONFIG;
      const uploaded=await window.GDV_R2_MEDIA.upload(file,db,cfg.url,cfg.key);
      el('gdvStolInputUrl').value=uploaded.url;
      preview();
      status.textContent='Video vertical cargado en Cloudflare. Guardá para publicarlo en la portada.';
    }catch(err){status.textContent='Error al subir video: '+(err.message||'Reintentá.');}
    finally{btn.disabled=false;}
  }
  window.GDV_STOL_VIDEO={admin,parseVideo};
  const start=()=>{el('gdvStolForm')?.addEventListener('submit',save);el('gdvStolPreviewBtn')?.addEventListener('click',preview);el('gdvStolUploadBtn')?.addEventListener('click',upload);home();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();