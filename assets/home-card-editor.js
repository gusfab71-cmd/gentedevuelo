(() => {
  'use strict';
  const db=window.GDV_AUTH?.client;
  const hero=document.querySelector('.portada-completa');
  const box=document.getElementById('portadaAccesos');
  const definitions=[
    {id:'shimoda',name:'Robert Shimoda',selector:'.acceso-shimoda'},
    {id:'instituciones',name:'Instituciones Amigas',selector:'.acceso-instituciones'},
    {id:'compraventa',name:'CompraVenta',selector:'.acceso-clasificados'}
  ];
  if(!db||!hero||!box)return;
  const cards=new Map(definitions.map(d=>[d.id,box.querySelector(d.selector)]));
  if([...cards.values()].some(x=>!x))return;
  const editable=new URLSearchParams(location.search).get('editar-tarjetas')==='1';
  const desktop=()=>matchMedia('(min-width:701px)').matches;
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const copy=r=>({...r});
  let base=new Map(), saved=new Map(), draft=new Map(),dirty=new Set();
  let editing=false,selected='shimoda',panel=null,dragging=null,loading=true,saving=false,resizing=false;
  const W=()=>Math.max(200,hero.getBoundingClientRect().width);
  const H=()=>Math.max(240,hero.getBoundingClientRect().height);
  const maxW=()=>Math.min(850,W()-24), maxH=()=>Math.min(440,H()-90);
  const minHeight=id=>id==='instituciones'?105:64;

  function normalize(id,geom) {
    const width=clamp(Math.round(Number(geom.width)||160),120,maxW());
    const height=clamp(Math.round(Number(geom.height)||80),minHeight(id),maxH());
    return {
      x:clamp(Math.round(Number(geom.x)||0),12,Math.max(12,W()-width-12)),
      y:clamp(Math.round(Number(geom.y)||0),75,Math.max(75,H()-height-12)),
      width,height
    };
  }
  function fromRow(id,row) {
    return normalize(id,{
      x:W()*Number(row.pos_x_pct)/100,
      y:H()*Number(row.pos_y_pct)/100,
      width:Number(row.width_px),height:Number(row.height_px)
    });
  }
  function toRow(id,g) {
    return {card_id:id,
      pos_x_pct:Number((100*g.x/W()).toFixed(2)),
      pos_y_pct:Number((100*g.y/H()).toFixed(2)),
      width_px:Math.round(g.width),height_px:Math.round(g.height),
      updated_at:new Date().toISOString()};
  }
  function measureBase() {
    // Medir las tres tarjetas en su cuadrícula original antes de aplicar cambios.
    box.classList.remove('gdv-cards-layout');
    const heroRect=hero.getBoundingClientRect(), next=new Map();
    definitions.forEach(d=>{
      const r=cards.get(d.id).getBoundingClientRect();
      next.set(d.id,normalize(d.id,{x:r.left-heroRect.left,y:r.top-heroRect.top,
        width:r.width,height:r.height}));
    });
    base=next;
  }
  function geom(id) {
    const row=draft.get(id)||saved.get(id);
    return row?fromRow(id,row):copy(base.get(id)||{x:12,y:150,width:170,height:95});
  }
  function setDraft(id,g) {
    const normalized=normalize(id,g);
    draft.set(id,toRow(id,normalized));dirty.add(id);
    draw();updatePanel();
  }
  function draw() {
    if(!desktop()||(!saved.size&&!editing)) {
      box.classList.remove('gdv-cards-layout','gdv-cards-editing');
      cards.forEach(card=>{for(const prop of ['--gdv-card-x','--gdv-card-y','--gdv-card-w','--gdv-card-h'])card.style.removeProperty(prop);});
      return;
    }
    box.classList.add('gdv-cards-layout');
    box.classList.toggle('gdv-cards-editing',editing);
    definitions.forEach(d=>{
      const card=cards.get(d.id),g=geom(d.id);
      card.style.setProperty('--gdv-card-x',g.x+'px');
      card.style.setProperty('--gdv-card-y',g.y+'px');
      card.style.setProperty('--gdv-card-w',g.width+'px');
      card.style.setProperty('--gdv-card-h',g.height+'px');
      card.classList.toggle('gdv-card-selected',editing&&selected===d.id);
    });
  }
  function boundsOverlap(a,b) {
    return a.x<b.x+b.width-5&&a.x+a.width>b.x+5
      &&a.y<b.y+b.height-5&&a.y+a.height>b.y+5;
  }
  function collisionHint() {
    const g=geom(selected);
    const others=definitions.filter(d=>d.id!==selected);
    if(others.some(d=>boundsOverlap(g,geom(d.id))))
      return 'Atención: esta tarjeta se superpone con otra tarjeta de portada.';
    const video=document.getElementById('stolEnAccion');
    if(video&&!video.hidden){
      const r=video.getBoundingClientRect(),hr=hero.getBoundingClientRect();
      if(boundsOverlap(g,{x:r.left-hr.left,y:r.top-hr.top,width:r.width,height:r.height}))
        return 'Atención: esta posición se superpone con el video de portada.';
    }
    return 'Arrastrá la tarjeta o ajustá ancho, alto y posición. Guardá cuando esté como querés.';
  }
  function info(text,error=false){
    const el=panel?.querySelector('#gdvCardStatus');
    if(el){el.textContent=text;el.classList.toggle('gdv-card-error',error);}
  }
  function updatePanel() {
    if(!panel)return;
    const g=geom(selected);
    const pick=panel.querySelector('#gdvCardSelect');
    if(pick)pick.value=selected;
    for(const [id,value] of [['gdvCardWidth',g.width],['gdvCardHeight',g.height]]) {
      const input=panel.querySelector('#'+id);
      if(input){input.max=String(id==='gdvCardWidth'?maxW():maxH());input.value=String(Math.round(value));}
    }
    panel.querySelector('#gdvCardWidthValue').textContent=Math.round(g.width)+' px';
    panel.querySelector('#gdvCardHeightValue').textContent=Math.round(g.height)+' px';
    panel.querySelector('#gdvCardSave').disabled=saving||dirty.size===0;
    panel.querySelector('#gdvCardReset').disabled=saving;
    info(collisionHint()+(dirty.size?' · Cambios sin guardar: '+dirty.size:''),false);
  }
  function selectCard(id) {
    if(!cards.has(id))return;
    selected=id;draw();updatePanel();
  }
  function resizeOrMove(step) {
    if(!editing||saving)return;
    const g=geom(selected),n=8;
    if(step==='left')g.x-=n;
    if(step==='right')g.x+=n;
    if(step==='up')g.y-=n;
    if(step==='down')g.y+=n;
    setDraft(selected,g);
  }
  function removePanel(clearUrl=true) {
    if(!editing)return;
    if(dirty.size&&!confirm('Hay cambios sin guardar. ¿Salir y descartarlos?'))return;
    editing=false;dragging=null;panel?.remove();panel=null;
    cards.forEach(card=>card.querySelector('.gdv-card-handle')?.remove());
    draft=new Map(saved);dirty.clear();measureBase();draw();
    if(clearUrl){
      const u=new URL(location.href);
      u.searchParams.delete('editar-tarjetas');
      history.replaceState(history.state,'',u.pathname+u.search+u.hash);
    }
  }
  async function saveChanges(){
    if(!editing||saving||!dirty.size)return;
    if(collisionHint().startsWith('Atención')&&!confirm('Hay una superposición con otra tarjeta o el video. ¿Guardar igualmente?'))return;
    saving=true;updatePanel();info('Guardando las tarjetas en Supabase…');
    let resultMessage='',failed=false;
    try {
      const rows=[...dirty].map(id=>draft.get(id)).filter(Boolean);
      const {data,error}=await db.from('gdv_home_card_layout')
        .upsert(rows,{onConflict:'card_id'}).select('card_id,pos_x_pct,pos_y_pct,width_px,height_px');
      if(error||!data||data.length!==rows.length)throw Error(error?.message||'No se pudieron confirmar todos los cambios');
      data.forEach(row=>saved.set(row.card_id,row));
      dirty.clear();
      resultMessage='Tarjetas guardadas. La posición nueva ya está disponible para todos.';
    }catch(error){resultMessage='No se pudo guardar: '+(error.message||'Error de conexión');failed=true;}
    finally{saving=false;draw();updatePanel();info(resultMessage,failed);}
  }
  async function resetCard(){
    if(!editing||saving)return;
    if(!confirm('¿Restaurar el tamaño y ubicación originales de esta tarjeta?'))return;
    saving=true;updatePanel();info('Restaurando el diseño original…');
    let resultMessage='',failed=false;
    try {
      const id=selected;
      if(saved.has(id)){
        const {error}=await db.from('gdv_home_card_layout').delete().eq('card_id',id);
        if(error)throw error;
      }
      saved.delete(id);draft.delete(id);dirty.delete(id);
      measureBase();draw();resultMessage='Tarjeta restaurada a su posición original.';
    }catch(error){resultMessage='No se pudo restaurar: '+(error.message||'Error de conexión');failed=true;}
    finally{saving=false;updatePanel();info(resultMessage,failed);}
  }
  function openPanel(){
    if(editing||!desktop()||!window.gdvLegacyAdmin||loading)return;
    if(new URLSearchParams(location.search).get('editar-video')==='1')return;
    editing=true;draft=new Map(saved);dirty.clear();
    measureBase();
    const el=document.createElement('div');el.id='gdvCardEditor';
    el.setAttribute('role','toolbar');el.setAttribute('aria-label','Editar tarjetas de portada');
    el.innerHTML=`<strong>EDITAR TARJETAS DE PORTADA</strong>
      <label>Tarjeta
        <select id="gdvCardSelect">
          <option value="shimoda">Robert Shimoda</option>
          <option value="instituciones">Instituciones Amigas</option>
          <option value="compraventa">CompraVenta</option>
        </select>
      </label>
      <label>Ancho <input type="range" id="gdvCardWidth" min="120" max="850" step="2">
        <span id="gdvCardWidthValue"></span></label>
      <label>Alto <input type="range" id="gdvCardHeight" min="64" max="440" step="2">
        <span id="gdvCardHeightValue"></span></label>
      <div class="gdv-card-arrows" aria-label="Mover tarjeta">
        <button type="button" data-card-move="left" aria-label="Mover a la izquierda">←</button>
        <button type="button" data-card-move="up" aria-label="Mover hacia arriba">↑</button>
        <button type="button" data-card-move="down" aria-label="Mover hacia abajo">↓</button>
        <button type="button" data-card-move="right" aria-label="Mover a la derecha">→</button>
      </div>
      <button type="button" id="gdvCardSave" class="gdv-card-save">Guardar cambios</button>
      <button type="button" id="gdvCardReset">Restaurar esta</button>
      <button type="button" id="gdvCardExit">Terminar</button>
      <span id="gdvCardStatus" role="status" aria-live="polite"></span>`;
    panel=el;document.body.append(el);
    for(const d of definitions){
      const handle=document.createElement('span');handle.className='gdv-card-handle';
      handle.setAttribute('aria-hidden','true');handle.title='Arrastrá para cambiar ancho y alto';
      cards.get(d.id).append(handle);
    }
    el.querySelector('#gdvCardSelect').addEventListener('change',evt=>selectCard(evt.target.value));
    for(const [inputId,axis] of [['gdvCardWidth','width'],['gdvCardHeight','height']]){
      el.querySelector('#'+inputId).addEventListener('input',evt=>{
        const g=geom(selected);g[axis]=Number(evt.target.value);setDraft(selected,g);
      });
    }
    el.querySelectorAll('[data-card-move]').forEach(btn=>btn.addEventListener('click',()=>resizeOrMove(btn.dataset.cardMove)));
    el.querySelector('#gdvCardSave').addEventListener('click',saveChanges);
    el.querySelector('#gdvCardReset').addEventListener('click',resetCard);
    el.querySelector('#gdvCardExit').addEventListener('click',()=>removePanel());
    draw();updatePanel();
  }
  for(const [id,card] of cards){
    card.addEventListener('dragstart',evt=>{if(editing)evt.preventDefault();});
    card.addEventListener('click',evt=>{
      if(!editing)return;
      evt.preventDefault();evt.stopImmediatePropagation();selectCard(id);
    },true);
    card.addEventListener('pointerdown',evt=>{
      if(!editing||saving||evt.button!==0)return;
      selected=id;draw();updatePanel();
      const g=geom(id);
      dragging={id,pointer:evt.pointerId,type:evt.target.closest('.gdv-card-handle')?'resize':'move',
        clientX:evt.clientX,clientY:evt.clientY,initial:g};
      evt.preventDefault();card.setPointerCapture(evt.pointerId);
    });
    card.addEventListener('pointermove',evt=>{
      if(!editing||!dragging||dragging.id!==id||evt.pointerId!==dragging.pointer)return;
      const dx=evt.clientX-dragging.clientX,dy=evt.clientY-dragging.clientY;
      const g=copy(dragging.initial);
      if(dragging.type==='resize'){g.width+=dx;g.height+=dy;}
      else {g.x+=dx;g.y+=dy;}
      setDraft(id,g);
    });
    const end=evt=>{
      if(!dragging||dragging.id!==id||dragging.pointer!==evt.pointerId)return;
      dragging=null;
      if(card.hasPointerCapture(evt.pointerId))card.releasePointerCapture(evt.pointerId);
    };
    card.addEventListener('pointerup',end);
    card.addEventListener('pointercancel',end);
  }
  function syncEdit(){
    if(!editable||!desktop()||!window.gdvLegacyAdmin||loading)return;
    openPanel();
  }
  window.addEventListener('gdv-admin-ready',event=>{if(event.detail?.isAdmin)syncEdit();});
  let resizeTimer;
  window.addEventListener('resize',()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{
      if(!desktop()){
        if(editing)removePanel(false);
        box.classList.remove('gdv-cards-layout','gdv-cards-editing');
      }else{
        measureBase();draw();updatePanel();
        syncEdit();
      }
    },160);
  });
  async function load(){
    const {data,error}=await db.from('gdv_home_card_layout')
      .select('card_id,pos_x_pct,pos_y_pct,width_px,height_px');
    loading=false;
    if(error){console.warn('No se pudo cargar la posición de las tarjetas:',error);return;}
    (data||[]).forEach(r=>{if(cards.has(r.card_id))saved.set(r.card_id,r);});
    draft=new Map(saved);
    if(desktop()){measureBase();draw();syncEdit();}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});
  else load();
})();