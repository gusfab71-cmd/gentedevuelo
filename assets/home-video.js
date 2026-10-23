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
    if (/\.(jpe?g|png|webp)$/i.test(u.pathname)) return {type:'image',src:u.href};
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
  // Avisar si se tapa un acceso, pero no impedir el movimiento: algunos
  // contenedores transparentes ocupan toda la portada y daban falsos bloqueos.
  function overlapsAccess(location) {
    const geo=pxGeometry();if(!geo)return false;
    const left=geo.rect.left+location.x,top=geo.rect.top+location.y,
      right=left+location.width,bottom=top+location.width*16/9,pad=5;
    const items=hero()?.querySelectorAll(
      '.portada-accesos a,.atajos-portada a,.menu-principal button,.menu-principal a,.portada-nav-mobile a,.cuenta-menu'
    )||[];
    return Array.from(items).some(node=>{
      const style=getComputedStyle(node),b=node.getBoundingClientRect();
      if(style.display==='none'||style.visibility==='hidden'||b.width<5||b.height<5)return false;
      return !(right+pad<=b.left||left-pad>=b.right||bottom+pad<=b.top||top-pad>=b.bottom);
    });
  }
  function bounds(x,y,width){
    const geo=pxGeometry();
    if(!geo)return {x:0,y:0,width:224};
    const w=clamp(width,160,Math.min(360,geo.w-24,Math.max(160,(geo.h-84)*9/16)));
    return {x:clamp(x,12,Math.max(12,geo.w-w-12)),
      y:clamp(y,70,Math.max(70,geo.h-w*16/9-12)),width:w};
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
      setPixels(pctToPixels(savedPosition));
      return;
    }
    resetPosition();
  }
  function editorStatus(message){
    const notice=el('gdvVideoEditStatus');if(notice)notice.textContent=message;
  }
  function closeEditor(){
    dragging=null;draftPosition=null;editPanel?.remove();editPanel=null;resizeHandle?.remove();resizeHandle=null;
    const card=el('stolEnAccion');
    card?.removeEventListener('pointerdown',onVideoPointerDown);
    card?.removeEventListener('pointermove',pointerMove);
    card?.removeEventListener('pointerup',pointerEnd);
    card?.removeEventListener('pointercancel',pointerEnd);
    card?.classList.remove('gdv-video-editing');
    applyPosition();
    const url=new URL(location.href);url.searchParams.delete('editar-video');
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }
  function pointerMove(evt){
    if(!dragging||evt.pointerId!==dragging.id)return;
    const dx=evt.clientX-dragging.x,dy=evt.clientY-dragging.y;
    const candidate=dragging.type==='resize'
      ?bounds(dragging.xpos,dragging.ypos,dragging.width+dx)
      :bounds(dragging.xpos+dx,dragging.ypos+dy,dragging.width);
    draftPosition=candidate;setPixels(candidate);
    const slider=el('gdvVideoWidth');if(slider)slider.value=String(Math.round(candidate.width));
    editorStatus(overlapsAccess(candidate)
      ?'Podés moverlo aquí. Atención: esta ubicación se superpone con un botón o tarjeta de acceso.'
      :'Vista previa. Pulsá Guardar posición para publicar el cambio.');
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
    setPixels(draftPosition);
    card.classList.add('gdv-video-editing');
    const tools=document.createElement('div');
    tools.id='gdvVideoLayoutTools';tools.setAttribute('role','toolbar');tools.setAttribute('aria-label','Editor del video de portada');
    tools.innerHTML='<strong>EDITAR VIDEO DE PORTADA</strong><span>Arrastrá el recuadro. Cambiá el tamaño desde la esquina o con el control.</span>'+
       '<label> Tamaño <input id="gdvVideoWidth" aria-label="Ancho del video" type="range" min="160" max="360" step="4"></label>'+ 
       '<div id="gdvVideoNudges" aria-label="Mover con botones" title="También podés moverlo con las flechas">'+
       '<button type="button" data-step="left" aria-label="Mover a la izquierda">←</button>'+
       '<button type="button" data-step="up" aria-label="Mover hacia arriba">↑</button>'+
       '<button type="button" data-step="down" aria-label="Mover hacia abajo">↓</button>'+
       '<button type="button" data-step="right" aria-label="Mover a la derecha">→</button></div>'+
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
    el('gdvVideoNudges').addEventListener('click',event=>{
      const dir=event.target.closest('button[data-step]')?.dataset.step;
      if(!dir||!draftPosition)return;
      const delta=24;
      const p=bounds(draftPosition.x+(dir==='right'?delta:dir==='left'?-delta:0),
        draftPosition.y+(dir==='down'?delta:dir==='up'?-delta:0),draftPosition.width);
      draftPosition=p;setPixels(p);
      editorStatus(overlapsAccess(p)
        ?'Posición cambiada. Atención: se superpone con un acceso. Podés seguir moviéndolo.'
        :'Posición cambiada. Guardá para que se vea en la portada.');
    });
    el('gdvVideoWidth').addEventListener('input',evt=>{
      if(!draftPosition)return;
      const p=bounds(draftPosition.x,draftPosition.y,Number(evt.target.value));
      draftPosition=p;setPixels(p);
      editorStatus(overlapsAccess(p)
        ?'Tamaño ajustado. Advertencia: el video se superpone con un acceso.'
        :'Tamaño ajustado. Pulsá Guardar posición para publicarlo.');
    });
    el('gdvVideoSave').addEventListener('click',async()=>{
      const btn=el('gdvVideoSave');if(!draftPosition)return;
      if(overlapsAccess(draftPosition)&&!confirm('Esta ubicación tapa un botón o tarjeta de acceso. ¿Querés guardarla igual?'))return;
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
    editorStatus('Arrastrá el video con el mouse o usá las flechas. Guardá cuando esté como querés.');
  }
  function onVideoPointerDown(evt){
    if(!editPanel||evt.button!==0||!evt.target?.closest||evt.target.closest('#gdvVideoLayoutTools'))return;
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
    if(isMobile())return;
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
      // YouTube exige playlist con el mismo video para repetir uno solo.
      const id = url.pathname.split('/').filter(Boolean).pop();
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) url.searchParams.set('playlist',id);
      url.searchParams.set('loop','1');
    } else if (host === 'player.vimeo.com') {
      url.searchParams.set('autoplay','1');
      url.searchParams.set('muted','1');
      url.searchParams.set('playsinline','1');
      url.searchParams.set('loop','1');
    } else if (host === 'iframe.videodelivery.net' || host.endsWith('.cloudflarestream.com')) {
      url.searchParams.set('autoplay','true');
      url.searchParams.set('muted','true');
      url.searchParams.set('loop','true');
    }
    return url.href;
  }
  async function home() {
    const area=el('gdvStolPlayer'), card=el('stolEnAccion');
    if(!db||!area||!card)return;
    card.hidden=true; // No dejar un recuadro vacío mientras falta cargar el video.
    try {
      const {data,error}=await db.from('gdv_home_video')
        .select('title,video_url,is_active,pos_x_pct,pos_y_pct,width_px').eq('id',1).maybeSingle();
      if(error||data?.is_active===false)return;
      savedPosition=data?{pos_x_pct:data.pos_x_pct,pos_y_pct:data.pos_y_pct,width_px:data.width_px}:{...originalPosition};
      const r=parseVideo(data?.video_url||'');
      if(!r)return;
      const node=document.createElement(r.type==='video'?'video':r.type==='image'?'img':'iframe');
      node.src=r.type==='iframe'?autoplayIframeSrc(r.src):r.src;
      card.setAttribute('aria-label',r.type==='image'?'Foto destacada: '+(data.title||'Portada'):'Video de portada');
      if(r.type==='image'){
        node.alt=data.title||'Foto destacada de Gente de Vuelo';
        node.decoding='async';
        node.loading='eager';
      } else if(r.type==='video'){
        node.title='Video de portada';
        node.controls=true;
        node.autoplay=true;
        node.loop=true;
        node.setAttribute('loop','');
        node.muted=true;
        node.defaultMuted=true;
        node.setAttribute('muted','');
        node.playsInline=true;
        node.setAttribute('playsinline','');
        node.preload='auto';
      } else {
        node.title='Video de portada';
        node.loading='eager';
        node.allow='autoplay; encrypted-media; picture-in-picture; web-share';
        node.allowFullscreen=true;
      }
      area.replaceChildren(node);
      card.hidden=false;
      applyPosition();
      syncEditor();
      if(r.type==='video')node.play().catch(()=>{});
    } catch(err) { console.warn('No se pudo cargar el contenido de portada:',err); }
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
    const media=url?parseVideo(url):null;
    if(url&&!media){status.textContent='Enlace no compatible. Usá YouTube, Vimeo, Cloudflare Stream, MP4/WebM o una foto JPG/PNG/WEBP.';return;}
    if(!title){status.textContent='Ingresá un título.';return;}
    const btn=el('gdvStolSave');btn.disabled=true;
    try{
      // El trigger de Supabase encola la URL antigua solo después de que
      // el cambio de portada quedó confirmado en la base de datos.
      const {data,error}=await db.from('gdv_home_video')
        .update({title,video_url:url,is_active:el('gdvStolActive').checked,updated_at:new Date().toISOString()})
        .eq('id',1).select('id,video_url').maybeSingle();
      if(error||!data)throw new Error(error?.message||'Permiso denegado. No se publicó el contenido.');
      const published=media?.type==='image'?'Foto publicada.':'Contenido publicado.';
      status.textContent=published+' Comprobando archivos anteriores…';
      try{
        const cfg=window.GDV_CONFIG;
        if(!window.GDV_R2_MEDIA?.cleanupQueued)throw Error('Servicio de limpieza pendiente de actualización.');
        const cleaned=await window.GDV_R2_MEDIA.cleanupQueued(db,cfg.url,cfg.key);
        status.textContent=published+(Number(cleaned.processed||0)>0
         ?' Se eliminaron '+cleaned.processed+' archivo(s) anterior(es) sin uso de Cloudflare.'
         :' No había archivos antiguos para eliminar.');
        if(Number(cleaned.errors||0)>0||Number(cleaned.pending||0)>0)
         status.textContent+=' Hay elementos en espera de revisión o mantenimiento semanal.';
      }catch(err){
        // Un fallo al borrar archivos no revierte la publicación.
        status.textContent=published+' La limpieza del almacenamiento quedó pendiente para el proceso semanal.';
        console.warn('Limpieza R2 pendiente:',err?.message||err);
      }
    }catch(err){status.textContent='No se pudo guardar: '+(err.message||'Error de conexión');}
    finally{btn.disabled=false;}
  }
  function preview() {
    const area=el('gdvStolPreview'),status=el('gdvStolAdminStatus');
    if(!area)return;
    const r=parseVideo(el('gdvStolInputUrl').value.trim());
    if(!r){status.textContent='Agregá un enlace compatible para previsualizar.';area.hidden=true;return;}
    const node=document.createElement(r.type==='video'?'video':r.type==='image'?'img':'iframe');
    node.src=r.src;node.title='Vista previa del contenido de portada';node.style.cssText='width:100%;height:100%;border:0;display:block;object-fit:contain;';
    if(r.type==='image'){node.alt='Vista previa de la foto';node.decoding='async';}
    else if(r.type==='video'){node.controls=true;node.playsInline=true;node.preload='metadata';}
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
    if(!file){status.textContent='Elegí primero una foto o un video.';return;}
    const isImage=['image/jpeg','image/png','image/webp'].includes(file.type);
    const isVideo=['video/mp4','video/webm'].includes(file.type);
    const maxSize=isImage?4*1024*1024:40*1024*1024;
    if((!isImage&&!isVideo)||file.size===0||file.size>maxSize){
      status.textContent='Usá una foto JPG/PNG/WEBP de hasta 4 MB o un video MP4/WebM de hasta 40 MB.';return;
    }
    if(!window.GDV_R2_MEDIA?.upload){status.textContent='No está disponible el servicio de carga a Cloudflare.';return;}
    btn.disabled=true;
    try{
      if(isVideo){status.textContent='Comprobando video vertical 9:16…';await validatePortrait(file);}
      status.textContent='Subiendo '+(isImage?'foto':'video')+' a Cloudflare R2…';
      const cfg=window.GDV_CONFIG;
      const uploaded=await window.GDV_R2_MEDIA.upload(file,db,cfg.url,cfg.key);
      const parsed=parseVideo(uploaded.url);
      if(!parsed||(isImage&&parsed.type!=='image')||(isVideo&&parsed.type!=='video'))
        throw Error('Cloudflare devolvió un formato inesperado.');
      el('gdvStolInputUrl').value=uploaded.url;
      preview();
      status.textContent=(isImage?'Foto':'Video')+' cargado. Pulsá Guardar contenido para publicarlo en la portada.';
    }catch(err){status.textContent='Error al subir archivo: '+(err.message||'Reintentá.');}
    finally{btn.disabled=false;}
  }
  window.GDV_STOL_VIDEO={admin,parseVideo};
  const start=()=>{el('gdvStolForm')?.addEventListener('submit',save);el('gdvStolPreviewBtn')?.addEventListener('click',preview);el('gdvStolUploadBtn')?.addEventListener('click',upload);home();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();