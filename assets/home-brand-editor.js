(() => {
  'use strict';
  const db=window.GDV_AUTH?.client;
  const hero=document.querySelector('.portada-completa .hero');
  const logo=hero?.querySelector('.logo-emblema');
  const heading=hero?.querySelector('.hero-titulo');
  if(!db||!hero||!logo||!heading)return;
  const params=new URLSearchParams(location.search);
  const wanted=params.get('editar-marca')==='1';
  const isDesktop=()=>matchMedia('(min-width:701px)').matches;
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const copy=p=>({x:p.x,y:p.y});
  const norm=p=>({x:clamp(Number(p.x)||0,-40,40),y:clamp(Number(p.y)||0,-40,40)});
  let saved={x:0,y:0},preview=null,changed=false,editing=false,loading=true,writing=false,toolbar=null,drag=null,report='';
  const current=()=>preview||saved;
  function apply(){
    if(!isDesktop()){
      hero.style.removeProperty('--gdv-brand-shift-x');
      hero.style.removeProperty('--gdv-brand-shift-y');
      return;
    }
    const p=norm(current());
    hero.style.setProperty('--gdv-brand-shift-x',(hero.getBoundingClientRect().width*p.x/100).toFixed(1)+'px');
    hero.style.setProperty('--gdv-brand-shift-y',(hero.getBoundingClientRect().height*p.y/100).toFixed(1)+'px');
  }
  function warning(){
    if(!isDesktop())return '';
    const hr=hero.getBoundingClientRect(), els=[logo,heading.querySelector('h1'),heading.querySelector('p'),heading.querySelector('.hero-lema')].filter(Boolean);
    const rects=els.map(el=>el.getBoundingClientRect());
    const edges={left:Math.min(...rects.map(r=>r.left)),right:Math.max(...rects.map(r=>r.right)),top:Math.min(...rects.map(r=>r.top)),bottom:Math.max(...rects.map(r=>r.bottom))};
    if(edges.left<hr.left-4||edges.right>hr.right+4||edges.top<hr.top-4||edges.bottom>hr.bottom+4)
      return 'Atención: una parte del conjunto queda fuera de la portada.';
    for(const selector of ['#portadaAccesos > a','.gdv-stol-portada']){
      for(const el of document.querySelectorAll(selector)){
        if(el.hidden||getComputedStyle(el).display==='none')continue;
        const r=el.getBoundingClientRect();
        if(els.some(t=>{
          const b=t.getBoundingClientRect();
          return b.left<r.right-6&&b.right>r.left+6&&b.top<r.bottom-6&&b.bottom>r.top+6;
        }))return 'Atención: el logo o los textos se superponen con otra tarjeta de portada.';
      }
    }
    return '';
  }
  function status(value,failed=false){
    const out=toolbar?.querySelector('#gdvBrandStatus');
    if(out){out.textContent=value;out.classList.toggle('gdv-brand-error',failed);}
  }
  function redraw(message){
    apply();
    if(!toolbar)return;
    const p=current();
    for(const axis of ['x','y']){
      const input=toolbar.querySelector('#gdvBrand'+axis.toUpperCase());
      const value=toolbar.querySelector('#gdvBrand'+axis.toUpperCase()+'Value');
      input.value=String(p[axis]);
      value.textContent=p[axis].toFixed(1)+'%';
    }
    toolbar.querySelector('#gdvBrandSave').disabled=writing||!changed;
    toolbar.querySelector('#gdvBrandReset').disabled=writing;
    status(message||warning()||(changed?'Posición ajustada. Guardá para que todos vean el cambio.':'Arrastrá el logo o los textos para moverlos juntos.'));
  }
  function stage(p){preview=norm(p);changed=true;redraw();}
  function nudge(dx,dy){
    const p=copy(current());p.x+=dx;p.y+=dy;stage(p);
  }
  function cleanup(){
    editing=false;drag=null;hero.classList.remove('gdv-brand-editing');
    toolbar?.remove();toolbar=null;preview=null;changed=false;
    apply();
    const u=new URL(location.href);u.searchParams.delete('editar-marca');
    history.replaceState(history.state,'',u.pathname+u.search+u.hash);
  }
  function close(){
    if(writing)return;
    if(changed&&!confirm('Hay cambios sin guardar. ¿Querés descartarlos?'))return;
    cleanup();
  }
  async function save(){
    if(!editing||writing||!changed)return;
    const note=warning();
    if(note&&!confirm(note+' ¿Guardar igualmente?'))return;
    writing=true;redraw('Guardando en Supabase…');
    try{
      const p=norm(current());
      const {data,error}=await db.from('gdv_home_brand_position')
        .upsert({id:1,shift_x_pct:p.x,shift_y_pct:p.y,updated_at:new Date().toISOString()},{onConflict:'id'})
        .select('id,shift_x_pct,shift_y_pct').maybeSingle();
      if(error||!data)throw Error(error?.message||'No se pudo confirmar el guardado.');
      saved=norm({x:Number(data.shift_x_pct),y:Number(data.shift_y_pct)});
      preview=null;changed=false;report='Posición guardada. Ya es visible para todos.';
    }catch(err){report='No se pudo guardar: '+(err.message||'Error de conexión.');}
    finally{writing=false;redraw(report);report='';}
  }
  async function reset(){
    if(!editing||writing)return;
    if(!confirm('¿Restaurar y guardar la ubicación original del logo y los textos?'))return;
    writing=true;redraw('Restaurando ubicación original…');
    try{
      const {error}=await db.from('gdv_home_brand_position').delete().eq('id',1);
      if(error)throw error;
      saved={x:0,y:0};preview=null;changed=false;report='Se restauró la ubicación original para todos.';
    }catch(err){report='No se pudo restaurar: '+(err.message||'Error de conexión.');}
    finally{writing=false;redraw(report);report='';}
  }
  function openEditor(){
    if(editing||loading||!isDesktop()||!window.gdvLegacyAdmin||!wanted)return;
    if(new URLSearchParams(location.search).get('editar-video')==='1'||
       new URLSearchParams(location.search).get('editar-tarjetas')==='1')return;
    editing=true;preview=copy(saved);changed=false;
    hero.classList.add('gdv-brand-editing');
    toolbar=document.createElement('div');toolbar.id='gdvBrandEditor';toolbar.setAttribute('role','toolbar');
    toolbar.setAttribute('aria-label','Editor de posición del logo y textos de la portada');
    toolbar.innerHTML='<strong>LOGO Y TEXTOS DE PORTADA</strong>'+
      '<span>Arrastrá el logo o el título: se mueven juntos.</span>'+
      '<label>Horizontal <input type="range" id="gdvBrandX" min="-40" max="40" step="0.2"><output id="gdvBrandXValue"></output></label>'+
      '<label>Vertical <input type="range" id="gdvBrandY" min="-40" max="40" step="0.2"><output id="gdvBrandYValue"></output></label>'+
      '<div class="gdv-brand-arrows" aria-label="Ajustar ubicación">'+
      '<button type="button" data-move="left" aria-label="Mover a la izquierda">←</button>'+
      '<button type="button" data-move="up" aria-label="Mover arriba">↑</button>'+
      '<button type="button" data-move="down" aria-label="Mover abajo">↓</button>'+
      '<button type="button" data-move="right" aria-label="Mover a la derecha">→</button></div>'+
      '<button type="button" id="gdvBrandSave" class="gdv-brand-save">Guardar</button>'+
      '<button type="button" id="gdvBrandReset">Restaurar original</button>'+
      '<button type="button" id="gdvBrandExit">Terminar</button>'+
      '<span id="gdvBrandStatus" role="status" aria-live="polite"></span>';
    document.body.append(toolbar);
    toolbar.querySelector('#gdvBrandX').addEventListener('input',ev=>stage({...current(),x:Number(ev.target.value)}));
    toolbar.querySelector('#gdvBrandY').addEventListener('input',ev=>stage({...current(),y:Number(ev.target.value)}));
    toolbar.querySelectorAll('button[data-move]').forEach(btn=>btn.addEventListener('click',()=>{
      const d=btn.dataset.move;
      nudge(d==='right'?0.7:d==='left'?-0.7:0,d==='down'?0.7:d==='up'?-0.7:0);
    }));
    toolbar.querySelector('#gdvBrandSave').addEventListener('click',save);
    toolbar.querySelector('#gdvBrandReset').addEventListener('click',reset);
    toolbar.querySelector('#gdvBrandExit').addEventListener('click',close);
    redraw();
  }
  function onPointerStart(evt){
    if(!editing||writing||evt.button!==0||!isDesktop())return;
    const p=copy(current());
    drag={id:evt.pointerId,target:evt.currentTarget,atX:evt.clientX,atY:evt.clientY,from:p};
    evt.preventDefault();
    evt.currentTarget.setPointerCapture(evt.pointerId);
  }
  function onPointerMove(evt){
    if(!drag||evt.pointerId!==drag.id||drag.target!==evt.currentTarget)return;
    const w=Math.max(hero.getBoundingClientRect().width,1),h=Math.max(hero.getBoundingClientRect().height,1);
    stage({x:drag.from.x+100*(evt.clientX-drag.atX)/w,y:drag.from.y+100*(evt.clientY-drag.atY)/h});
  }
  function onPointerEnd(evt){
    if(!drag||drag.id!==evt.pointerId||drag.target!==evt.currentTarget)return;
    const target=drag.target;drag=null;
    if(target.hasPointerCapture(evt.pointerId))target.releasePointerCapture(evt.pointerId);
  }
  for(const el of [logo,heading]){
    el.addEventListener('pointerdown',onPointerStart);
    el.addEventListener('pointermove',onPointerMove);
    el.addEventListener('pointerup',onPointerEnd);
    el.addEventListener('pointercancel',onPointerEnd);
    el.addEventListener('dragstart',evt=>{if(editing)evt.preventDefault();});
  }
  window.addEventListener('gdv-admin-ready',evt=>{if(evt.detail?.isAdmin)openEditor();});
  let resizeWait=0;
  window.addEventListener('resize',()=>{
    clearTimeout(resizeWait);
    resizeWait=setTimeout(()=>{
      apply();
      if(editing&&!isDesktop())cleanup();
      else openEditor();
    },140);
  });
  async function load(){
    const {data,error}=await db.from('gdv_home_brand_position')
      .select('shift_x_pct,shift_y_pct').eq('id',1).maybeSingle();
    loading=false;
    if(error){console.warn('No se pudo cargar la ubicación de la marca.');return;}
    if(data)saved=norm({x:Number(data.shift_x_pct),y:Number(data.shift_y_pct)});
    apply();openEditor();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>load().catch(()=>{}),{once:true});
  else load().catch(()=>{});
})();