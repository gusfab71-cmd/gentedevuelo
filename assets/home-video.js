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
    if (/\.(mp4|webm|ogv)$/i.test(u.pathname)) return {type:'video',src:u.href};
    return null;
  }
  async function home() {
    const area=el('gdvStolPlayer'); if(!db||!area)return;
    const {data,error}=await db.from('gdv_home_video').select('title,video_url').eq('id',1).maybeSingle();
    if(error)return;
    if(el('gdvStolTitle'))el('gdvStolTitle').textContent=data?.title||'STOL en acción';
    const r=parseVideo(data?.video_url||''); if(!r)return;
    const node=document.createElement(r.type==='video'?'video':'iframe');
    node.src=r.src; node.setAttribute('title','Video STOL en acción');
    if(r.type==='video'){node.controls=true;node.playsInline=true;node.preload='metadata';}
    else {node.loading='lazy';node.allow='encrypted-media; picture-in-picture; web-share';node.allowFullscreen=true;}
    area.replaceChildren(node);
  }
  async function admin() {
    const box=el('gdvStolAdmin'); if(!box||!db)return;box.hidden=false;
    const {data,error}=await db.from('gdv_home_video').select('title,video_url').eq('id',1).maybeSingle();
    el('gdvStolAdminStatus').textContent=error?'Error al consultar video: '+error.message:'';
    if(data){el('gdvStolInputTitle').value=data.title;el('gdvStolInputUrl').value=data.video_url;}
  }
  async function save(evt) {
    evt.preventDefault();
    const url=el('gdvStolInputUrl').value.trim(),title=el('gdvStolInputTitle').value.trim(), status=el('gdvStolAdminStatus');
    if(url&&!parseVideo(url)){status.textContent='Enlace no compatible. Usá YouTube, Vimeo, Cloudflare Stream o MP4/WebM.';return;}
    if(!title){status.textContent='Ingresá un título.';return;}
    const btn=el('gdvStolSave');btn.disabled=true;
    const {data,error}=await db.from('gdv_home_video').update({title,video_url:url,updated_at:new Date().toISOString()}).eq('id',1).select('id').maybeSingle();
    btn.disabled=false;
    status.textContent=error?'No se pudo guardar: '+error.message:!data?'Permiso denegado.':'Video actualizado en la portada.';
  }
  window.GDV_STOL_VIDEO={admin,parseVideo};
  const start=()=>{el('gdvStolForm')?.addEventListener('submit',save);home();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();