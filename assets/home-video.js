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
  async function home() {
    const area=el('gdvStolPlayer'); if(!db||!area)return;
    const {data,error}=await db.from('gdv_home_video').select('title,video_url,is_active').eq('id',1).maybeSingle();
    if(error)return;
    if(el('gdvStolTitle'))el('gdvStolTitle').textContent=data?.title||'STOL en acción';
    if(data?.is_active===false){const card=el('stolEnAccion');if(card)card.hidden=true;return;}
    const r=parseVideo(data?.video_url||''); if(!r)return;
    const node=document.createElement(r.type==='video'?'video':'iframe');
    node.src=r.src; node.setAttribute('title','Video STOL en acción');
    if(r.type==='video'){node.controls=true;node.playsInline=true;node.preload='metadata';}
    else {node.loading='lazy';node.allow='encrypted-media; picture-in-picture; web-share';node.allowFullscreen=true;}
    area.replaceChildren(node);
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
    node.src=r.src;node.title='Vista previa del video STOL';node.style.cssText='width:100%;height:100%;border:0;display:block;';
    if(r.type==='video'){node.controls=true;node.playsInline=true;node.preload='metadata';}
    else {node.allow='encrypted-media; picture-in-picture; web-share';node.allowFullscreen=true;}
    area.replaceChildren(node);area.hidden=false;
    status.textContent='Vista previa. Guardá para publicar el cambio.';
  }
  async function upload() {
    const file=el('gdvStolUpload')?.files?.[0],status=el('gdvStolAdminStatus'),btn=el('gdvStolUploadBtn');
    if(!file){status.textContent='Elegí primero un video MP4 o WebM.';return;}
    if(!['video/mp4','video/webm'].includes(file.type)||file.size>40*1024*1024||file.size===0){
      status.textContent='Usá un video MP4 o WebM de hasta 40 MB.';return;
    }
    if(!window.GDV_R2_MEDIA?.upload){status.textContent='No está disponible el servicio de carga a Cloudflare.';return;}
    btn.disabled=true;status.textContent='Subiendo video a Cloudflare R2…';
    try{
      const cfg=window.GDV_CONFIG;
      const uploaded=await window.GDV_R2_MEDIA.upload(file,db,cfg.url,cfg.key);
      el('gdvStolInputUrl').value=uploaded.url;
      preview();
      status.textContent='Video cargado a Cloudflare. Guardá para publicarlo en la portada.';
    }catch(err){status.textContent='Error al subir video: '+(err.message||'Reintentá.');}
    finally{btn.disabled=false;}
  }
  window.GDV_STOL_VIDEO={admin,parseVideo};
  const start=()=>{el('gdvStolForm')?.addEventListener('submit',save);el('gdvStolPreviewBtn')?.addEventListener('click',preview);el('gdvStolUploadBtn')?.addEventListener('click',upload);home();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();