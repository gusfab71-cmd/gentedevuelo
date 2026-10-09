'use strict';
(() => {
const cfg=window.GDV_CONFIG, db=window.GDV_AUTH.client, app=document.getElementById('app'), notice=document.getElementById('notice'), dialog=document.getElementById('dialog');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=v=>{try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
const date=v=>v?new Date(v).toLocaleString('es-AR',{dateStyle:'medium',timeStyle:'short',hourCycle:'h23'}):'';
const $=id=>document.getElementById(id);
let user=null,isAdmin=false,categories=[],topics=[],comments=[],media=[],reactions=[],profiles=new Map(),legacyShimoda=[],legacyShimodaComments=[],epoch=0,replyParent=null,dirty=false,isOwnerAdmin=false,gdvWaTestTimer=null;
const cat=s=>categories.find(c=>c.slug===s)||{name:'Otros',color:'#aab6c2'};
const profile=id=>profiles.get(id)||{username:'Usuario eliminado'};
const name=id=>profile(id).username||'Miembro de la comunidad';
const avatar=id=>safeURL(profile(id).avatar_url)?`<img class="avatar" src="${esc(safeURL(profile(id).avatar_url))}" alt="Foto de ${esc(name(id))}" loading="lazy">`:`<span class="avatar no-avatar" aria-label="${esc(name(id))}">${esc(name(id).slice(0,1).toUpperCase())}</span>`;
const shimodaAvatar=()=>`<img class="avatar shimoda-avatar" src="LOGO SE ROBERT SHIMODA MEJORADO.png" alt="Foto de Robert Shimoda" loading="lazy">`;
const message=(text,error=false)=>{notice.textContent=text;notice.classList.toggle('error',error)};
const checked=r=>{if(r.error)throw new Error(r.error.message);return r.data||[]};
const link=(label,hash,cls='button')=>`<a class="${cls}" href="${esc(hash)}">${esc(label)}</a>`;
const stateLabel=s=>({pending:'En revisión',approved:'Publicado',rejected:'Rechazado',open:'Abierto',resolved:'Resuelto',closed:'Cerrado',archived:'Archivado'}[s]||s);

const iconPaths={useful:'M7 10v11H3V10h4Zm0 0 5-7c2 0 2 2 2 3l-1 4h6a2 2 0 0 1 2 2l-2 7H7',reply:'M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z',share:'m14 3 7 6-7 6V11C8 11 5 14 3 20 2 11 6 6 14 6V3Z',save:'M6 3h12v18l-6-4-6 4V3Z',follow:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',award:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z',edit:'m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5',remove:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',report:'M5 22V3c5-4 9 4 15 0v11c-6 4-10-4-15 0',collapse:'m6 15 6-6 6 6',more:'M4 12h.01M12 12h.01M20 12h.01'};
function actionLabel(el,key,label,hint){
 el.innerHTML='<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+iconPaths[key]+'"/></svg><span>'+esc(label)+'</span>';el.title=hint||label;
}
function friendlyActions(){
 app.querySelectorAll('.actions').forEach(bar=>{
  const article=bar.closest('article'),isComment=article?.classList.contains('comment');
  if(!article||bar.dataset.friendly)return;
  bar.dataset.friendly='true';const postBody=bar.closest('.post-body'),special=[];
  for(const el of [...bar.children]){
   const a=el.dataset.action;
   if(['report','request-removal','edit-comment','delete-comment'].includes(a)||el.matches('a[href^="#editar/"]')){special.push(el);continue}
   if(a==='reaction'){const award=el.dataset.kind==='award',count=el.textContent.match(/ · \d+$/)?.[0]||'';actionLabel(el,award?'award':'useful',(award?'Premiar':'Me resultó útil')+count,award?'Destacar este aporte con una estrella. Volvé a pulsar para quitarla.':'Indicar que este aporte te ayudó. Volvé a pulsar para quitar tu valoración.')}
   else if(a==='reply')actionLabel(el,'reply','Responder','Escribir una respuesta a este comentario.');
   else if(a==='share')actionLabel(el,'share','Compartir','Copiar o compartir el enlace de este contenido.');
   else if(a==='save')actionLabel(el,'save',el.getAttribute('aria-pressed')==='true'?'Guardado':'Guardar','Guardar en tu lista privada. Volvé a pulsar para quitarlo.');
   else if(a==='follow')actionLabel(el,'follow',el.getAttribute('aria-pressed')==='true'?'Siguiendo conversación':'Seguir conversación','Recibir notificaciones de nuevas respuestas. Volvé a pulsar para dejar de seguir.');
   else if(a==='collapse')actionLabel(el,'collapse','Ocultar respuestas','Plegar o desplegar las respuestas.');
  }
  if(!isComment&&$('reply-form')){const b=document.createElement('button');b.type='button';b.dataset.action='comment';b.className='comment-action';actionLabel(b,'reply','Comentar','Ir al espacio para escribir tu comentario.');bar.querySelector('[data-action="reaction"]')?.after(b)}
  if(special.length){
   const details=document.createElement('details');details.className='post-options';const summary=document.createElement('summary');actionLabel(summary,'more','Más opciones','Editar, solicitar eliminación o reportar este contenido.');
   const panel=document.createElement('div');panel.className='post-options-panel';special.sort((a,b)=>Number(a.dataset.action==='report')-Number(b.dataset.action==='report'));
   special.forEach(el=>{const a=el.dataset.action;
    if(a==='report'){el.classList.add('report-option');actionLabel(el,'report',isComment?'Reportar comentario':'Reportar publicación','Avisar a moderación sobre un problema con este contenido.')}
    else if(a==='request-removal')actionLabel(el,'remove','Solicitar eliminación','Enviar una solicitud a moderación; no elimina la publicación de inmediato.');
    else if(a==='delete-comment')actionLabel(el,'remove','Eliminar comentario','Retirar tu texto conservando las respuestas del hilo.');
    else actionLabel(el,'edit','Editar','Modificar tu propio contenido.');
    panel.append(el);
   });details.append(summary,panel);postBody.prepend(details);
  }
 });
}
document.addEventListener('click',e=>{document.querySelectorAll('.post-options[open]').forEach(d=>{if(!d.contains(e.target)||e.target.closest('.post-options-panel button,.post-options-panel a'))d.open=false})});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.post-options[open]').forEach(d=>{d.open=false;d.querySelector('summary').focus()})});

function body(text){
 const inline=value=>esc(value).replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s<>]+)\)/g,(_,label,url)=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`).replace(/\*\*([^\n]+?)\*\*/g,'<strong>$1</strong>').replace(/\*([^\n*]+?)\*/g,'<em>$1</em>').replace(/(^|\s)@([A-Za-z0-9_-]{3,25})\b/g,(match,space,handle)=>{const person=[...profiles.values()].find(p=>p.username?.toLowerCase()===handle.toLowerCase());return person?`${space}<a href="#hangar/${person.id}">@${handle}</a>`:match});
 let list=false;const lines=String(text??'').split('\n'),out=[];
 for(const line of lines){const bullet=line.match(/^(?:[-*•])\s+(.+)$/);if(bullet){if(!list)out.push('<ul>');list=true;out.push('<li>'+inline(bullet[1])+'</li>');continue}if(list){out.push('</ul>');list=false}const heading=line.match(/^(#{2,3})\s+(.+)$/);out.push(heading?`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`:line.startsWith('> ')?'<blockquote>'+inline(line.slice(2))+'</blockquote>':inline(line)+'<br>')}
 if(list)out.push('</ul>');return out.join('');
}
const edited=t=>t.updated_at&&new Date(t.updated_at)-new Date(t.created_at)>1800000?` · Editado ${date(t.updated_at)}`:'';
async function allRows(table,columns='*',order='created_at'){
 const rows=[];for(let from=0;;from+=500){let query=db.from(table).select(columns);if(order)query=query.order(order,{ascending:true});const batch=checked(await query.range(from,from+499));rows.push(...batch);if(batch.length<500)break}return rows;
}

function crumbs(items){$('breadcrumbs').innerHTML=link('Inicio','index.html','')+' › '+items.map((x,i)=>i===items.length-1?`<span aria-current="page">${esc(x[0])}</span>`:link(x[0],x[1],'')).join(' › ')}
function showDialog(html){$('dialog-content').innerHTML=html;dialog.showModal()}
$('close-dialog').onclick=()=>dialog.close();
function authenticated(){if(user&&user.email_confirmed_at)return true;message('Ingresá con una cuenta cuyo correo esté confirmado para participar.',true);return false}
async function load(){
 const results=await Promise.all([
  allRows('gdv_categories','*','position'),
  allRows('gdv_topics'),
  allRows('gdv_comments'),
  allRows('gdv_media'),
  allRows('profiles','id,username,full_name,avatar_url,bio,created_at,aviation_role,aircraft_flown,home_airfield,flight_hours,aviation_license,flight_simulators,hangar_intro,onboarding_completed'),
  allRows('gdv_reactions'),
  db.from('shimoda_publicaciones').select('id,titulo,contenido,categoria,fecha_publicacion,created_at').eq('publicado',true).order('created_at',{ascending:false}),
  db.from('shimoda_comentarios').select('id,publicacion_id,contenido,created_at,user_id').eq('estado','aprobado').order('created_at',{ascending:true})
 ]);
 [categories,topics,comments,media]=results;
 categories=categories.map(c=>({...c,color:categoryColors[c.slug]||c.color}));
 topics.reverse();
 profiles=new Map(results[4].map(p=>[p.id,p]));
 reactions=results[5];
 legacyShimoda=results[6].error?[]:(results[6].data||[]);
 legacyShimodaComments=results[7].error?[]:(results[7].data||[]);
 const privateMedia=media.filter(m=>!m.legacy_url&&m.path);media.filter(m=>m.legacy_url).forEach(m=>m.url=safeURL(m.legacy_url));
 for(let start=0;start<privateMedia.length;start+=100){const batch=privateMedia.slice(start,start+100),result=await db.storage.from('community-media').createSignedUrls(batch.map(m=>m.path),3600);if(result.error)throw result.error;const urls=new Map(result.data.map(m=>[m.path,m.signedUrl]));batch.forEach(m=>m.url=urls.get(m.path)||'')}

}
function account(){ $('account').innerHTML=user?`<details class="account-menu"><summary aria-label="Abrir menú de cuenta">Mi cuenta <span id="unread-notifications-badge" class="unread-notifications-badge" hidden aria-label="Notificaciones sin leer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span id="unread-notifications-count"></span></span> <span id="admin-pending-badge" class="admin-pending-badge" hidden></span> <span aria-hidden="true">⌄</span></summary><div class="account-menu-panel">${link('Notificaciones','#notificaciones','')}${isAdmin?link(isOwnerAdmin?'Moderación':'Panel de moderador','#moderacion',''):''}${isOwnerAdmin?link('Comunicados','#gestion/comunicados',''):''}${link('Mi Hangar','#hangar','')}<button type="button" data-action="logout">Salir</button></div></details>`:`${link('Ingresar','#ingresar','button primary')}`; if(isAdmin)refreshAdminPendingBadge().catch(()=>{}); if(user)refreshUnreadNotificationsBadge().catch(()=>{}); }
async function refreshUnreadNotificationsBadge(){
 if(!user)return;
 const response=await db.from('gdv_notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('read',false);
 if(response.error)return;
 const badge=$('unread-notifications-badge'),label=$('unread-notifications-count');
 if(!badge||!label)return;
 const total=Number(response.count)||0;
 badge.hidden=total===0;
 label.textContent=total>99?'99+':String(total);
 badge.setAttribute('aria-label',total+' notificaciones sin leer');
}
window.addEventListener('gdv:notifications-updated',()=>refreshUnreadNotificationsBadge().catch(()=>{}));
function closeAccountMenu(){
 const menu=document.querySelector('.account-menu[open]');
 if(menu)menu.open=false;
}
document.addEventListener('click',e=>{
 const menu=document.querySelector('.account-menu[open]');
 if(!menu)return;
 if(!menu.contains(e.target)||e.target.closest('.account-menu-panel a,.account-menu-panel button'))menu.open=false;
});

async function getLegacyPendingCounts(){
 if(!isAdmin)return {shimoda:0,compraVenta:0,aeroShop:0,fotosHangar:0};
 const [shimodaResp,compraResp,aeroShopResp,fotosResp]=await Promise.all([
  db.from('shimoda_comentarios').select('id',{count:'exact',head:true}).eq('estado','pendiente'),
  db.from('clasificados').select('id',{count:'exact',head:true}).eq('estado_publicacion','pendiente'),
  db.from('aportes_destacados').select('id',{count:'exact',head:true}).eq('seccion','tienda-seccion').eq('estado','pendiente'),
  db.from('galeria').select('id',{count:'exact',head:true}).eq('visible',false)
 ]);
 return {
  shimoda:shimodaResp.error?0:(shimodaResp.count||0),
  compraVenta:compraResp.error?0:(compraResp.count||0),
  aeroShop:aeroShopResp.error?0:(aeroShopResp.count||0),
  fotosHangar:fotosResp.error?0:(fotosResp.count||0)
 };
}
async function refreshAdminPendingBadge(){
 if(!isAdmin)return;
 const legacy=await getLegacyPendingCounts();
 const forum=topics.filter(t=>t.status==='pending').length+comments.filter(c=>c.status==='pending').length;
 const total=forum+legacy.shimoda+legacy.compraVenta+legacy.aeroShop+legacy.fotosHangar;
 const badge=$('admin-pending-badge');
 if(!badge)return;
 badge.textContent=String(total);
 badge.hidden=total===0;
 badge.setAttribute('aria-label',total===1?'1 pendiente de moderación':total+' pendientes de moderación');
}
const toolbar=(active='foro')=>`<div class="toolbar">${link('+ Crear publicación','#crear','button primary')}${link('Temáticas','#tematicas','button '+(active==='tematicas'?'active':''))}${link('Foro','#foro','button '+(active==='foro'?'active':''))}${link('Multimedia','#multimedia','button '+(active==='multimedia'?'active':''))}</div>`;
const extras=()=>`<nav class="grid annex-grid" aria-label="Más espacios de la comunidad">
 <a class="card annex-card annex-shimoda" href="index.html#shimoda">
  <div class="annex-copy"><h3>Rincón <span>Shimoda</span></h3><p>Consejos, relatos y curiosidades.</p></div>
  <span class="annex-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M32 25c-8-6-16-8-24-7v31c8-1 16 1 24 7 8-6 16-8 24-7V18c-8-1-16 1-24 7Zm0 0v31M15 28l10 4m-10 5 10 4m14-9 10-4m-10 13 10-4M23 8l18 7M41 8l-18 7"/></svg></span>
 </a>
 <a class="card annex-card annex-market" href="index.html#clasificados-seccion">
  <div class="annex-copy"><h3>Compra<span>Venta</span></h3><p>Compra, venta y búsquedas entre miembros.</p></div>
  <span class="annex-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 20 9-7 9 18-9 7-9-18Zm54 0-9-7-9 18 9 7 9-18ZM20 20l9-4 8 3 7 1M24 19l-5 7 8 5 7-7 15 14-12 14-19-17M27 42l7 6m-2-12 10 9m-5-15 10 9M15 37l-2 5 9 9 5-2"/></svg></span>
 </a>
 <a class="card annex-card annex-shop" href="index.html#tienda-seccion">
  <div class="annex-copy"><h3>Aero<span>Shop</span></h3><p>Tiendas, productos y equipamiento aeronáutico.</p></div>
  <span class="annex-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11h8l8 31h28l8-22H16M21 42l-2 6h31"/><circle cx="24" cy="55" r="4"/><circle cx="46" cy="55" r="4"/></svg></span>
 </a>
</nav>`;
function legacyShimodaCard(p){
 const replies=legacyShimodaComments.filter(c=>c.publicacion_id===p.id);
 const href='index.html?shimoda_legacy='+encodeURIComponent(p.id)+'#shimoda';
 const when=p.fecha_publicacion||p.created_at;
 return `<article class="card topic-card shimoda-topic" style="--category:#E6C280">
   <div class="post-row">
     <a href="${href}" aria-label="Abrir Rincón Shimoda">
       ${shimodaAvatar()}
     </a>
     <div class="post-body">
       <div class="meta">
         <span class="tag shimoda-badge">Robert Shimoda</span>
         <a href="${href}">Robert Shimoda</a> · ${date(when)}
       </div>
       <span class="category">Rincón Shimoda</span>
       <div class="post-layout">
         <div>
           <h3><a class="post-title" href="${href}">${esc(p.titulo||'Publicación de Robert Shimoda')}</a></h3>
           <p class="muted">${esc((p.contenido||'').slice(0,220))}</p>
         </div>
       </div>
       <div class="metrics">
         <span>${replies.length} respuestas</span>
         <span>${replies.length?'Última respuesta: '+date(replies.at(-1).created_at):'Sin respuestas'}</span>
       </div>
     </div>
   </div>
 </article>`;
}

function topicCard(t){
 const c=cat(t.category),
       replies=comments.filter(r=>r.topic_id===t.id&&r.status==='approved'),
       latestReply=replies.length?replies[replies.length-1]:null,
       votes=reactions.filter(r=>r.topic_id===t.id&&r.kind==='useful').length,
       m=media.find(m=>m.topic_id===t.id&&['image','video'].includes(m.kind)),
       isShimoda=t.special_role==='shimoda',
       authorName=isShimoda?(t.special_display_label||'Robert Shimoda'):name(t.author_id),
       topicHref=isShimoda&&t.interaction_target==='rincon_shimoda'
         ?'index.html?shimoda_topic='+encodeURIComponent(t.id)+'#shimoda'
         :'#tema/'+t.id;

 return `<article class="card topic-card ${isShimoda?'shimoda-topic':''} ${latestReply?'topic-card-replied':''} ${t.status==='pending'?'topic-card-pending':''}" style="--category:${esc(c.color)}">
   <div class="post-row">
     <a href="${isShimoda?'index.html?shimoda_topic='+encodeURIComponent(t.id)+'#shimoda':'#hangar/'+esc(t.author_id||'')}" aria-label="${isShimoda?'Abrir Rincón Shimoda':'Ver hangar de '+esc(authorName)}">
       ${isShimoda?shimodaAvatar():avatar(t.author_id)}
     </a>

     <div class="post-body">
       <div class="meta">
         ${t.pinned?'<span class="tag">Fijado</span>':''}
         ${isShimoda?'<span class="tag shimoda-badge">Robert Shimoda</span>':''}
         ${isShimoda
           ?`<a href="index.html?shimoda_topic=${encodeURIComponent(t.id)}#shimoda">${esc(authorName)}</a>`
           :link(authorName,'#hangar/'+t.author_id,'')
         }
         · ${date(t.created_at)}
       </div>

       <a class="category" href="#tematica/${esc(c.slug||'otros')}">${esc(c.name)}</a>

       <div class="post-layout">
         <div>
           <h3><a class="post-title" href="${topicHref}">${esc(t.title)}</a></h3>
           <p class="muted">${esc(t.summary||t.content.slice(0,200))}</p>
           ${t.status==='pending'?`<div class="forum-pending-notice"><span class="forum-pending-dot" aria-hidden="true"></span><strong>Pendiente de moderación</strong>${isAdmin?link('Gestionar','#moderacion','button forum-pending-manage'):''}</div>`:t.status!=='approved'?`<span class="tag status-pending">${stateLabel(t.status)}</span>`:''}
         </div>

         ${m?.url
           ?`<a href="${topicHref}" aria-label="Abrir publicación">
               ${m.kind==='video'
                 ?'<span class="thumb video-thumb">▶ Ver video</span>'
                 :`<img class="thumb" src="${esc(m.url)}" alt="${esc(t.title)}" loading="lazy">`
               }
             </a>`
           :''
         }
       </div>

       ${latestReply?`<a class="reply-highlight" href="${topicHref}">
         <span class="reply-highlight-label">RECIBIÓ UNA RESPUESTA</span>
         <strong>${esc(name(latestReply.author_id))}</strong>
         <span>respondió · ${date(latestReply.created_at)}</span>
       </a>`:''}
       <div class="metrics">
         <span>${replies.length} ${replies.length===1?'respuesta':'respuestas'}</span>
         <span>${votes} aportes útiles</span>
         <span>${latestReply?'Conversación activa':'Esperando la primera respuesta'}</span>
       </div>
     </div>
   </div>
 </article>`;
}
 
function feed(category){
 const c=cat(category);crumbs(category?[['Foro','#foro'],[c.name]]:[['Foro']]);
 app.innerHTML=`<h1>${category?esc(c.name):'Foro'}</h1>${category?'<div class="toolbar">'+link('+ Crear publicación','#crear','button primary')+link('Foro General','#foro')+'</div>':toolbar()}<div class="toolbar">${link('Quiénes somos','#quienes-somos')}${link('Normativa de la comunidad','#normativa')}</div><div class="toolbar"><input id="search" placeholder="Buscar publicaciones, autores o temáticas…" aria-label="Buscar publicaciones"><select id="sort" aria-label="Ordenar publicaciones"><option value="recent">Recientes</option><option value="useful">Más valoradas</option><option value="unanswered">Sin respuesta</option></select></div><div id="feed"></div>${category?'':extras()}`;
 const paint=()=>{const q=$('search').value.toLocaleLowerCase('es'),sort=$('sort').value;let data=topics.filter(t=>(t.status==='approved'||(isAdmin&&t.status==='pending'))&&(!category||t.category===category)&&[t.title,t.summary,t.content,name(t.author_id),cat(t.category).name,...t.tags].join(' ').toLocaleLowerCase('es').includes(q));if(sort==='unanswered')data=data.filter(t=>!comments.some(c=>c.topic_id===t.id&&c.status==='approved'));if(sort==='useful'){const count=id=>reactions.filter(r=>r.topic_id===id&&r.kind==='useful').length;data.sort((a,b)=>count(b.id)-count(a.id))}data.sort((a,b)=>Number(b.pinned)-Number(a.pinned));let html=data.map(topicCard).join('');if(!category&&sort==='recent'){const legacy=legacyShimoda.filter(p=>[p.titulo,p.contenido,p.categoria,'Robert Shimoda','Rincón Shimoda'].join(' ').toLocaleLowerCase('es').includes(q));html+=legacy.map(legacyShimodaCard).join('')}$('feed').innerHTML=html||'<p class="empty">Todavía no hay publicaciones para esta búsqueda.</p>'};$('search').oninput=paint;$('sort').onchange=paint;paint();
}
function categoryView(){crumbs([['Foro','#foro'],['Temáticas']]);app.innerHTML=`<h1>Temáticas</h1>${toolbar('tematicas')}<div class="grid">${categories.map(c=>`<a class="card topic-card" style="--category:${esc(c.color)}" href="#tematica/${esc(c.slug)}"><div class="category-tile"><span class="category-icon" aria-hidden="true">${categoryIcon(c.slug)}</span><h3>${esc(c.name)}</h3></div></a>`).join('')}</div>`}
function attachment(m){if(!m.url)return '';if(m.kind==='image')return `<img src="${esc(m.url)}" alt="Imagen de la publicación" loading="lazy">`;if(m.kind==='video')return `<video controls preload="metadata" src="${esc(m.url)}"></video>`;return `<a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">Abrir documento PDF ↗</a>`}
function reactionButton(target,id,kind){const list=reactions.filter(r=>r[target]===id&&r.kind===kind),selected=list.some(r=>r.user_id===user?.id);return `<button data-action="reaction" data-target="${target}" data-id="${id}" data-kind="${kind}" aria-pressed="${selected}">${kind==='award'?'☆ Premiar':'Aporte útil'}${list.length?' · '+list.length:''}</button>`}
function commentView(c,all,depth=0,seen=new Set()){
 if(seen.has(c.id))return '';seen=new Set(seen).add(c.id);const children=all.filter(x=>x.parent_id===c.id),parent=all.find(x=>x.id===c.parent_id);
 return `<article class="comment" id="comentario-${c.id}"><div class="post-row">${avatar(c.author_id)}<div class="post-body"><div class="meta">${link(name(c.author_id),'#hangar/'+c.author_id,'')} · ${date(c.created_at)}${edited(c)} ${c.status!=='approved'?`<span class="tag">${stateLabel(c.status)}</span>`:''}</div>${c.parent_id?`<div class="small muted">En respuesta a @${esc(name(parent?.author_id))}</div>`:''}<div class="body-text">${body(c.deleted?'Comentario eliminado por su autor':c.content)}</div><div class="actions">${c.deleted?'':`<button data-action="reply" data-id="${c.id}">Responder</button>${reactionButton('comment_id',c.id,'useful')}${reactionButton('comment_id',c.id,'award')}`}<button data-action="share" data-id="${c.topic_id}" data-comment="${c.id}">Compartir</button><button data-action="report" data-id="${c.topic_id}" data-comment="${c.id}">Denunciar</button>${c.author_id===user?.id&&!c.deleted?`<button data-action="edit-comment" data-id="${c.id}">Editar</button><button data-action="delete-comment" data-id="${c.id}">Retirar comentario</button>`:''}${children.length?`<button data-action="collapse" data-id="${c.id}" aria-expanded="true">Ocultar respuestas</button>`:''}</div></div></div><div id="children-${c.id}" class="${depth<2?'comment-children':''}">${children.map(x=>commentView(x,all,depth+1,seen)).join('')}</div></article>`;
}
async function topicView(id,highlight){
 const t=topics.find(t=>t.id===id);

 if(!t){
   app.innerHTML='<h1>Publicación no disponible</h1><p>Puede estar pendiente de revisión o haber sido retirada.</p>'+link('Volver al Foro','#foro');
   return;
 }

 if(t.special_role==='shimoda' && t.interaction_target==='rincon_shimoda'){
   window.location.href='index.html?shimoda_topic='+encodeURIComponent(t.id)+'#shimoda';
   return;
 }

 const c=cat(t.category);

 crumbs([
   ['Foro','#foro'],
   [c.name,'#tematica/'+t.category],
   [t.title]
 ]);

 replyParent=null;

 const all=comments.filter(
   r=>r.topic_id===id&&(!r.deleted||comments.some(child=>child.parent_id===r.id))
 ),
 ids=new Set(all.map(c=>c.id));
 app.innerHTML=`<article class="card topic-card" style="--category:${esc(c.color)}"><div class="post-row">${avatar(t.author_id)}<div class="post-body"><div class="meta">${t.pinned?'<span class="tag">Fijado</span>':''}${link(name(t.author_id),'#hangar/'+t.author_id,'')} · ${date(t.created_at)}</div><span class="tag">${esc(c.name)}</span><span class="tag">${stateLabel(t.state)}</span>${t.status!=='approved'?`<span class="tag">${stateLabel(t.status)}</span>`:''}<h1>${esc(t.title)}</h1><p class="meta">${edited(t).replace(/^ · /,'')}</p><p class="muted">${esc(t.summary)}</p><div class="body-text">${body(t.content)}</div>${t.travel?`<dl class="profile-fields">${Object.entries(t.travel).filter(([,v])=>v).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`:''}<div class="attachments">${media.filter(m=>m.topic_id===id).map(attachment).join('')}</div>${safeURL(t.source_url)?`<p><a href="${esc(safeURL(t.source_url))}" target="_blank" rel="noopener noreferrer">Fuente o enlace relacionado ↗</a></p>`:''}<div>${t.tags.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div><div class="actions">${reactionButton('topic_id',id,'useful')}${reactionButton('topic_id',id,'award')}<button data-action="share" data-id="${id}">Compartir</button><button data-action="save" data-id="${id}" aria-pressed="false">Guardar</button><button data-action="follow" data-id="${id}" aria-pressed="false">Seguir tema</button><button data-action="report" data-id="${id}">Denunciar</button>${t.author_id===user?.id?`<a class="button" href="#editar/${id}">Editar</a><button data-action="request-removal" data-id="${id}">Solicitar retiro</button>`:''}${isAdmin?`<button type="button" data-admin-delete="topic" data-id="${id}" class="admin-delete-topic">Eliminar publicación (administración)</button>`:''}</div></div></div></article>${t.status==='approved'?`<h2>Conversación</h2>${all.filter(r=>!r.parent_id||!ids.has(r.parent_id)).map(r=>commentView(r,all)).join('')||'<p class="muted">Todavía no hay respuestas.</p>'}${t.state==='closed'||t.state==='archived'?'<p>Este tema está cerrado.</p>':`<form id="reply-form"><label id="reply-label" for="reply">Comentar la publicación</label><textarea id="reply" maxlength="10000" required placeholder="Compartí tu aporte…"></textarea><div class="toolbar"><button class="primary">Enviar respuesta</button><button type="button" data-action="cancel-reply">Cancelar respuesta</button></div></form>`}`:``}`;
 if($('reply-form'))$('reply-form').onsubmit=async e=>{e.preventDefault();if(!authenticated())return;await busy(e.submitter,async()=>{checked(await db.from('gdv_comments').insert({topic_id:id,parent_id:replyParent,author_id:user.id,content:$('reply').value.trim()}).select());await load();await route();message('Respuesta enviada. Si corresponde revisión previa, aparecerá públicamente después de su aprobación.')})};
 if(user){for(const [table,action] of [['gdv_saved','save'],['gdv_follows','follow']]){const r=await db.from(table).select('topic_id').eq('topic_id',id).eq('user_id',user.id).maybeSingle();const b=app.querySelector(`[data-action="${action}"]`);if(b&&r.data){b.setAttribute('aria-pressed','true');b.textContent=action==='save'?'Guardado':'Siguiendo'}}}
 if(highlight)document.getElementById('comentario-'+highlight)?.scrollIntoView({block:'center'});
}
async function busy(button,fn){if(button)button.disabled=true;try{await fn()}catch(e){message(e.message||'No se pudo completar la operación.',true)}finally{if(button)button.disabled=false}}
async function galeriaComunidad(){
 crumbs([['Foro','#foro'],['Galería']]);
 app.innerHTML='<h1>Galería aeronáutica</h1>'+
  '<p class="muted">Vuelos, aeronaves y momentos compartidos por nuestra comunidad. Solo se muestran archivos aprobados.</p>'+
  '<div class="toolbar">'+link('Mi Hangar','#hangar','button')+link('Multimedia del Foro','#multimedia','button')+'</div>'+
  '<p id="galeria-estado" role="status">Cargando imágenes aprobadas…</p>'+
  '<div id="gdv-galeria-calesita" class="gdv-galeria-calesita" hidden>'+
   '<button type="button" id="gdv-galeria-anterior" class="gdv-galeria-nav" aria-label="Fotografía anterior" title="Anterior">&#10094;</button>'+
   '<div id="gdv-galeria-ventana" class="gdv-galeria-ventana" tabindex="0" role="region" aria-label="Calesita de fotografías de la comunidad">'+
    '<div id="gdv-galeria-pista" class="gdv-galeria-pista"></div>'+
   '</div>'+
   '<button type="button" id="gdv-galeria-siguiente" class="gdv-galeria-nav" aria-label="Fotografía siguiente" title="Siguiente">&#10095;</button>'+
   '<p id="gdv-galeria-contador" class="gdv-galeria-contador" aria-live="polite"></p>'+
  '</div>';
 const {data,error}=await db.from('galeria')
  .select('archivo,user_id,nombre_usuario,created_at,visible')
  .eq('visible',true).order('created_at',{ascending:false}).limit(100);
 const estado=$('galeria-estado'),calesita=$('gdv-galeria-calesita'),pista=$('gdv-galeria-pista');
 if(!pista)return;
 if(error){
  console.error('No se pudo consultar la galería:',error);
  estado.textContent='No se pudo cargar la Galería. Intentá nuevamente.';
  return;
 }
 const publicaciones=[];
 for(const fila of data||[]){
  const archivo=typeof fila.archivo==='string'?fila.archivo:'';
  const autor=typeof fila.user_id==='string'?fila.user_id:'';
  const esVideo=/\.(mp4|webm|mov)$/i.test(archivo);
  let src='';
  if(esVideo){
   if(autor&&archivo.startsWith(autor+'/')&&!archivo.includes('..')&&
      /^[A-Za-z0-9_./-]+$/.test(archivo)){
    src=db.storage.from('hangar-fotos').getPublicUrl(archivo).data.publicUrl;
   }
  }else{
   src=resolverFotoDeHangar(archivo,autor);
  }
  if(src&&safeURL(src))publicaciones.push({fila,src,esVideo,autor});
 }
 if(!publicaciones.length){
  estado.textContent='Todavía no hay fotos ni videos aprobados. Podés compartir una fotografía desde Mi Hangar.';
  return;
 }
 let bloqueoAmpliacion=0;
 publicaciones.forEach(({fila,src,esVideo,autor},indice)=>{
  const lamina=document.createElement('article');
  lamina.className='gdv-galeria-lamina';
  lamina.setAttribute('aria-label','Publicación '+(indice+1)+' de '+publicaciones.length);
  const marco=document.createElement('div');
  marco.className='gdv-galeria-marco';
  if(esVideo){
   const reproductor=document.createElement('video');
   reproductor.src=src;reproductor.controls=true;reproductor.preload='metadata';reproductor.playsInline=true;
   reproductor.setAttribute('aria-label','Video de la comunidad');
   marco.appendChild(reproductor);
  }else{
   // Fondo ambiental: reutiliza la foto aprobada sin modificar el archivo en Cloudflare.
   marco.classList.add('tiene-fondo');
   const fondo=document.createElement('img');
   fondo.className='gdv-galeria-fondo';
   fondo.src=src;
   fondo.alt='';
   fondo.setAttribute('aria-hidden','true');
   fondo.loading=indice<2?'eager':'lazy';
   fondo.decoding='async';
   marco.appendChild(fondo);
   const boton=document.createElement('button');
   boton.type='button';boton.className='gdv-galeria-ampliar';
   boton.setAttribute('aria-label','Ver fotografía ampliada');
   boton.title='Hacé clic para ampliar';
   const imagen=document.createElement('img');
   imagen.src=src;imagen.alt='Fotografía aeronáutica de la comunidad';imagen.loading=indice<2?'eager':'lazy';
   boton.appendChild(imagen);
   boton.addEventListener('click',()=>{
    if(Date.now()<bloqueoAmpliacion)return;
    showDialog('');
    const panel=$('dialog-content');
    const grande=document.createElement('img');
    grande.src=src;grande.alt=imagen.alt;grande.className='galeria-comunidad-grande';
    const descripcion=document.createElement('p');
    descripcion.className='meta';
    descripcion.textContent='Compartida por '+(fila.nombre_usuario||name(autor))+' · '+date(fila.created_at);
    panel.replaceChildren(grande,descripcion);
   });
   marco.appendChild(boton);
  }
  const pie=document.createElement('div');
  pie.className='gdv-galeria-pie';
  const autorTexto=document.createElement('strong');
  autorTexto.textContent=fila.nombre_usuario||name(autor);
  const fecha=document.createElement('time');
  fecha.className='meta';fecha.textContent=date(fila.created_at);
  if(fila.created_at)fecha.dateTime=fila.created_at;
  pie.append(autorTexto,fecha);
  lamina.append(marco,pie);
  pista.appendChild(lamina);
 });
 calesita.hidden=false;
 let actual=0;
 const anterior=$('gdv-galeria-anterior'),siguiente=$('gdv-galeria-siguiente');
 const contador=$('gdv-galeria-contador'),ventana=$('gdv-galeria-ventana');
 // En pantallas móviles, la altura acompaña la proporción de cada foto o video.
 const consultaGaleriaMovil=window.matchMedia('(max-width:700px)');
 const controladorGaleria=new AbortController();
 function ajustarAlturaGaleria(){
  if(!calesita.isConnected)return;
  if(!consultaGaleriaMovil.matches){
   ventana.style.removeProperty('height');
   return;
  }
  const laminaVisible=pista.children[actual];
  if(!laminaVisible)return;
  const alto=Math.ceil(laminaVisible.getBoundingClientRect().height);
  if(alto>0)ventana.style.height=(alto+4)+'px';
 }
 const refrescarAlturaGaleria=()=>requestAnimationFrame(ajustarAlturaGaleria);
 pista.querySelectorAll('.gdv-galeria-ampliar img, .gdv-galeria-marco video').forEach(medio=>{
  medio.addEventListener(medio.tagName==='VIDEO'?'loadedmetadata':'load',refrescarAlturaGaleria);
 });
 window.addEventListener('resize',refrescarAlturaGaleria,{signal:controladorGaleria.signal});
 window.addEventListener('hashchange',()=>controladorGaleria.abort(),{once:true});

 function mostrar(direccion){
  const total=publicaciones.length;
  if(total<2)return;
  pista.querySelectorAll('video').forEach(video=>video.pause());
  actual=(actual+direccion+total)%total;
  pista.style.transform='translateX(-'+(actual*100)+'%)';
  contador.textContent=(actual+1)+' de '+total;
  refrescarAlturaGaleria();
 }
 anterior.disabled=siguiente.disabled=publicaciones.length<2;
 anterior.addEventListener('click',()=>mostrar(-1));
 siguiente.addEventListener('click',()=>mostrar(1));
 ventana.addEventListener('keydown',event=>{
  if(event.target.closest('video'))return;
  if(event.key==='ArrowLeft'){event.preventDefault();mostrar(-1)}
  if(event.key==='ArrowRight'){event.preventDefault();mostrar(1)}
 });
 let toqueInicial=null;
 ventana.addEventListener('touchstart',event=>{
  toqueInicial=event.changedTouches[0]?.clientX??null;
 },{passive:true});
 ventana.addEventListener('touchend',event=>{
  if(toqueInicial===null)return;
  const desplazamiento=(event.changedTouches[0]?.clientX??toqueInicial)-toqueInicial;
  toqueInicial=null;
  if(Math.abs(desplazamiento)>55){
   bloqueoAmpliacion=Date.now()+350;
   mostrar(desplazamiento<0?1:-1);
  }
 },{passive:true});
 estado.textContent=publicaciones.length===1?'1 publicación aprobada':publicaciones.length+' publicaciones aprobadas';
 contador.textContent='1 de '+publicaciones.length;
 refrescarAlturaGaleria();
}
function multimedia(){crumbs([['Foro','#foro'],['Multimedia']]);app.innerHTML=`<h1>Multimedia</h1>${toolbar('multimedia')}<div class="toolbar"><select id="media-kind" aria-label="Tipo de archivo"><option value="all">Fotos y videos</option><option value="image">Fotos</option><option value="video">Videos</option></select><select id="media-category" aria-label="Temática"><option value="">Todas las temáticas</option>${categories.map(c=>`<option value="${c.slug}">${esc(c.name)}</option>`).join('')}</select></div><div id="media-list" class="media-grid"></div>`;const paint=()=>{$('media-list').innerHTML=media.filter(m=>{const t=topics.find(t=>t.id===m.topic_id);return t?.status==='approved'&&m.kind!=='pdf'&&m.url&&($('media-kind').value==='all'||m.kind===$('media-kind').value)&&(!$('media-category').value||t.category===$('media-category').value)}).map(m=>{const t=topics.find(t=>t.id===m.topic_id);return `<article class="card">${attachment(m)}<h3>${link(t.title,'#tema/'+t.id,'')}</h3><div class="meta">${esc(name(t.author_id))} · ${esc(cat(t.category).name)}</div></article>`}).join('')||'<p class="empty">Todavía no hay archivos publicados con estos filtros.</p>'};$('media-kind').onchange=paint;$('media-category').onchange=paint;paint()}
async function uploadFiles(files,topicId){
 for(const f of files){let data=f,kind,ext;const mimes={'image/jpeg':['image','jpg',10],'image/png':['image','png',10],'image/webp':['image','webp',10],'video/mp4':['video','mp4',40],'video/webm':['video','webm',40],'application/pdf':['pdf','pdf',15]};const rule=mimes[f.type];if(!rule||f.size>rule[2]*1024*1024)throw new Error('Formato o tamaño no permitido: '+f.name);[kind,ext]=rule;
 if(kind==='image'){const bitmap=await createImageBitmap(f);const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();data=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));if(!data)throw new Error('No se pudo preparar la imagen');ext='webp'}
 if(kind==='image'){
  const {data:sessionData,error:sessionError}=await db.auth.getSession();
  if(sessionError||!sessionData.session?.access_token)throw new Error('Tu sesión venció. Volvé a ingresar.');
  if(data.size>4*1024*1024)throw new Error('La foto optimizada supera los 4 MB permitidos.');
  const response=await fetch(cfg.url+'/functions/v1/r2-upload-image',{
   method:'POST',
   headers:{Authorization:'Bearer '+sessionData.session.access_token,apikey:cfg.key,'Content-Type':'image/webp'},
   body:data
  });
  const uploaded=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(uploaded.error||'No se pudo subir la fotografía a Cloudflare.');
  if(typeof uploaded.path!=='string'||!uploaded.path.startsWith('imagenes/'+user.id+'/')||
     uploaded.url!=='https://media.gentedevuelo.com/'+uploaded.path)
   throw new Error('Cloudflare devolvió una dirección de imagen inválida.');
  const result=await db.from('gdv_media').insert({topic_id:topicId,owner_id:user.id,legacy_url:uploaded.url,kind});
  if(result.error)throw new Error('La foto se subió a Cloudflare, pero no se pudo asociar a la publicación: '+result.error.message);
 }else{
  const path=user.id+'/'+crypto.randomUUID()+'.'+ext;
  checked(await db.storage.from('community-media').upload(path,data,{contentType:data.type,upsert:false}));
  const r=await db.from('gdv_media').insert({topic_id:topicId,owner_id:user.id,path,kind});
  if(r.error){await db.storage.from('community-media').remove([path]);throw new Error(r.error.message)}
 }
 }
}
function editor(editId){
 if(!authenticated()){app.innerHTML=link('Ingresar para publicar','#ingresar','button primary');return}const t=topics.find(t=>t.id===editId);const adminEditing=Boolean(editId&&t&&isAdmin&&t.author_id!==user.id);if(editId&&(!t||(t.author_id!==user.id&&!isAdmin))){app.innerHTML='<p>No podés editar esta publicación.</p>';return}
 crumbs([['Foro','#foro'],[t?'Editar publicación':'Crear publicación']]);
 app.innerHTML=`<section class="editor"><h1>${t?(adminEditing?'Corregir publicación antes de moderar':'Editar publicación'):'Crear publicación'}</h1>${adminEditing?'<p class="rule-box"><strong>Edición de moderación:</strong> podés corregir errores de escritura sin cambiar el autor. La publicación seguirá pendiente hasta que decidas aprobarla.</p>':''}<form id="topic-form"><label for="topic-category">Temática</label><select id="topic-category">${categories.map(c=>`<option value="${c.slug}" ${t?.category===c.slug?'selected':''}>${esc(c.name)}</option>`).join('')}</select><label for="topic-title">Título</label><input id="topic-title" required minlength="3" maxlength="160" value="${esc(t?.title||'')}"><label for="topic-content">Contenido completo</label><textarea id="topic-content" required maxlength="40000" rows="10">${esc(t?.content||'')}</textarea><div id="preview" class="preview body-text" hidden></div><label for="topic-source">Enlace relacionado o fuente (opcional)</label><input id="topic-source" type="url" value="${esc(t?.source_url||'')}" placeholder="https://"><div id="travel-fields" class="field-grid" hidden>${['fecha','salida','destino','escalas','aeronave'].map(k=>`<label>${{fecha:'Fecha de la travesía',salida:'Origen',destino:'Destino',escalas:'Escalas',aeronave:'Aeronave'}[k]}<input data-travel="${k}" type="${k==='fecha'?'date':'text'}" value="${esc(t?.travel?.[k]||'')}"></label>`).join('')}</div><label class="legal"><input id="topic-commercial" type="checkbox" ${t?.is_commercial?'checked':''}> Publicación comercial o publicitaria (siempre requiere revisión)</label><label for="topic-files">Fotos, videos o PDF (opcional)</label><input id="topic-files" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf"><p id="topic-files-status" class="small" role="status" aria-live="polite">Ningún archivo seleccionado.</p><p class="small muted">Imágenes hasta 10 MB; videos hasta 40 MB; PDF hasta 15 MB. Hasta 6 archivos por publicación.</p><div class="toolbar"><button class="primary" type="submit">${t?'Guardar cambios':'Publicar'}</button>${link('Volver','#foro')}</div><p id="draft-status" class="small muted" role="status"></p></form></section>`;
 let selectedFiles=[];const fileInput=$('topic-files');const fileStatus=$('topic-files-status');fileInput.addEventListener('change',()=>{const picked=Array.from(fileInput.files||[]);if(picked.length)selectedFiles=picked;fileStatus.textContent=selectedFiles.length?selectedFiles.map(f=>f.name).join(' · ')+' — '+selectedFiles.length+' archivo(s) listo(s) para publicar.':'Ningún archivo seleccionado.';});
 const draftKey='gdv-draft-'+user.id+(editId||'new');let saved;try{saved=JSON.parse(localStorage.getItem(draftKey)||'null')}catch{}
 if(saved){for(const f of app.querySelectorAll('[data-travel]'))f.value=saved.travel?.[f.dataset.travel]||f.value;for(const [k,v] of Object.entries(saved)){const f=$('topic-'+k);if(f)f.value=v}$('draft-status').textContent='Borrador recuperado en este dispositivo.'}
 const travel=()=>{$('travel-fields').hidden=$('topic-category').value!=='travesias'};travel();$('topic-category').onchange=travel;
 $('topic-form').oninput=()=>{dirty=true;const d={};for(const k of ['category','title','content','source'])d[k]=$('topic-'+k).value;d.travel=Object.fromEntries([...app.querySelectorAll('[data-travel]')].map(f=>[f.dataset.travel,f.value]));try{localStorage.setItem(draftKey,JSON.stringify(d));$('draft-status').textContent='Borrador guardado en este dispositivo.'}catch{$('draft-status').textContent='No se pudo guardar el borrador en este dispositivo.'}};
 $('topic-form').onsubmit=async e=>{e.preventDefault();await busy(e.submitter,async()=>{const files=selectedFiles.length?selectedFiles:Array.from($('topic-files').files||[]);if(files.length+media.filter(m=>m.topic_id===editId).length>6)throw new Error('Podés adjuntar hasta 6 archivos.');const category=$('topic-category').value,source=$('topic-source').value.trim();if(source&&!safeURL(source))throw new Error('El enlace debe comenzar con https:// o http://.');for(const f of files){if(!['image/jpeg','image/png','image/webp','video/mp4','video/webm','application/pdf'].includes(f.type))throw new Error('Formato no permitido: '+f.name);const max=f.type.startsWith('image/')?10:f.type==='application/pdf'?15:40;if(f.size>max*1024*1024)throw new Error('Archivo demasiado grande: '+f.name)}const payload={is_commercial:$('topic-commercial').checked,author_id:t?.author_id||user.id,category,title:$('topic-title').value.trim(),summary:t?.summary||'',content:$('topic-content').value.trim(),source_url:source||null,tags:t?.tags||[],travel:category==='travesias'?Object.fromEntries([...app.querySelectorAll('[data-travel]')].map(f=>[f.dataset.travel,f.value])):null};const r=t?await db.from('gdv_topics').update(payload).eq('id',t.id).select().single():await db.from('gdv_topics').insert(payload).select().single();const record=checked(r);try{await uploadFiles(files,record.id)}catch(error){dirty=false;await load();history.pushState(null,'','#tema/'+record.id);await route();message('El texto quedó guardado, pero algún archivo no pudo subirse: '+error.message,true);return}dirty=false;localStorage.removeItem(draftKey);await load();history.pushState(null,'','#tema/'+record.id);await route();message(record.status==='pending'?(adminEditing?'Corrección guardada. La publicación sigue pendiente de aprobación.':'Tu publicación quedó pendiente de aprobación.'):'Publicación guardada.');})};
}
const URL_FOTOS_HANGAR_R2='https://media.gentedevuelo.com/imagenes/';
function resolverFotoDeHangar(archivo,id){
 if(typeof archivo!=='string'||typeof id!=='string')return '';
 if(archivo.startsWith(URL_FOTOS_HANGAR_R2+id+'/')&&
    /^https:\/\/media\.gentedevuelo\.com\/imagenes\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(archivo))return archivo;
 if(archivo.startsWith(id+'/')&&/\.(jpg|jpeg|png|webp)$/i.test(archivo)&&
    !archivo.includes('..')&&/^[0-9a-zA-Z_.\/-]+$/.test(archivo))
   return db.storage.from('hangar-fotos').getPublicUrl(archivo).data.publicUrl;
 return '';
}
async function optimizarFotoGaleria(archivo){
 if(!archivo||!['image/jpeg','image/png','image/webp'].includes(archivo.type)||
    archivo.size===0||archivo.size>5*1024*1024)
   throw new Error('La fotografía debe ser JPG, PNG o WebP de hasta 5 MB.');
 const bitmap=await createImageBitmap(archivo);
 try{
  const canvas=document.createElement('canvas');
  const ratio=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
  canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('No se pudo preparar la fotografía.');
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.8));
  canvas.width=canvas.height=1;
  if(!blob||!blob.size||blob.size>4*1024*1024)throw new Error('La fotografía optimizada debe pesar menos de 4 MB.');
  return blob;
 }finally{if(bitmap.close)bitmap.close();}
}
// Procesa únicamente rutas R2 registradas por Supabase tras una eliminación real.
async function procesarLimpiezaR2Comunidad(){
 try{
  const {data:{session},error} = await db.auth.getSession();
  if(error||!session?.access_token)return false;
  const respuesta=await fetch(cfg.url+'/functions/v1/r2-cleanup-queue',{
   method:'POST',
   headers:{Authorization:'Bearer '+session.access_token,apikey:cfg.key,'Content-Type':'application/json'},
   body:'{}'
  });
  const resultado=await respuesta.json().catch(()=>({}));
  if(!respuesta.ok||resultado.errors){
   console.warn('Queda limpieza R2 pendiente de reintento:',resultado.error||resultado.errors);
   return false;
  }
  return true;
 }catch(error){console.warn('No se pudo limpiar R2 ahora:',error);return false}
}
async function listarFotosDeHangar(id,propio){
 const elemento=$('hangar-fotos-galeria');
 if(!elemento)return;
 let consulta=db.from('galeria').select('id,archivo,created_at,visible')
    .eq('user_id',id).order('created_at',{ascending:false}).limit(60);
 if(!propio)consulta=consulta.eq('visible',true);
 const {data,error}=await consulta;
 if(error){console.error('No se pudo cargar la Galería de Hangar:',error);elemento.textContent='No se pudieron cargar las fotografías.';return}
 elemento.replaceChildren();
 const fotos=(data||[]).map(row=>({...row,url:resolverFotoDeHangar(row.archivo,id)})).filter(row=>row.url);
 if(!fotos.length){elemento.textContent='Todavía no hay fotografías en este Hangar.';return}
 for(const foto of fotos){
  const figura=document.createElement('figure');figura.className='hangar-galeria-foto';
  const img=document.createElement('img');img.src=foto.url;img.alt='Fotografía compartida en Mi Hangar';img.loading='lazy';
  const descripcion=document.createElement('figcaption');
  descripcion.textContent=(foto.visible?'Publicada':'Pendiente de aprobación')+' · '+date(foto.created_at);
  figura.append(img,descripcion);
  if(propio&&user?.id===id){
   const boton=document.createElement('button');
   boton.type='button';
   boton.className='hangar-foto-eliminar';
   boton.textContent='Eliminar foto';
   boton.setAttribute('aria-label','Eliminar fotografía de Mi Hangar');
   boton.addEventListener('click',()=>busy(boton,async()=>{
    if(!confirm('¿Eliminar definitivamente esta fotografía de Mi Hangar?'))return;
    const {data:eliminadas,error:borradoError}=await db.from('galeria')
      .delete().eq('id',foto.id).eq('user_id',user.id).select('id');
    if(borradoError||!eliminadas?.length)throw new Error(borradoError?.message||'No se pudo eliminar la fotografía.');
    const esR2=foto.url.startsWith(URL_FOTOS_HANGAR_R2);
    if(esR2){
     const limpio=await procesarLimpiezaR2Comunidad();
     message(limpio?'Fotografía eliminada. Limpieza R2 procesada.':'Fotografía eliminada. Limpieza R2 registrada para reintentar.');
    }else{
     const resultado=await db.storage.from('hangar-fotos').remove([foto.archivo]);
     message(resultado.error?'Foto retirada del Hangar; la limpieza del archivo está pendiente.':'Foto eliminada del Hangar.');
    }
    await listarFotosDeHangar(user.id,true);
   }));
   figura.appendChild(boton);
  }
  elemento.appendChild(figura);
 }
}
async function hangar(id){id=id||user?.id;if(!id){app.innerHTML=link('Ingresar a Mi Hangar','#ingresar','button primary');return}const p=profile(id),own=id===user?.id;crumbs([['Foro','#foro'],[own?'Mi Hangar':'Hangar de '+name(id)]]);const authored=topics.filter(t=>t.author_id===id),replied=comments.filter(c=>c.author_id===id);
 app.innerHTML=`<section class="card"><div class="post-row">${avatar(id)}<div class="post-body"><h1>${esc(name(id))}</h1><p>${esc(p.hangar_intro||p.bio||'Miembro de Gente de Vuelo.')}</p><p class="meta">Miembro desde ${date(p.created_at)}</p></div></div><dl class="profile-fields">${[['Actividad','aviation_role'],['Licencia','aviation_license'],['Horas de vuelo','flight_hours'],['Aeropuerto base','home_airfield'],['Aeronaves','aircraft_flown'],['Simulador de vuelo','flight_simulators']].filter(([,k])=>p[k]!==null&&p[k]!==undefined&&p[k]!=='').map(([n,k])=>`<div><dt>${n}</dt><dd>${esc(p[k])}</dd></div>`).join('')}</dl>${own?link('Editar perfil','#perfil'):''}</section><div class="toolbar"><button data-hangar="posts">Publicaciones</button><button data-hangar="comments">Respuestas</button><button data-hangar="media">Multimedia</button><button data-hangar="trips">Travesías</button>${own?'<button data-hangar="saved">Guardados privados</button>':''}${own&&isAdmin?link('Moderación privada','#moderacion'):''}</div><div id="hangar-content"></div>`;

 const fotosPanel=document.createElement('section');
 fotosPanel.className='card hangar-fotos-panel';
 fotosPanel.innerHTML='<h2>'+(own?'Fotografías de Mi Hangar':'Fotografías del Hangar')+'</h2>'+
   (own?'<p class="meta">Subí una fotografía de tus vuelos o aeronaves. Se publicará después de la aprobación.</p><form id="hangar-galeria-form"><label for="hangar-galeria-archivo">Fotografía (JPG, PNG o WebP, hasta 5 MB)</label><input id="hangar-galeria-archivo" type="file" accept="image/jpeg,image/png,image/webp" required><div class="toolbar"><button type="submit" class="primary">Subir foto a Mi Hangar</button></div><p id="hangar-galeria-estado" role="status" aria-live="polite"></p></form>':'<p class="meta">Fotografías aprobadas de este integrante.</p>')+
   '<div id="hangar-fotos-galeria" class="hangar-fotos-galeria">Cargando fotografías…</div>';
 app.querySelector('.toolbar').before(fotosPanel);
 await listarFotosDeHangar(id,own);
 // Reintenta tareas R2 pendientes al entrar al Hangar propio, sin bloquear la pantalla.
 if(own) void procesarLimpiezaR2Comunidad();
 if(own){
  $('hangar-galeria-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{
   const campo=$('hangar-galeria-archivo'),estado=$('hangar-galeria-estado');
   try{
    estado.textContent='Preparando fotografía…';
    const blob=await optimizarFotoGaleria(campo.files[0]);
    const {data:sesion,error:errSesion}=await db.auth.getSession();
    if(errSesion||!sesion.session?.access_token||sesion.session.user?.id!==user.id)throw new Error('Tu sesión venció. Volvé a ingresar.');
    estado.textContent='Subiendo fotografía a Cloudflare R2…';
    const respuesta=await fetch(cfg.url+'/functions/v1/r2-upload-image',{
     method:'POST',
     headers:{Authorization:'Bearer '+sesion.session.access_token,apikey:cfg.key,'Content-Type':'image/webp'},
     body:blob
    });
    const objeto=await respuesta.json().catch(()=>({}));
    if(!respuesta.ok)throw new Error(objeto.error||'No se pudo subir la fotografía a Cloudflare.');
    if(typeof objeto.url!=='string'||typeof objeto.path!=='string'||!resolverFotoDeHangar(objeto.url,user.id)||
       objeto.url!==('https://media.gentedevuelo.com/'+objeto.path))
      throw new Error('La dirección devuelta por Cloudflare no es válida.');
    const registro=await db.from('galeria').insert({
     user_id:user.id,archivo:objeto.url,nombre_usuario:profile(user.id).full_name||name(user.id),visible:false
    });
    if(registro.error)throw new Error('La foto llegó a Cloudflare R2, pero no pudo registrarse en la galería. Avisá al administrador para su limpieza.');
    campo.value='';
    await listarFotosDeHangar(user.id,true);
    estado.textContent='Foto enviada correctamente. Quedó pendiente de aprobación.';
    message('Foto enviada correctamente. Quedó pendiente de aprobación.');
   }catch(error){estado.textContent=error.message||'Error al subir la foto.';throw error}
  })};
 }
 const paint=async type=>{if(type==='comments')$('hangar-content').innerHTML=replied.map(c=>`<article class="card"><div class="meta">${date(c.created_at)}</div><p>${esc(c.deleted?'Comentario eliminado por su autor':c.content)}</p>${link('Ver conversación','#tema/'+c.topic_id+'/'+c.id)}</article>`).join('')||'<p>Sin respuestas públicas.</p>';else{let list=authored;if(type==='trips')list=list.filter(t=>t.category==='travesias');if(type==='media')list=list.filter(t=>media.some(m=>m.topic_id===t.id));if(type==='saved'){const rows=checked(await db.from('gdv_saved').select('topic_id').eq('user_id',user.id));list=topics.filter(t=>rows.some(s=>s.topic_id===t.id))}$('hangar-content').innerHTML=list.map(topicCard).join('')||'<p>Todavía no hay publicaciones en este apartado.</p>'}};app.querySelectorAll('[data-hangar]').forEach(b=>b.onclick=()=>busy(b,()=>paint(b.dataset.hangar)));await paint('posts');
}
async function notifications(){
 if(!authenticated()){app.innerHTML=link('Ingresar para ver tus notificaciones','#ingresar','button primary');return}
 crumbs([['Notificaciones']]);
 const rows=checked(await db.from('gdv_notifications').select('*').order('created_at',{ascending:false}).limit(100));
 app.innerHTML=`<div class="toolbar" style="justify-content:space-between;align-items:center;"><h1 style="margin:0;">Notificaciones</h1>${rows.length?'<button id="delete-all-notifications" type="button">Borrar todas</button>':''}</div>`+
   (rows.map(n=>`<article class="card"><p class="notification-message">${esc(n.message)}</p><span class="meta">${date(n.created_at)}${n.read?'':' · Nueva'}</span> ${n.topic_id?link('Abrir','#tema/'+n.topic_id):''}</article>`).join('')||'<p>No tenés notificaciones.</p>');
 if(rows.length){
   const borrarTodas=$('delete-all-notifications');
   if(borrarTodas)borrarTodas.onclick=()=>busy(borrarTodas,async()=>{
     if(!confirm('¿Borrar todas tus notificaciones?'))return;
     checked(await db.from('gdv_notifications').delete().eq('user_id',user.id));
     message('Se borraron todas tus notificaciones.');
     await notifications();
   });
 }
 checked(await db.from('gdv_notifications').update({read:true}).eq('user_id',user.id).eq('read',false));
 refreshUnreadNotificationsBadge().catch(()=>{});
}
async function moderation(){
 if(!isAdmin){app.innerHTML='<h1>Acceso restringido</h1>';return}
 crumbs([['Moderación']]);
 const contacts=isOwnerAdmin?checked(await db.from('gdv_contact').select('*').order('created_at',{ascending:false}).limit(100)):[];
 const reports=checked(await db.from('gdv_reports').select('*').eq('status','pending').order('created_at'));
 const generalPending=reports.length;
 app.innerHTML=`<h1>Moderación de la comunidad</h1>
 <div class="toolbar">${link('Gestionar publicaciones, cuentas y temáticas','#gestion','button moderation-action '+(generalPending>0?'has-pending':''))}</div>
 <p>${link('Administrar Shimoda, CompraVenta y contenido anterior','moderacion.html','button moderation-action')} ${isOwnerAdmin?link('Comunicados para integrantes','#gestion/comunicados','button moderation-action'):''}</p>
 <h2>Denuncias</h2>${reports.map(r=>`<article class="card"><p>${esc(r.reason)}</p>${link('Revisar contexto','#tema/'+r.topic_id+(r.comment_id?'/'+r.comment_id:''))}<button data-review="gdv_reports" data-id="${r.id}" data-status="resolved">Marcar revisada</button></article>`).join('')||'<p>Sin denuncias pendientes.</p>'}
 ${isOwnerAdmin?'<h2>Consultas privadas</h2>':''}${contacts.map(c=>`<article class="card contact-admin-card" data-contact-card="${c.id}"><h3>${esc(c.subject)}</h3><p>${esc(c.message)}</p><p class="meta">${esc(name(c.user_id))} · ${date(c.created_at)}</p>${c.admin_reply?`<div class="rule-box"><strong>Respuesta enviada</strong><p>${esc(c.admin_reply)}</p><span class="meta">${date(c.replied_at)}</span></div>`:''}<form data-contact-reply="${c.id}"><label for="reply-${c.id}">Responder al integrante</label><textarea id="reply-${c.id}" required minlength="1" maxlength="4000">${esc(c.admin_reply||'')}</textarea><div class="toolbar"><button class="primary">Enviar respuesta</button><button type="button" data-contact-delete="${c.id}">Eliminar consulta</button></div></form></article>`).join('')||'<p>Sin consultas.</p>'}`;

 app.querySelectorAll('[data-contact-reply]').forEach(form=>{
   form.onsubmit=e=>{
     e.preventDefault();
     const id=form.dataset.contactReply;
     const textarea=form.querySelector('textarea');
     const reply=textarea.value.trim();
     if(!reply)return;
     busy(e.submitter,async()=>{
       checked(await db.rpc('gdv_reply_contact',{p_contact_id:id,p_reply:reply}));
       message('Respuesta enviada. El integrante la recibió en Notificaciones.');
       await moderation();
     });
   };
 });
 app.querySelectorAll('[data-contact-delete]').forEach(button=>{
   button.onclick=()=>busy(button,async()=>{
     if(!confirm('¿Eliminar definitivamente esta consulta?'))return;
     checked(await db.from('gdv_contact').delete().eq('id',button.dataset.contactDelete));
     message('Consulta eliminada.');
     await moderation();
   });
 });
}

async function administration(initialSection='topics'){
 if(!isAdmin || (!isOwnerAdmin && initialSection!=='topics')){app.innerHTML='<h1>Acceso restringido</h1>';return}
 crumbs([['Moderación','#moderacion'],['Gestión']]);
 const pendingTopics=topics.filter(t=>t.status==='pending').length;
 app.innerHTML=`<h1>Gestión de la comunidad</h1><div class="toolbar">${link('Revisar pendientes','#moderacion','button '+(pendingTopics?'has-pending':''))}<button data-admin-tab="topics">Publicaciones${pendingTopics?` <span class="admin-count-badge">${pendingTopics}</span>`:''}</button>${isOwnerAdmin?'<button data-admin-tab="members">Cuentas</button><button data-admin-tab="announcements">Comunicados</button><button data-admin-tab="categories">Temáticas</button><button data-admin-tab="history">Historial</button>':''}</div><div id="admin-work"></div>`;
 async function paint(section){const area=$('admin-work');if(!area||(!isOwnerAdmin&&section!=='topics'))return;
  if(section==='topics'){
   area.innerHTML='<label for="admin-search">Buscar publicación</label><input id="admin-search" placeholder="Título o usuario"><div id="admin-topics"></div>';
   const render=()=>{const q=$('admin-search').value.toLowerCase();const list=topics.filter(t=>(t.title+' '+name(t.author_id)).toLowerCase().includes(q)).sort((a,b)=>Number(b.status==='pending')-Number(a.status==='pending'));$('admin-topics').innerHTML=list.map(t=>`<article class="card admin-topic-card ${t.status==='pending'?'admin-topic-pending':''}">${t.status==='pending'?'<div class="admin-pending-label">PENDIENTE DE MODERACIÓN</div>':''}<h3>${esc(t.title)}</h3><p class="meta">${esc(name(t.author_id))} · ${stateLabel(t.status)} · ${stateLabel(t.state)}</p>${link('Ver tema','#tema/'+t.id,'button')}</article>`).join('')||'<p>No hay coincidencias.</p>'};$('admin-search').oninput=render;render();
  }else if(section==='categories'){
   area.innerHTML=categories.map(c=>`<article class="card"><h3>${esc(c.name)}</h3><p>${esc(c.welcome)}</p><button data-manage-category="${c.slug}">Editar bienvenida y normas</button></article>`).join('');
  }else if(section==='announcements'){
   area.innerHTML=`<section class="card announcement-admin"><h2>Enviar comunicado a todos</h2><p class="muted">El mensaje llegará a Notificaciones de los integrantes con correo confirmado, incluido el administrador. No se envían correos electrónicos.</p><form id="admin-announcement-form"><label for="admin-announcement-title">Título del comunicado</label><input id="admin-announcement-title" type="text" required minlength="5" maxlength="120" placeholder="Ej.: Novedades de Gente de Vuelo"><label for="admin-announcement-body">Mensaje</label><textarea id="admin-announcement-body" required minlength="10" maxlength="1200" rows="5" placeholder="Contales a los integrantes qué novedades se incorporaron."></textarea><p class="small muted">Antes de enviar se solicitará una confirmación. Máximo 1.200 caracteres.</p><button type="submit" class="primary">Enviar a todos los integrantes</button><p id="admin-announcement-status" class="small" role="status" aria-live="polite"></p></form></section><section class="card announcement-admin"><h2>Bienvenida por correo · Prueba</h2><p class="muted">Enviar una única prueba de bienvenida desde <strong>hola@gentedevuelo.com</strong> a <strong>gentedevuelo@gmail.com</strong>. Esta función no escribe a los integrantes ni activa envíos automáticos.</p><button type="button" id="gdv-welcome-test-button" class="primary">Enviar bienvenida de prueba</button><p id="gdv-welcome-test-status" class="small" role="status" aria-live="polite"></p></section><section class="card announcement-admin"><h2>Avisos de moderación por WhatsApp</h2><p>La detección de nuevas publicaciones pendientes ya está preparada para Foro, CompraVenta y AeroShop.</p><p><strong>Envío a WhatsApp: todavía no activado.</strong> Falta configurar un número emisor definitivo de Meta y la plantilla del aviso.</p><p id="gdv-whatsapp-queue-status" class="small" role="status" aria-live="polite">Consultando avisos preparados…</p><p id="gdv-wa-test-config" class="small" role="status" aria-live="polite">Comprobando configuración de Meta…</p><div class="toolbar"><button id="gdv-wa-send-test" type="button">Enviar mensaje de prueba a mi WhatsApp</button><button id="gdv-wa-run-test" type="button">Activar prueba temporal</button><button id="gdv-wa-stop-test" type="button" hidden>Detener prueba</button></div><p class="small muted">El modo temporal consulta las publicaciones nuevas cada minuto <strong>solo mientras este panel permanezca abierto</strong>, hasta 3 avisos por día. Meta utiliza su plantilla de prueba; todavía no es el aviso definitivo ni un servicio permanente.</p><p id="gdv-wa-test-output" class="small" role="status" aria-live="polite"></p></section>`;
   try{
     const pendingAlerts=await db.from('gdv_whatsapp_moderation_queue').select('id',{count:'exact',head:true}).eq('status','pending');
     const counter=$('gdv-whatsapp-queue-status');
     if(counter)counter.textContent=pendingAlerts.error?'No se pudo consultar la cola de avisos en este momento.':'Nuevos avisos registrados: '+Number(pendingAlerts.count||0)+'. Se guardan para preparar la integración, pero todavía no se envían mensajes.';
   }catch{
     const counter=$('gdv-whatsapp-queue-status');
     if(counter)counter.textContent='No se pudo consultar la cola de avisos en este momento.';
   }
   if(gdvWaTestTimer){clearInterval(gdvWaTestTimer);gdvWaTestTimer=null}
   const waStatus=$('gdv-wa-test-config'),waOutput=$('gdv-wa-test-output');
   const waTestButton=$('gdv-wa-send-test'),waRun=$('gdv-wa-run-test'),waStop=$('gdv-wa-stop-test');
   async function waInvoke(mode){
     const response=await db.functions.invoke('gdv-whatsapp-test',{body:{mode}});
     if(response.error){
       let reason='No se pudo completar la prueba.';
       try{
         const payload=await response.error.context?.json();
         if(payload?.error)reason=payload.error;
       }catch{}
       throw new Error(reason);
     }
     if(response.data?.error)throw new Error(response.data.error);
     return response.data;
   }
   let waReady=false,waRunning=false;
   try{
     const config=await waInvoke('status');
     waReady=Boolean(config?.ready);
     waStatus.textContent=waReady
       ?'Credenciales de Meta configuradas. Ya podés probar un envío.'
       :'Falta completar Supabase → Edge Functions → Secrets: '+(config?.missing||[]).join(', ')+'. No compartas las claves por este chat.';
   }catch(e){
     waStatus.textContent='No se pudo comprobar la configuración: '+(e.message||'error desconocido');
   }
   waTestButton.disabled=!waReady;waRun.disabled=!waReady;
   waTestButton.onclick=()=>busy(waTestButton,async()=>{
     if(!confirm('¿Enviar a tu WhatsApp UN mensaje de prueba con el número de Meta?'))return;
     const data=await waInvoke('test');
     waOutput.textContent=data.accepted?'Meta aceptó la prueba. Revisá tu WhatsApp; la entrega puede tardar unos instantes.':'No se pudo confirmar la prueba.';
   });
   async function waProcess(){
     if(waRunning)return;
     if(!waRun.isConnected || !location.hash.startsWith('#gestion/comunicados')){
       if(gdvWaTestTimer){clearInterval(gdvWaTestTimer);gdvWaTestTimer=null}
       return;
     }
     waRunning=true;
     try{
       const data=await waInvoke('process');
       waOutput.textContent=data.processed
         ?'Meta aceptó 1 aviso de prueba para tu WhatsApp. Revisá tu celular.'
         :(data.info||'Sin publicaciones nuevas para avisar.');
     }catch(e){
       waOutput.textContent='Error en la prueba: '+(e.message||'No se pudo enviar');
       if(gdvWaTestTimer){clearInterval(gdvWaTestTimer);gdvWaTestTimer=null}
       waRun.hidden=false;waStop.hidden=true;
     }finally{waRunning=false}
   }
   waRun.onclick=()=>{
     if(!waReady || gdvWaTestTimer)return;
     if(!confirm('¿Activar la prueba temporal? Se enviará una plantilla de Meta por cada nueva publicación pendiente, con máximo 3 por día, solo mientras esta pantalla permanezca abierta.'))return;
     waRun.hidden=true;waStop.hidden=false;
     waOutput.textContent='Prueba temporal activa mientras mantengas abierta esta pantalla.';
     gdvWaTestTimer=setInterval(waProcess,60000);
     waProcess();
   };
   waStop.onclick=()=>{
     if(gdvWaTestTimer){clearInterval(gdvWaTestTimer);gdvWaTestTimer=null}
     waRun.hidden=false;waStop.hidden=true;
     waOutput.textContent='Prueba temporal detenida.';
   };
   const form=$('admin-announcement-form');
   form.onsubmit=e=>{
    e.preventDefault();
    const titulo=$('admin-announcement-title').value.trim();
    const cuerpo=$('admin-announcement-body').value.trim();
    if(titulo.length<5||titulo.length>120||cuerpo.length<10||cuerpo.length>1200){$('admin-announcement-status').textContent='Revisá el título y el contenido antes de enviarlo.';return}
    if(!confirm('¿Enviar el comunicado "'+titulo+'" a todos los integrantes con correo confirmado? Esta acción no se puede deshacer.'))return;
    busy(e.submitter,async()=>{
     const result=await db.rpc('gdv_admin_send_announcement',{p_title:titulo,p_body:cuerpo});
     if(result.error)throw result.error;
     const enviados=Number(result.data)||0;
     form.reset();
     $('admin-announcement-status').textContent='Comunicado enviado a '+enviados+' cuenta'+(enviados===1?'':'s')+' confirmada'+(enviados===1?'':'s')+'.';
     message('Comunicado entregado en Notificaciones.');
     refreshUnreadNotificationsBadge().catch(()=>{});
    });
   };
   const testButton=$('gdv-welcome-test-button');
   testButton.onclick=()=>{
    if(!confirm('¿Enviar una única bienvenida de prueba desde hola@gentedevuelo.com a gentedevuelo@gmail.com? No se enviará nada a los integrantes.'))return;
    busy(testButton,async()=>{
     const result=await db.functions.invoke('gdv-welcome-test',{body:{}});
     if(result.error){
      let detail='No se pudo enviar el correo de prueba.';
      try{const payload=await result.error.context?.json();if(payload?.error)detail=payload.error;}catch{}
      throw new Error(detail);
     }
     if(!result.data?.ok)throw new Error(result.data?.error||'No se pudo confirmar el envío.');
     $('gdv-welcome-test-status').textContent='Resend aceptó la prueba para gentedevuelo@gmail.com. Revisá Recibidos y Spam.';
     message('Prueba enviada a gentedevuelo@gmail.com.');
    });
   };
  }else if(section==='members'){
   const members=checked(await db.from('gdv_members').select('*'));
   area.innerHTML='<p>Las medidas quedan registradas y se notifican al titular con su motivo.</p>'+[...profiles.values()].map(p=>{const m=members.find(m=>m.user_id===p.id);return `<article class="card"><h3>${esc(p.username)}</h3><p>${m?.suspended_until&&new Date(m.suspended_until)>new Date()?'Suspendido hasta '+date(m.suspended_until):m?.restricted?'Revisión previa':'Habilitado'}</p><button data-manage-member="${p.id}" ${p.id===user.id||!isOwnerAdmin?'disabled':''}>Gestionar cuenta</button></article>`}).join('');
  }else{
   const rows=checked(await db.from('gdv_audit').select('entity,record_id,actor,created_at,old_data,new_data').order('created_at',{ascending:false}).limit(100));
   area.innerHTML='<p>Últimas 100 acciones. Este historial es privado.</p>'+rows.map(r=>`<details class="card"><summary>${esc(name(r.actor))} · ${date(r.created_at)} · ${esc(r.entity.replace('gdv_',''))}</summary><div class="history-grid"><div><h3>Antes</h3><pre>${esc(JSON.stringify(r.old_data,null,2))}</pre></div><div><h3>Después</h3><pre>${esc(JSON.stringify(r.new_data,null,2))}</pre></div></div></details>`).join('');
  }
 }
 app.querySelectorAll('[data-admin-tab]').forEach(b=>b.onclick=()=>busy(b,()=>paint(b.dataset.adminTab)));
 await paint(initialSection);
}
async function googleOnboarding(){
 if(!user)return;
 const p=profile(user.id);
 crumbs([['Bienvenida a Gente de Vuelo']]);
 const roles=['Entusiasta de la aviación','Estudiante de piloto','Piloto privado','Piloto comercial','Instructor de vuelo','Aeromodelista','Piloto de planeador','Piloto de ultraliviano','Piloto de helicóptero','Piloto de paramotor','Constructor de experimentales','Simulador de vuelo','Otro'];
 app.innerHTML=`<section class="editor google-onboarding">
  <div class="google-onboarding-heading">
   <span class="google-onboarding-step">Registro con Google · Último paso</span>
   <h1>Completá tu perfil</h1>
   <p>¡Bienvenido a Gente de Vuelo! Antes de empezar a participar, contanos cómo querés presentarte en nuestra comunidad aeronáutica.</p>
  </div>
  <form id="google-onboarding-form" class="card">
    <label for="google-profile-username">Nombre de usuario <span class="google-onboarding-required">Obligatorio</span></label>
    <input id="google-profile-username" type="text" required minlength="3" maxlength="25" pattern="[A-Za-z0-9_-]{3,25}" autocomplete="username" value="${esc(p.username?.startsWith('piloto_')?'':p.username||'')}">
    <p class="small muted">Se mostrará en el foro y Mi Hangar. De 3 a 25 caracteres: letras, números y guiones.</p>
    <label for="google-profile-name">Nombre visible <span class="google-onboarding-required">Obligatorio</span></label>
    <input id="google-profile-name" required minlength="2" maxlength="80" autocomplete="nickname" value="${esc(p.full_name||user.user_metadata?.full_name||user.user_metadata?.name||'')}">
    <p class="small muted">Puede ser tu nombre de pila o el nombre con el que quieras que te conozca la comunidad. Será público.</p>
    <label for="google-profile-role">Tu relación con la aviación <span class="google-onboarding-required">Obligatorio</span></label>
    <select id="google-profile-role" required>
      <option value="">Seleccioná una opción</option>
      ${roles.map(role=>`<option value="${esc(role)}" ${role===p.aviation_role?'selected':''}>${esc(role)}</option>`).join('')}
    </select>
    <details class="google-onboarding-more">
      <summary>Agregar más datos a Mi Hangar (opcional)</summary>
      <p class="small muted">Estos datos no son obligatorios. Podés completarlos o modificarlos más adelante.</p>
      <label for="google-profile-license">Licencias</label>
      <input id="google-profile-license" maxlength="100" value="${esc(p.aviation_license||'')}">
      <label for="google-profile-hours">Horas de vuelo</label>
      <input id="google-profile-hours" type="text" inputmode="numeric" maxlength="5" pattern="[0-9]{0,5}" value="${esc(p.flight_hours??'')}">
      <label for="google-profile-airfield">Aeropuerto o aeródromo base</label>
      <input id="google-profile-airfield" maxlength="150" value="${esc(p.home_airfield||'')}">
      <label for="google-profile-aircraft">Aeronaves</label>
      <input id="google-profile-aircraft" maxlength="250" value="${esc(p.aircraft_flown||'')}">
      <label for="google-profile-simulator">Simulador de vuelo</label>
      <input id="google-profile-simulator" maxlength="200" value="${esc(p.flight_simulators||'')}">
      <label for="google-profile-intro">Presentación personal</label>
      <textarea id="google-profile-intro" maxlength="1000" rows="3">${esc(p.hangar_intro||'')}</textarea>
    </details>
    <p class="google-onboarding-privacy">Tu correo de Google y tu contraseña nunca se mostrarán públicamente. Los datos de este formulario, salvo tu correo, son visibles en tu perfil.</p>
    <button class="primary google-onboarding-save" type="submit">Guardar perfil y entrar</button>
    <p id="google-onboarding-status" role="status" aria-live="polite"></p>
  </form>
 </section>`;
 const hours=$('google-profile-hours');hours.oninput=()=>{hours.value=hours.value.replace(/\D/g,'').slice(0,5)};
 $('google-onboarding-form').onsubmit=e=>{
  e.preventDefault();
  busy(e.submitter,async()=>{
   const status=$('google-onboarding-status');status.textContent='';
   const username=$('google-profile-username').value.trim();
   const fullName=$('google-profile-name').value.trim();
   const role=$('google-profile-role').value;
   if(!/^[A-Za-z0-9_-]{3,25}$/.test(username))throw new Error('El nombre de usuario debe tener entre 3 y 25 caracteres válidos.');
   if(/^(admin|administrador|moderador|shimoda|gentedevuelo|soporte)$/i.test(username))throw new Error('Elegí otro nombre de usuario.');
   if(fullName.length<2||fullName.length>80)throw new Error('Completá un nombre visible de entre 2 y 80 caracteres.');
   if(!roles.includes(role))throw new Error('Seleccioná tu relación con la aviación.');
   const flight=hours.value.trim();
   if(flight&&!/^[0-9]{1,5}$/.test(flight))throw new Error('Las horas de vuelo deben tener hasta 5 dígitos.');
   const other=checked(await db.from('profiles').select('id').ilike('username',username.replaceAll('_','\\_')).neq('id',user.id).limit(1));
   if(other.length){status.textContent='Ese nombre de usuario ya está ocupado. Elegí otro.';return}
   const payload={
    username, full_name:fullName, aviation_role:role,
    aviation_license:$('google-profile-license').value.trim(),
    home_airfield:$('google-profile-airfield').value.trim(),
    aircraft_flown:$('google-profile-aircraft').value.trim(),
    flight_simulators:$('google-profile-simulator').value.trim(),
    hangar_intro:$('google-profile-intro').value.trim(),
    flight_hours:flight?Number(flight):null,
    onboarding_completed:true
   };
   const result=await db.from('profiles').update(payload).eq('id',user.id).select('id,onboarding_completed').single();
   if(result.error){status.textContent='No se pudo guardar el perfil: '+result.error.message;return}
   if(!result.data?.onboarding_completed){status.textContent='No se pudo confirmar el perfil. Intentá nuevamente.';return}
   await load();
   history.replaceState(null,'','#foro');
   await route();
   message('¡Tu perfil está listo! Ya podés participar en Gente de Vuelo.');
  });
 };
}

async function profileEditor(){
 if(!authenticated())return;const p=profile(user.id);crumbs([['Mi Hangar','#hangar'],['Editar perfil']]);
 const fields=[['username','Nombre de usuario'],['full_name','Nombre visible'],['hangar_intro','Presentación'],['aviation_role','Actividad aeronáutica'],['aviation_license','Licencias'],['flight_hours','Horas de vuelo'],['home_airfield','Aeropuerto base'],['aircraft_flown','Aeronaves'],['flight_simulators','Simulador de vuelo']];
 app.innerHTML=`<section class="editor"><h1>Editar Mi Hangar</h1><p>Tu usuario es público. Los demás datos son opcionales; se muestran en tu Hangar si los completás.</p><form id="profile-form">${fields.map(([k,label])=>`<label for="profile-${k}">${label}</label><input id="profile-${k}" ${k==='username'?'required minlength="3" maxlength="25" pattern="[A-Za-z0-9_-]{3,25}"':k==='flight_hours'?'type="text" inputmode="numeric" maxlength="5" pattern="[0-9]{1,5}" autocomplete="off"':'maxlength="1000"'} value="${esc(p[k]??'')}">`).join('')}<p class="small muted">El nombre de usuario puede cambiarse una vez cada 90 días.</p><label for="profile-avatar">Foto de perfil (JPG, PNG o WebP, hasta 5 MB)</label><input id="profile-avatar" type="file" accept="image/jpeg,image/png,image/webp"><div class="toolbar"><button class="primary">Guardar perfil</button>${link('Volver a Mi Hangar','#hangar')}</div></form></section>`;
 const flightHoursField=$('profile-flight_hours');if(flightHoursField)flightHoursField.oninput=()=>{flightHoursField.value=flightHoursField.value.replace(/\D/g,'').slice(0,5)};
 $('profile-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{
  const flightHoursInput=$('profile-flight_hours');const flightHoursValue=flightHoursInput.value.trim();if(flightHoursValue!==''&&!/^\d{1,5}$/.test(flightHoursValue)){throw new Error('Las horas de vuelo deben contener solo números y un máximo de 5 dígitos.');}const payload=Object.fromEntries(fields.map(([k])=>[k,k==='flight_hours'?(flightHoursValue===''?null:Number(flightHoursValue)):$('profile-'+k).value.trim()]));
  const file=$('profile-avatar').files[0];if(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Usá una imagen JPG, PNG o WebP de hasta 5 MB.');const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');canvas.width=canvas.height=400;const side=Math.min(bitmap.width,bitmap.height);canvas.getContext('2d').drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,400,400);bitmap.close();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));if(!blob)throw new Error('No se pudo preparar la foto.');const {data:sessionData,error:sessionError}=await db.auth.getSession();if(sessionError||!sessionData.session?.access_token)throw new Error('La sesión venció. Volvé a ingresar.');
  if(blob.size>4*1024*1024)throw new Error('La fotografía supera los 4 MB admitidos.');
  const upload=await fetch(cfg.url+'/functions/v1/r2-upload-image',{
    method:'POST',
    headers:{Authorization:'Bearer '+sessionData.session.access_token,apikey:cfg.key,'Content-Type':'image/webp'},
    body:blob
  });
  const result=await upload.json().catch(()=>({}));
  if(!upload.ok||typeof result.url!=='string'||!result.url.startsWith('https://media.gentedevuelo.com/'))throw new Error(result.error||'No se pudo guardar la fotografía en Cloudflare R2.');
  payload.avatar_url=result.url;}
  checked(await db.from('profiles').update(payload).eq('id',user.id).select().single());
  // Reemplazar el avatar registra automáticamente la URL anterior en la cola R2.
  if(file&&typeof p.avatar_url==='string'&&p.avatar_url.startsWith(URL_FOTOS_HANGAR_R2)){
   await procesarLimpiezaR2Comunidad();
  }
  await load();history.pushState(null,'','#hangar');await route();message('Tu perfil fue guardado.');
 })};
}
function manageTopic(id){const t=topics.find(t=>t.id===id);if(!isAdmin||!t)return;
 showDialog(`<h2>Gestionar publicación</h2><form id="manage-topic"><label for="manage-category">Temática</label><select id="manage-category">${categories.map(c=>`<option value="${c.slug}" ${c.slug===t.category?'selected':''}>${esc(c.name)}</option>`).join('')}</select><label for="manage-status">Visibilidad</label><select id="manage-status">${['pending','approved','rejected'].map(s=>`<option value="${s}" ${s===t.status?'selected':''}>${stateLabel(s)}</option>`).join('')}</select><label for="manage-state">Conversación</label><select id="manage-state">${['open','resolved','closed','archived'].map(s=>`<option value="${s}" ${s===t.state?'selected':''}>${stateLabel(s)}</option>`).join('')}</select><label><input type="checkbox" id="manage-pinned" ${t.pinned?'checked':''}> Fijar publicación</label><label for="moderation-reason">Motivo de la medida</label><textarea id="moderation-reason" required minlength="5" maxlength="1000"></textarea><button class="primary">Guardar cambios</button></form>`);
 $('manage-topic').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{checked(await db.from('gdv_topics').update({category:$('manage-category').value,status:$('manage-status').value,state:$('manage-state').value,pinned:$('manage-pinned').checked,moderation_reason:$('moderation-reason').value.trim()}).eq('id',id));dialog.close();await load();await administration();message('Cambios de moderación guardados.')})};
}
function manageCategory(slug){const c=cat(slug);if(!isOwnerAdmin)return;showDialog(`<h2>Editar temática</h2><form id="manage-category-form"><label for="category-name">Nombre</label><input id="category-name" required maxlength="100" value="${esc(c.name)}"><label for="category-color">Color</label><input type="color" id="category-color" value="${esc(c.color)}"><label for="category-welcome">Bienvenida</label><textarea id="category-welcome" required maxlength="2000">${esc(c.welcome)}</textarea><label for="category-rules">Normas específicas</label><textarea id="category-rules" required maxlength="4000">${esc(c.rules)}</textarea><button class="primary">Guardar</button></form>`);$('manage-category-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{checked(await db.from('gdv_categories').update({name:$('category-name').value.trim(),color:$('category-color').value,welcome:$('category-welcome').value.trim(),rules:$('category-rules').value.trim()}).eq('slug',slug));dialog.close();await load();await administration();message('Temática actualizada.')})}}
function manageMember(id){if(!isOwnerAdmin||id===user.id)return;showDialog(`<h2>Cuenta de ${esc(name(id))}</h2><form id="member-form"><label for="member-measure">Medida</label><select id="member-measure"><option value="enable">Habilitar cuenta</option><option value="restrict">Aprobación previa</option><option value="7">Suspender 7 días</option><option value="30">Suspender 30 días</option></select><label for="member-reason">Motivo que recibirá el titular</label><textarea id="member-reason" required minlength="5" maxlength="2000"></textarea><button class="primary">Aplicar y notificar</button></form>`);$('member-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{const measure=$('member-measure').value;checked(await db.from('gdv_members').upsert({user_id:id,restricted:measure!=='enable',suspended_until:['7','30'].includes(measure)?new Date(Date.now()+Number(measure)*86400000).toISOString():null,reason:$('member-reason').value.trim()}));dialog.close();await administration();message('Medida registrada y notificada.')})}}

function rules(){crumbs([['Foro','#foro'],['Normativa de la comunidad']]);app.innerHTML="<h1>Normativa de la comunidad</h1><section class=\"card institutional\"><p>Normativa y Directrices de Gente de Vuelo</p><p>Para mantener un espacio seguro, ordenado y de valor para todos los apasionados por la aviación, nos guiamos por los siguientes principios:</p><h2>Convivencia y Participación</h2><p>• Trato cordial y respeto: Fomentamos la camaradería y el respeto mutuo entre todos los participantes.</p><p>• Temática correcta: Publicá siempre en la categoría correspondiente para mantener el contenido organizado.</p><p>• Cero spam: No dupliques publicaciones ni generes contenido masivo no deseado.</p><p>• Privacidad y datos: Está prohibido divulgar datos privados propios o de terceros.</p><p>• Fundamentos sólidos: Distinguí siempre entre hechos, fuentes, experiencias y opiniones personales.</p><p>• Derechos de autor: Respetá la propiedad intelectual y citá siempre las fuentes correspondientes.</p><p>• Aviso legal: Recordá que la información compartida en la comunidad es de carácter orientativo y no reemplaza documentación oficial ni el criterio de profesionales habilitados.</p><h2>Moderación y Transparencia</h2><p>• Primeros aportes: Las primeras 3 publicaciones y los primeros 5 comentarios de los nuevos usuarios requerirán aprobación previa. Las cuentas restringidas mantendrán este sistema de revisión.</p><p>• Anuncios comerciales: Toda publicación comercial o publicitaria pasa siempre por un filtro de revisión antes de ser publicada.</p><p>• Denuncias justas: Las denuncias son evaluadas por personas y nunca eliminan contenidos de forma automática.</p><p>• Comunicación clara: Cualquier medida tomada sobre una publicación será comunicada indicando su motivo, brindando la posibilidad de solicitar una revisión a través de la sección de Contacto.</p><h2>Privacidad de tus Datos</h2><p>• Perfil público (Mi Hangar): Tu nombre de usuario, avatar y actividad pública serán visibles en tu espacio de Mi Hangar. Cargar datos aeronáuticos en tu perfil es completamente opcional.</p><p>• Información privada: Tu correo electrónico, contraseña y elementos guardados se mantienen estrictamente privados y seguros.</p></section>" + "\n<section class=\"gdv-retention-policy\" id=\"politica-conservacion\" aria-labelledby=\"gdv-retention-title\">\n  <h2 id=\"gdv-retention-title\">8. Política de conservación, almacenamiento y eliminación de contenidos</h2>\n  <p>Para administrar responsablemente el espacio de almacenamiento y preservar el patrimonio aeronáutico, Gente de Vuelo establece los siguientes <strong>plazos previstos de conservación</strong>. La revisión del almacenamiento será mensual y se procurará comprimir imágenes, evitar duplicados y retirar archivos que ya no se utilicen.</p>\n  <p><strong>Importante: esta política se publica para conocimiento de la comunidad, pero los procesos de eliminación automática por vencimiento todavía no están habilitados.</strong> Antes de aplicarlos se comunicarán la fecha de entrada en vigencia y los procedimientos de aviso y renovación.</p>\n\n  <h3>Plazos por sección</h3>\n  <ul>\n    <li><strong>Galería Aeronáutica:</strong> fotografías y videos durante <strong>12 meses</strong>, renovables por otros 12 meses. Aviso previsto 15 días antes del vencimiento.</li>\n    <li><strong>AeroChat:</strong> mensajes durante <strong>48 horas</strong> desde su publicación. Los mensajes vinculados con denuncias o investigaciones de moderación podrán conservarse hasta que concluya la revisión.</li>\n    <li><strong>CompraVenta y Subasta Inversa:</strong> avisos durante <strong>90 días</strong>, renovables por períodos iguales. Aviso 15 días antes del vencimiento; el aviso deja de mostrarse al vencer y cuenta con 30 días adicionales para renovarlo antes de su eventual eliminación, incluidas sus fotografías.</li>\n    <li><strong>AeroShop:</strong> publicaciones comerciales durante <strong>180 días</strong>, renovables. Aviso 15 días antes; retiro de la vista pública al vencer y 30 días adicionales para renovar antes de una eventual eliminación de la publicación y sus fotografías.</li>\n    <li><strong>Travesías:</strong> fotografías y videos durante <strong>12 meses</strong>. Los relatos escritos y comentarios permanecen sin vencimiento fijo.</li>\n    <li><strong>Foro General y Temáticas:</strong> fotografías, videos y PDF adjuntos durante <strong>12 meses</strong>, renovables. Los textos, respuestas y comentarios permanecen sin vencimiento fijo, aunque se retiren adjuntos vencidos.</li>\n    <li><strong>Mi Hangar:</strong> perfil, nombre de usuario, datos aeronáuticos y avatar mientras exista la cuenta. <strong>No se eliminarán cuentas automáticamente por inactividad.</strong> Las fotos publicadas en otras secciones siguen los plazos de esas secciones.</li>\n    <li><strong>Rincón Robert Shimoda:</strong> conservación permanente de publicaciones, comentarios y material multimedia, con revisión anual y optimización de archivos.</li>\n    <li><strong>Agenda Aeronáutica:</strong> publicaciones hasta <strong>48 horas después de finalizar el evento</strong>. Las actividades finalizadas dejan de mostrarse entre los próximos eventos.</li>\n  </ul>\n\n  <h3>Protección y excepciones</h3>\n  <p>La administración podrá exceptuar del vencimiento fotografías, documentos, travesías y acontecimientos de interés histórico, educativo, técnico o institucional. Podrá conservarse temporalmente material asociado con denuncias o requerimientos legales. El retiro de un archivo no deberá borrar automáticamente las conversaciones o los textos que lo acompañan.</p>\n  <p>Cuando un contenido se elimine definitivamente, se procurará retirar sus archivos asociados únicamente si no están siendo utilizados por otras publicaciones. La optimización y la limpieza periódica no implicarán la baja automática de cuentas de integrantes.</p>\n\n  <h3>Avisos y entrada en vigencia</h3>\n  <p>Para Galería Aeronáutica, CompraVenta y AeroShop se prevé aviso de vencimiento con 15 días de anticipación; en CompraVenta y AeroShop habrá 30 días adicionales de renovación tras el vencimiento. Los mecanismos y avisos aplicables a las demás secciones se comunicarán antes de su puesta en marcha.</p>\n  <p><strong>Hasta que se anuncie oficialmente la entrada en vigencia, los plazos aquí descriptos no provocarán borrados automáticos.</strong> La conservación de Instituciones Amigas, notificaciones y respaldos tendrá condiciones específicas que se comunicarán una vez definidas.</p>\n</section>\n"}
function about(){crumbs([['Foro','#foro'],['Quiénes somos']]);app.innerHTML="<h1>Quiénes somos</h1><section class=\"card institutional\"><p>¡Bienvenido a Gente de Vuelo!</p><p>Es el destino definitivo para los entusiastas y apasionados de la aviación. Fundado por pura pasión por el mundo aéreo, nuestro propósito es reunir a pilotos, estudiantes, instructores, aeromodelistas, constructores de aeronaves experimentales y a todos los que comparten este mismo sueño en una sola comunidad.</p><h2>Lo que ofrecemos:</h2><p>• Contenido integral y exclusivo: Descubrí el espacio del Rincón de Robert Shimoda, nuestro personaje destacado, quien a través de sus consejos, vivencias e historias te invita a aprender y reflexionar desde el lente de la curiosidad histórica.</p><p>• Sección de Utilidades: Un conjunto de software propio desarrollado exclusivamente para el uso de la comunidad, diseñado para simplificar cálculos, optimizar la planificación y sumar herramientas tecnológicas prácticas para el día a día en tierra y en vuelo.</p><p>• AeroShop: Una tienda virtual exclusiva donde los comercios del medio ofrecen productos de alta calidad para la actividad.</p><p>• Sección de CompraVenta: Un espacio dedicado para que la comunidad pueda intercambiar y adquirir todo tipo de artículos relacionados con la aviación.</p><p>Nuestro compromiso: Estamos guiados por la transparencia, la inclusión, la seguridad de la información y un crecimiento impulsado por ustedes. Cada decisión que tomemos tendrá como brújula el pulso de nuestra comunidad.</p><p>¡Únete a nosotros! Tanto si sos un entusiasta, si tenés el anhelo de dar tus primeros pasos como piloto, o si ya acumulás horas de vuelo, acá encontrarás tu lugar para reconectarte con personas que hablan tu mismo idioma.</p><p>&quot;Una vez que hayas probado el vuelo, caminarás para siempre por la tierra con la mirada puesta en el cielo...&quot; — Leonardo da Vinci</p></section>"}
function authView(mode){
 crumbs([[mode==='registro'?'Registrarse':mode==='recuperar'?'Recuperar contraseña':'Ingresar']]);
 if(mode==='registro'){app.innerHTML=`<section class="card auth"><h1>Registrarse</h1><p class="steps" id="register-step">Paso 1 de 2 · Elegí tu usuario</p><form id="register"><div id="register-first"><label for="register-name">Nombre de usuario</label><input id="register-name" required minlength="3" maxlength="25" pattern="[A-Za-z0-9_-]{3,25}" autocomplete="username"><p class="small muted">Entre 3 y 25 caracteres: letras, números, guion o guion bajo.</p><label for="register-pass">Contraseña</label><input id="register-pass" required type="password" minlength="8" autocomplete="new-password"><label for="register-confirm">Confirmar contraseña</label><input id="register-confirm" required type="password" minlength="8" autocomplete="new-password"><p class="small muted">Usá al menos 8 caracteres, con una letra y un número.</p></div><div id="register-second" hidden><label for="register-email">Correo electrónico privado</label><input id="register-email" type="email" autocomplete="email"><label class="legal"><input id="register-consent" type="checkbox"> Acepto la <a href="#normativa" target="_blank">Normativa de la Comunidad</a> y su información de privacidad.</label></div><div class="toolbar"><button id="register-submit" class="primary">Continuar</button><button id="register-back" type="button" hidden>Volver</button></div><div class="toolbar"><button id="register-google" type="button">Registrarse con Google</button></div><p class="small muted">Si es tu primera vez con Google, se creará tu cuenta automáticamente.</p><p id="auth-status" role="status"></p></form></section>`;
 let step=1;$('register-back').onclick=()=>{step=1;$('register-first').hidden=false;$('register-second').hidden=true;$('register-email').required=false;$('register-consent').required=false;$('register-step').textContent='Paso 1 de 2 · Elegí tu usuario';$('register-submit').textContent='Continuar';$('register-submit').disabled=false;$('register-back').hidden=true};
 $('register').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{const username=$('register-name').value.trim(),password=$('register-pass').value;if(password!==$('register-confirm').value)throw new Error('Las contraseñas no coinciden.');if(step===1){if(password.length<8||!/[A-Za-z]/.test(password)||!/\d/.test(password))throw new Error('La contraseña debe tener al menos 8 caracteres, con una letra y un número.');if(!/^[A-Za-z0-9_-]{3,25}$/.test(username))throw new Error('Revisá el nombre de usuario.');if(/^(admin|administrador|moderador|shimoda|gentedevuelo|soporte)$/i.test(username))throw new Error('Ese nombre está reservado.');const r=await db.from('profiles').select('id').ilike('username',username.replaceAll('_','\\_')).limit(1);if(checked(r).length)throw new Error('Ese nombre ya está en uso. Elegí otro.');step=2;$('register-first').hidden=true;$('register-second').hidden=false;$('register-email').required=true;$('register-consent').required=true;$('register-back').hidden=false;$('register-step').textContent='Paso 2 de 2 · Verificá tu correo';$('register-submit').textContent='Enviar verificación';return}const r=await db.auth.signUp({email:$('register-email').value.trim(),password,options:{emailRedirectTo:new URL('comunidad.html',location.href).href,data:{username,bio:''}}});if(r.error)throw r.error;$('register').reset();$('auth-status').textContent='Revisá tu correo y confirmá el enlace para activar la cuenta. Revisá también spam. Si ya tenías cuenta, ingresá o recuperá tu contraseña.';if(r.data.session){await db.auth.signOut();message('La cuenta no se activará aquí hasta verificar el correo.')}})};
 const googleRegister=$('register-google');
 if(googleRegister){
   fetch(cfg.url+'/auth/v1/settings',{headers:{apikey:cfg.key}})
     .then(r=>r.json())
     .then(settings=>{
       if(!settings.external?.google){
         googleRegister.disabled=true;
         googleRegister.textContent='Google no está habilitado';
       }
     })
     .catch(()=>{});
   googleRegister.onclick=()=>busy(googleRegister,async()=>{
     const r=await db.auth.signInWithOAuth({
       provider:'google',
       options:{redirectTo:new URL('comunidad.html',location.href).href}
     });
     if(r.error)throw r.error;
   });
 }
;return}
 app.innerHTML=`<section class="card auth"><h1>${mode==='recuperar'?'Recuperar contraseña':'Ingresar'}</h1><form id="login"><label for="login-email">${mode==='recuperar'?'Correo electrónico privado':'Nombre de usuario o correo'}</label><input id="login-email" type="${mode==='recuperar'?'email':'text'}" required autocomplete="${mode==='recuperar'?'email':'username'}">${mode!=='recuperar'?'<label for="login-pass">Contraseña</label><input id="login-pass" type="password" required autocomplete="current-password">':''}<div class="toolbar"><button class="primary">${mode==='recuperar'?'Enviar enlace':'Ingresar'}</button></div></form><p id="auth-status" role="status"></p>${mode!=='recuperar'?`<button id="google-login">Continuar con Google</button><p>${link('Olvidé mi contraseña','#recuperar','')}</p>${link('Crear una cuenta','#registro','')}`:link('Volver a ingresar','#ingresar','')}</section>`;
 $('login').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{let r;if(mode==='recuperar'){r=await db.auth.resetPasswordForEmail($('login-email').value.trim(),{redirectTo:window.GDV_AUTH.recoveryURL});if(r.error)throw r.error;$('auth-status').textContent='Si existe una cuenta con ese correo, recibirás un enlace de recuperación.'}else{const identity=$('login-email').value.trim();if(identity.includes('@'))r=await db.auth.signInWithPassword({email:identity,password:$('login-pass').value,options:{}});else{const response=await fetch(cfg.url+'/functions/v1/username-login',{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify({username:identity,password:$('login-pass').value})});const session=await response.json();if(!response.ok)throw new Error(session.error||'No se pudo ingresar.');r=await db.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token})}if(r.error)throw r.error;await window.GDV_AUTH.afterLogin()}})};
 if($('google-login'))fetch(cfg.url+'/auth/v1/settings',{headers:{apikey:cfg.key}}).then(r=>r.json()).then(settings=>{const b=$('google-login');if(b&&!settings.external?.google){b.disabled=true;b.textContent='Google no está habilitado';}}).catch(()=>{});
 if($('google-login'))$('google-login').onclick=()=>busy($('google-login'),async()=>{const r=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('comunidad.html',location.href).href}});if(r.error)throw r.error});
}
async function contact(){
 crumbs([['Contacto']]);
 let historial=[];
 if(user){
   const result=await db.from('gdv_contact').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50);
   historial=checked(result);
 }
 app.innerHTML=`<section class="editor"><h1>Contacto</h1><p>Consultas, problemas o propuestas para la administración de Gente de Vuelo.</p>
 ${user?'<form id="contact-form"><label for="contact-subject">Asunto</label><input id="contact-subject" required minlength="3" maxlength="120"><label for="contact-content">Tu mensaje</label><textarea id="contact-content" required minlength="10" maxlength="4000"></textarea><div class="toolbar"><button class="primary">Enviar a la administración</button></div></form>':link('Ingresar para enviar una consulta','#ingresar','button primary')}
 ${user?`<h2>Mis consultas</h2>${historial.map(c=>`<article class="card"><h3>${esc(c.subject)}</h3><p>${esc(c.message)}</p><p class="meta">Enviada: ${date(c.created_at)}</p>${c.admin_reply?`<div class="rule-box"><strong>Respuesta de la administración</strong><p>${esc(c.admin_reply)}</p><span class="meta">${date(c.replied_at)}</span></div>`:'<p class="muted">Pendiente de respuesta.</p>'}</article>`).join('')||'<p>Todavía no enviaste consultas.</p>'}`:''}
 </section>`;
 if($('contact-form'))$('contact-form').onsubmit=e=>{
   e.preventDefault();
   busy(e.submitter,async()=>{
     checked(await db.from('gdv_contact').insert({user_id:user.id,subject:$('contact-subject').value.trim(),message:$('contact-content').value.trim()}));
     e.target.reset();
     message('Tu consulta fue enviada a la administración.');
     await contact();
   });
 };
}
async function route(){if(!await window.GDV_AUTH.requireRoute())return;const current=++epoch;notice.textContent='';const onboardingRequired=Boolean(user&&profiles.get(user.id)?.onboarding_completed===false);if(onboardingRequired&&location.hash!=='#completar-perfil')history.replaceState(null,'','#completar-perfil');const [view='foro',id,child]=location.hash.slice(1).split('/');document.querySelectorAll('.site-nav a').forEach(a=>a.setAttribute('aria-current',a.getAttribute('href')==='#'+view?'page':'false'));app.innerHTML='<p>Cargando…</p>';try{if(onboardingRequired)await googleOnboarding();else if(view==='completar-perfil'){history.replaceState(null,'','#foro');feed()}else if(['registro','ingresar','recuperar'].includes(view))authView(view);else if(view==='tematicas')categoryView();else if(view==='tematica')feed(id);else if(view==='tema')await topicView(id,child);else if(view==='crear')editor();else if(view==='editar')editor(id);else if(view==='multimedia')multimedia();else if(view==='galeria')await galeriaComunidad();else if(view==='hangar')await hangar(id);else if(view==='notificaciones')await notifications();else if(view==='moderacion')await moderation();else if(view==='gestion')await administration(id==='comunicados'?'announcements':'topics');else if(view==='perfil')await profileEditor();else if(view==='normativa')rules();else if(view==='quienes-somos')about();else if(view==='integrantes')await membersView();else if(view==='contacto')await contact();else feed();app.querySelectorAll('input[type="password"]').forEach(input=>{const b=document.createElement('button');b.type='button';b.className='password-toggle';b.dataset.action='show-password';b.dataset.id=input.id;b.textContent='Mostrar contraseña';b.setAttribute('aria-pressed','false');input.after(b)});friendlyActions();contextualModeration();if(current===epoch)document.title=(app.querySelector('h1')?.textContent||'Foro')+' · Gente de Vuelo'}catch(e){if(current===epoch){app.innerHTML='<p>No se pudo cargar este apartado.</p>'+link('Volver al Foro','#foro');message(e.message,true)}}}
async function adminDeleteContent(kind,id){
 if(!isAdmin)return;
 const isTopic=kind==='topic';
 const label=isTopic?'publicación':'comentario';
 showDialog(`<h2>Eliminar ${label}</h2><p>Esta acción es definitiva y quedará registrada en el historial de moderación.${isTopic?' También se eliminarán sus comentarios, reacciones, denuncias, guardados, seguimientos y adjuntos asociados.':' Si tiene respuestas anidadas, también se eliminará esa rama.'}</p><div class="toolbar"><button id="confirm-admin-delete" class="primary">Eliminar definitivamente</button><button type="button" id="cancel-admin-delete">Cancelar</button></div>`);
 $('cancel-admin-delete').onclick=()=>dialog.close();
 $('confirm-admin-delete').onclick=()=>busy($('confirm-admin-delete'),async()=>{
  const r=await db.rpc('gdv_admin_delete_content',{p_kind:kind,p_id:id});
  const paths=checked(r);
  if(isTopic&&Array.isArray(paths)&&paths.length){
   const storageResult=await db.storage.from('community-media').remove(paths);
   if(storageResult.error)console.warn('El contenido se eliminó, pero algún archivo no pudo limpiarse del almacenamiento.');
  }
  dialog.close();
  await load();
  history.replaceState(null,'','#gestion');
  await administration();
  message((isTopic?'Publicación':'Comentario')+' eliminado correctamente.');
 });
}

async function adminDeleteMember(id,displayName){
 if(!isOwnerAdmin||!id||id===user.id)return;
 showDialog(`<h2>Eliminar integrante</h2><p>Vas a eliminar definitivamente la cuenta de <strong>${esc(displayName||name(id))}</strong> y quitarla de Integrantes.</p><p>Sus publicaciones y comentarios del foro se conservarán como contenido de un usuario eliminado. Esta acción no se puede deshacer.</p><div class="toolbar"><button id="confirm-member-delete" class="member-delete-confirm">Eliminar definitivamente</button><button type="button" id="cancel-member-delete">Cancelar</button></div>`);
 $('cancel-member-delete').onclick=()=>dialog.close();
 $('confirm-member-delete').onclick=()=>busy($('confirm-member-delete'),async()=>{
   checked(await db.rpc('gdv_admin_delete_member',{p_user:id}));
   dialog.close();
   await load();
   await membersView();
   message('Integrante eliminado correctamente.');
 });
}

async function toggleOwned(table,topicId){const r=await db.from(table).select('topic_id').eq('user_id',user.id).eq('topic_id',topicId).maybeSingle();if(r.error)throw r.error;checked(r.data?await db.from(table).delete().eq('user_id',user.id).eq('topic_id',topicId):await db.from(table).insert({user_id:user.id,topic_id:topicId}));await route()}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const action=b.dataset.action;
 if(b.dataset.manageTopic){manageTopic(b.dataset.manageTopic);return}if(b.dataset.manageCategory){manageCategory(b.dataset.manageCategory);return}if(b.dataset.manageMember){manageMember(b.dataset.manageMember);return}if(b.dataset.adminDeleteMember){adminDeleteMember(b.dataset.adminDeleteMember,b.dataset.memberName);return}if(b.dataset.adminDelete){adminDeleteContent(b.dataset.adminDelete,b.dataset.id);return}
 if(b.dataset.review){reviewContent(b.dataset.review,b.dataset.id,b.dataset.status);return}
 if(!action)return;
 if(action==='show-password'){const input=$(b.dataset.id);input.type=input.type==='password'?'text':'password';b.textContent=input.type==='password'?'Mostrar contraseña':'Ocultar contraseña';b.setAttribute('aria-pressed',String(input.type==='text'));return}
 if(action==='collapse'){const branch=$('children-'+b.dataset.id);branch.hidden=!branch.hidden;b.setAttribute('aria-expanded',!branch.hidden);actionLabel(b,'collapse',branch.hidden?'Mostrar respuestas':'Ocultar respuestas','Plegar o desplegar las respuestas.');return}
 if(action==='comment'){replyParent=null;if($('reply')){$('reply-label').textContent='Comentar la publicación';$('reply').scrollIntoView({block:'center',behavior:'smooth'});$('reply').focus({preventScroll:true});}return;}
 if(action==='reply'){if(!$('reply')){message('Este tema está cerrado y no admite nuevas respuestas.',true);return;}replyParent=b.dataset.id;$('reply-label').textContent='Responder a @'+name(comments.find(c=>c.id===replyParent)?.author_id);$('reply')?.focus();return}
 if(action==='cancel-reply'){replyParent=null;$('reply-label').textContent='Comentar la publicación';return}
 if(action==='share'){const url=new URL(location.href);url.hash='tema/'+b.dataset.id+(b.dataset.comment?'/'+b.dataset.comment:'');showDialog('<h2>Compartir conversación</h2><label for="share-link">Enlace directo</label><input id="share-link" readonly><div class="toolbar"><button id="copy-link" class="primary">Copiar enlace</button><button id="native-share">Compartir…</button></div><p id="share-status" role="status"></p>');$('share-link').value=url.href;$('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(url.href);$('share-status').textContent='Enlace copiado.'}catch{$('share-link').select();$('share-status').textContent='Copiá el enlace seleccionado.'}};$('native-share').hidden=!navigator.share;$('native-share').onclick=async()=>{try{await navigator.share({url:url.href,title:document.title})}catch{}};return}
 if(action==='logout'){busy(b,async()=>{if(user)await db.from('gdv_member_presence').delete().eq('user_id',user.id);checked(await db.auth.signOut());location.replace('index.html')});return}
 if(!authenticated())return;
 if(action==='edit-comment'){const c=comments.find(c=>c.id===b.dataset.id);if(!c||c.author_id!==user.id)return;showDialog('<h2>Editar respuesta</h2><form id="edit-comment-form"><label for="edit-comment-content">Tu respuesta</label><textarea id="edit-comment-content" required maxlength="10000">'+esc(c.content)+'</textarea><button class="primary">Guardar cambios</button></form>');$('edit-comment-form').onsubmit=ev=>{ev.preventDefault();busy(ev.submitter,async()=>{checked(await db.from('gdv_comments').update({content:$('edit-comment-content').value.trim()}).eq('id',c.id));dialog.close();await load();await route();message('Respuesta guardada. Si corresponde, quedará en revisión.')})};return}
 if(action==='request-removal'){showDialog('<h2>Solicitar eliminación</h2><p>Tu solicitud será revisada por moderación. La publicación no se elimina de inmediato.</p><form id="removal-form"><label for="removal-reason">Motivo</label><textarea id="removal-reason" required minlength="10" maxlength="3000"></textarea><button class="primary">Enviar a moderación</button></form>');$('removal-form').onsubmit=ev=>{ev.preventDefault();busy(ev.submitter,async()=>{checked(await db.from('gdv_contact').insert({user_id:user.id,subject:'Solicitud de retiro de publicación',message:'Tema: '+b.dataset.id+'\n'+$('removal-reason').value.trim()}));dialog.close();message('La solicitud fue enviada a moderación.')})};return}
 if(action==='report'){showDialog('<h2>Reportar contenido</h2><p>Contanos qué problema encontraste para que moderación pueda revisarlo.</p><form id="report-form"><label for="report-reason">Motivo</label><select id="report-reason"><option>Acoso o insultos</option><option>Contenido peligroso</option><option>Spam</option><option>Privacidad</option><option>Información falsa</option><option>Derechos de autor</option><option>Temática incorrecta</option><option>Otro</option></select><label for="report-detail">Detalle (opcional)</label><textarea id="report-detail" maxlength="800"></textarea><button class="primary">Enviar reporte</button></form>');$('report-form').onsubmit=ev=>{ev.preventDefault();busy(ev.submitter,async()=>{checked(await db.from('gdv_reports').insert({user_id:user.id,topic_id:b.dataset.id,comment_id:b.dataset.comment||null,reason:$('report-reason').value+': '+$('report-detail').value}));dialog.close();message('El reporte fue enviado a moderación.')})};return}
 busy(b,async()=>{if(action==='reaction'){const target=b.dataset.target,id=b.dataset.id,kind=b.dataset.kind;const existing=reactions.find(r=>r[target]===id&&r.kind===kind&&r.user_id===user.id);checked(existing?await db.from('gdv_reactions').delete().eq('id',existing.id):await db.from('gdv_reactions').insert({user_id:user.id,[target]:id,kind}));await load();await route()}
 else if(action==='save')await toggleOwned('gdv_saved',b.dataset.id);else if(action==='follow')await toggleOwned('gdv_follows',b.dataset.id);
 else if(action==='delete-comment'){showDialog('<h2>Retirar comentario</h2><p>El texto será reemplazado por «Comentario eliminado por su autor», conservando el hilo.</p><button id="confirm-delete" class="primary">Confirmar</button>');$('confirm-delete').onclick=()=>busy($('confirm-delete'),async()=>{checked(await db.from('gdv_comments').update({deleted:true}).eq('id',b.dataset.id));dialog.close();await load();await route()})}});
});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
let lastHash=location.hash,restoringHash=false;
document.addEventListener('click',e=>{const anchor=e.target.closest('a[href]');if(dirty&&anchor&&anchor.target!=='_blank'&&anchor.getAttribute('href')!==location.hash){if(!confirm('Tu borrador está guardado en este dispositivo. ¿Querés salir del editor?')){e.preventDefault();e.stopImmediatePropagation()}else dirty=false}},true);
window.addEventListener('hashchange',()=>{closeAccountMenu();if(restoringHash){restoringHash=false;return}if(dirty&&!confirm('Tu borrador está guardado. ¿Querés salir del editor?')){restoringHash=true;location.hash=lastHash;return}dirty=false;lastHash=location.hash;route()});
db.auth.onAuthStateChange((event,session)=>{if(event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED'||event==='SIGNED_IN'&&user?.id===session?.user?.id)return;setTimeout(async()=>{try{const previousUserId=user?.id||null;user=await window.GDV_AUTH.validate();await loadRole();await heartbeat();account();if(previousUserId!==user?.id||event==='SIGNED_OUT'){await load();await route()}}catch(e){message(e.message,true)}},0)});
const categoryColors={"historia": "#E6C280", "instruccion": "#FFFFFF", "militar": "#DC2626", "civil": "#38BDF8", "planeadores": "#06B6D4", "travesias": "#10B981", "meteorologia": "#00D2FF", "stol": "#F97316", "tecnica": "#9CA3AF", "noticias": "#F59E0B", "aeromodelismo": "#14B8A6", "simulacion": "#8B5CF6", "otros": "#6B7280"};
const categoryIcons={"historia": "M6 2h12M6 22h12M7 2v5l10 10v5M17 2v5L7 17v5M7 5h10M7 19h10", "instruccion": "M3 8 12 3l9 5-3 4H6L3 8ZM6 12v4h12v-4M6 16q6 7 12 0M9 9h6", "militar": "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4ZM8 12l3 3 5-6", "civil": "M12 2c-1 0-2 2-2 4v3L2 14v3l8-3v5l-3 2v1l5-1 5 1v-1l-3-2v-5l8 3v-3l-8-5V6c0-2-1-4-2-4Z", "planeadores": "M12 22S4 14 4 9a8 8 0 1 1 16 0c0 5-8 13-8 13ZM12 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", "travesias": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM16 8l-3 5-5 3 3-5 5-3Z", "meteorologia": "M6 15a4 4 0 0 1-1-8 6 6 0 0 1 12-1 4 4 0 0 1 1 8M13 12l-4 6h5l-3 5", "stol": "M9 15c-5-5 5-13 13-13 0 8-8 18-13 13ZM9 8H5l-3 7 6-1M16 15v4l-7 3 1-6M5 18l-3 4M16 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z", "tecnica": "M9 3h6l1 4 4 1 2 4-3 3 1 4-5 3-3-3-4 1-3-5 3-3-1-4 4-1 1-4ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "noticias": "M4 3h16v18H4V3ZM8 7h8M8 11h3v4H8v-4ZM14 11h2M14 15h2M8 18h8", "aeromodelismo": "M12 5v10M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM5 14h14l3 7H2l3-7ZM17 17h1", "simulacion": "M3 3h18v13H3V3ZM12 16v5M7 21h10", "otros": "M2 6V3h7l3 3h10v15H2V6Z"};
const categoryIcon=slug=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${categoryIcons[slug]||categoryIcons.otros}"/></svg>`;
async function loadRole(){isOwnerAdmin=false;isAdmin=false;if(!user)return;isOwnerAdmin=checked(await db.from('site_admins').select('user_id').eq('user_id',user.id)).length>0;isAdmin=isOwnerAdmin||checked(await db.from('gdv_moderators').select('user_id').eq('user_id',user.id)).length>0;}
async function heartbeat(){await window.GDV_AUTH.heartbeat()}


async function membersView(){crumbs([['Integrantes']]);const online=new Set(checked(await db.from('gdv_member_presence').select('user_id').gt('last_seen',new Date(Date.now()-90000).toISOString())).map(p=>p.user_id));app.innerHTML='<h1>Integrantes</h1><p>Miembros más recientes primero. La presencia se actualiza cada 30 segundos.</p><div class="grid integrantes-grid">'+[...profiles.values()].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(p=>`<article class="card integrante-card"><div class="post-row">${avatar(p.id)}<div class="integrante-info"><h2>${link(p.full_name||p.username||'Miembro','#hangar/'+p.id,'')}</h2><p class="meta">Registro: ${date(p.created_at)}</p><p class="${online.has(p.id)?'online':'muted'}">${online.has(p.id)?'● En línea':'○ Desconectado'}</p>${isOwnerAdmin&&p.id!==user.id?`<button type="button" class="member-delete-button" data-admin-delete-member="${p.id}" data-member-name="${esc(p.full_name||p.username||'Miembro')}">Eliminar</button>`:''}</div></div></article>`).join('')+'</div>';}
async function reviewContent(table,id,status){
 if(!isAdmin)return;
 if(table!=='gdv_reports'&&(status==='approved'||status==='rejected')){
  checked(await db.from(table).update({status,moderation_reason:''}).eq('id',id));
  await load();
  await route();
  message(status==='approved'?'Contenido aprobado.':'Contenido rechazado.');
  return;
 }
 showDialog(`<h2>Revisar contenido</h2><form id="review-form"><label for="review-status">Resultado</label><select id="review-status">${(table==='gdv_reports'?['resolved']:['approved','pending','rejected']).map(v=>`<option value="${v}" ${v===status?'selected':''}>${v==='resolved'?'Reporte revisado':stateLabel(v)}</option>`).join('')}</select><label for="review-reason">Motivo de la decisión</label><textarea id="review-reason" required minlength="5" maxlength="1000"></textarea><button class="primary">Guardar revisión</button></form>`);
 $('review-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{checked(await db.from(table).update({status:$('review-status').value,[table==='gdv_reports'?'resolution':'moderation_reason']:$('review-reason').value.trim()}).eq('id',id));dialog.close();await load();await route();message('Revisión registrada con su motivo.')})};
}
function contextualModeration(){if(!isAdmin)return;const [view,id]=location.hash.slice(1).split('/');if(view!=='tema')return;const t=topics.find(t=>t.id===id);if(!t)return;const host=app.querySelector('.topic-card .post-body');if(t.status==='pending'){if(host){const actions=document.createElement('div');actions.className='toolbar pending-review-actions';actions.innerHTML=`<a class="button" href="#editar/${t.id}">Corregir antes de publicar</a><button class="primary" data-review="gdv_topics" data-id="${t.id}" data-status="approved">Aprobar y publicar</button><button data-admin-delete="topic" data-id="${t.id}">Eliminar</button>`;host.prepend(actions)}return;}const box=(host,html)=>{if(!host)return;const d=document.createElement('details');d.className='staff-context';d.innerHTML='<summary aria-label="Herramientas de moderación">⋯ Moderación</summary>'+html;host.prepend(d)};box(host,`<button data-manage-topic="${t.id}">Visibilidad, cierre y ubicación</button><button data-admin-delete="topic" data-id="${t.id}">Eliminar publicación</button><button data-warning-user="${t.author_id||''}">Aviso privado al autor</button>`);for(const c of comments.filter(c=>c.topic_id===id))box($('comentario-'+c.id)?.querySelector('.post-body'),`<button data-review="gdv_comments" data-id="${c.id}" data-status="pending">Revisar comentario</button><button data-admin-delete="comment" data-id="${c.id}">Eliminar comentario</button><button data-warning-user="${c.author_id||''}">Aviso privado al autor</button>`);}
document.addEventListener('click',e=>{const b=e.target.closest('[data-warning-user]');if(!b||!isAdmin||!b.dataset.warningUser)return;showDialog('<h2>Aviso privado</h2><form id="warning-form"><label for="warning-message">Mensaje al integrante</label><textarea id="warning-message" required minlength="5" maxlength="1000"></textarea><button class="primary">Enviar aviso</button></form>');$('warning-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{checked(await db.from('gdv_warnings').insert({user_id:b.dataset.warningUser,actor:user.id,message:$('warning-message').value.trim()}));dialog.close();message('Aviso privado enviado y registrado.')})}});

async function mountRobertKnowledgePanel(){
 if(!isAdmin)return;
 const existing=$('robert-knowledge-admin');if(existing)existing.remove();
 const section=document.createElement('section');
 section.id='robert-knowledge-admin';
 section.className='card robert-knowledge-admin';
 section.innerHTML=`<h2>Conocimiento de Robert Shimoda</h2>
 <p>Subí documentos para incorporarlos al RAG. Formatos admitidos: PDF, TXT, Markdown y DOCX.</p>
 <div class="card" style="margin:14px 0;">
   <div class="post-head">
     <div>
       <h3 style="margin:0 0 4px;">Publicación automática diaria</h3>
       <span class="meta">Robert prepara un borrador todos los días a las 09:00 de Argentina. Siempre requiere tu revisión antes de publicarse.</span>
     </div>
     <button id="robert-daily-toggle" type="button">Cargando…</button>
   </div>
   <p id="robert-daily-status" class="meta" style="margin-top:8px;"></p>
 </div>
 <div class="card" style="margin:14px 0;">
   <div class="post-head">
     <div>
       <h3 style="margin:0 0 4px;">Chat de Robert Shimoda</h3>
       <span class="meta">Podés desactivar las respuestas del asistente sin ocultar la sección.</span>
     </div>
     <button id="robert-chat-toggle" type="button">Cargando…</button>
   </div>
   <p id="robert-chat-status" class="meta" style="margin-top:8px;"></p>
 </div>
 <form id="robert-knowledge-form" class="toolbar">
   <input id="robert-knowledge-file" type="file" accept=".pdf,.txt,.md,.markdown,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required>
   <button class="primary" type="submit">Subir y procesar</button>
 </form>
 <p id="robert-knowledge-status" class="meta" aria-live="polite"></p>
 <div id="robert-knowledge-list"></div>`;
 const overview=app.querySelector('.moderation-overview');
 if(overview)overview.after(section);else app.querySelector('h1')?.after(section);

 const status=$('robert-knowledge-status'),list=$('robert-knowledge-list'),form=$('robert-knowledge-form'),fileInput=$('robert-knowledge-file');
 const dailyToggle=$('robert-daily-toggle'),dailyStatus=$('robert-daily-status');
 const chatToggle=$('robert-chat-toggle'),chatStatus=$('robert-chat-status');
 const titleFromFile=name=>String(name||'Documento').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();

 async function loadDailyConfig(){
   if(!dailyToggle||!dailyStatus||!chatToggle||!chatStatus)return;
   dailyToggle.disabled=true;chatToggle.disabled=true;
   dailyStatus.textContent='Consultando estado…';chatStatus.textContent='Consultando estado…';
   const res=await db.from('robert_daily_config').select('enabled,chat_enabled').eq('singleton',true).maybeSingle();
   if(res.error||!res.data){
     dailyToggle.textContent='No disponible';
     dailyStatus.textContent='No se pudo leer la configuración.';
     return;
   }
   const enabled=!!res.data.enabled;
   dailyToggle.dataset.enabled=String(enabled);
   dailyToggle.textContent=enabled?'Desactivar':'Activar';
   dailyToggle.className=enabled?'danger':'primary';
   dailyToggle.disabled=false;
   dailyStatus.textContent=enabled
     ?'Activo · próximo borrador programado: 09:00 (Argentina).'
     :'Desactivado · Robert no generará borradores ni consumirá API.';

   const chatEnabled=res.data.chat_enabled!==false;
   chatToggle.dataset.enabled=String(chatEnabled);
   chatToggle.textContent=chatEnabled?'Desactivar':'Activar';
   chatToggle.className=chatEnabled?'danger':'primary';
   chatToggle.disabled=false;
   chatStatus.textContent=chatEnabled
     ?'Activo · Robert responde consultas y puede consumir API.'
     :'Desactivado · Robert no responde consultas ni consume API.';
 }

 dailyToggle?.addEventListener('click',async()=>{
   const enabled=dailyToggle.dataset.enabled==='true';
   dailyToggle.disabled=true;
   dailyStatus.textContent=enabled?'Desactivando…':'Activando…';
   const res=await db.rpc('set_robert_daily_enabled',{p_enabled:!enabled});
   if(res.error){
     dailyStatus.textContent='No se pudo cambiar el estado: '+res.error.message;
     dailyToggle.disabled=false;
     return;
   }
   await loadDailyConfig();
 });

 chatToggle?.addEventListener('click',async()=>{
   const enabled=chatToggle.dataset.enabled==='true';
   chatToggle.disabled=true;
   chatStatus.textContent=enabled?'Desactivando…':'Activando…';
   const res=await db.rpc('set_robert_chat_enabled',{p_enabled:!enabled});
   if(res.error){
     chatStatus.textContent='No se pudo cambiar el estado: '+res.error.message;
     chatToggle.disabled=false;
     return;
   }
   await loadDailyConfig();
 });

 async function loadDocs(){
   status.textContent='Cargando documentos…';
   const res=await db.from('robert_documents').select('id,title,original_filename,mime_type,storage_path,status,page_count,chunk_count,metadata,created_at').order('created_at',{ascending:false});
   if(res.error){status.textContent='No se pudieron cargar los documentos: '+res.error.message;return}
   const rows=res.data||[];
   list.innerHTML=rows.map(doc=>`<article class="card" data-robert-doc="${doc.id}">
     <div class="post-head"><div><h3>${esc(doc.title||doc.original_filename||'Documento')}</h3><span class="meta">${esc(doc.original_filename||'')}${doc.page_count?' · '+doc.page_count+' pág.':''}${doc.chunk_count?' · '+doc.chunk_count+' fragmentos':''} · ${date(doc.created_at)}</span></div><strong>${esc((doc.status||'pending').toUpperCase())}</strong></div>
     ${doc.metadata?.last_error?'<p class="priority">'+esc(doc.metadata.last_error)+'</p>':''}
     <div class="toolbar"><button data-robert-reprocess="${doc.id}">Reprocesar</button><button class="danger" data-robert-delete="${doc.id}" data-storage-path="${esc(doc.storage_path||'')}">Eliminar</button></div>
   </article>`).join('')||'<p>Todavía no hay documentos cargados.</p>';
   status.textContent=rows.length+' documento'+(rows.length===1?'':'s')+' en la base de conocimiento.';
 }

 form.onsubmit=async e=>{
   e.preventDefault();const file=fileInput.files?.[0];if(!file)return;
   const lower=file.name.toLowerCase(),allowed=['.pdf','.txt','.md','.markdown','.docx'];
   if(!allowed.some(ext=>lower.endsWith(ext))){status.textContent='Formato no admitido.';return}
   const button=e.submitter;button.disabled=true;status.textContent='Subiendo '+file.name+'…';
   const path=Date.now()+'-'+file.name.replace(/[^a-zA-Z0-9._-]+/g,'-');
   const upload=await db.storage.from('robert-knowledge').upload(path,file,{upsert:false,contentType:file.type||undefined});
   if(upload.error){button.disabled=false;status.textContent='No se pudo subir: '+upload.error.message;return}
   const reg=await db.from('robert_documents').insert({title:titleFromFile(file.name),original_filename:file.name,source_type:'document',mime_type:file.type||null,storage_path:path,status:'pending',uploaded_by:user.id,metadata:{source:'community_moderation'}}).select('id').single();
   if(reg.error||!reg.data?.id){await db.storage.from('robert-knowledge').remove([path]);button.disabled=false;status.textContent='No se pudo registrar el documento.';return}
   status.textContent='Procesando documento…';
   const proc=await db.functions.invoke('robert-ingest',{body:{document_id:reg.data.id}});
   button.disabled=false;fileInput.value='';
   status.textContent=proc.error||!proc.data?.ok?'El archivo se subió, pero ocurrió un error al procesarlo. Podés usar Reprocesar.':'Documento incorporado correctamente a Robert Shimoda.';
   await loadDocs();
 };

 section.onclick=async e=>{
   const re=e.target.closest('[data-robert-reprocess]');
   if(re){re.disabled=true;status.textContent='Reprocesando…';const proc=await db.functions.invoke('robert-ingest',{body:{document_id:re.dataset.robertReprocess}});re.disabled=false;status.textContent=proc.error||!proc.data?.ok?'No se pudo reprocesar.':'Documento reprocesado correctamente.';await loadDocs();return}
   const del=e.target.closest('[data-robert-delete]');
   if(del){if(!confirm('¿Eliminar este documento de la base de conocimiento de Robert?'))return;del.disabled=true;status.textContent='Eliminando documento…';const path=del.dataset.storagePath;if(path)await db.storage.from('robert-knowledge').remove([path]);const removed=await db.from('robert_documents').delete().eq('id',del.dataset.robertDelete);del.disabled=false;status.textContent=removed.error?'No se pudo eliminar: '+removed.error.message:'Documento eliminado.';await loadDocs()}
 };
 await Promise.all([loadDocs(),loadDailyConfig()]);
}

const basicModeration=moderation;
moderation=async function(){await basicModeration();if(!isAdmin)return;const reports=checked(await db.from('gdv_reports').select('*').eq('status','pending')),members=checked(await db.from('gdv_members').select('*')),legacy=await getLegacyPendingCounts();const counts=new Map();reports.forEach(r=>{const key=r.comment_id||r.topic_id;const set=counts.get(key)||new Set();set.add(r.user_id);counts.set(key,set)});const urgent=[...counts].filter(([,users])=>users.size>=3);const panel=document.createElement('section');panel.className='moderation-overview';panel.innerHTML=`<div class="grid">${[
['Reportes pendientes',reports.length,'Denuncias enviadas por usuarios que todavía deben revisarse.'],
['Foro pendientes',topics.filter(t=>t.status==='pending').length+comments.filter(c=>c.status==='pending').length,'Publicaciones y comentarios del foro que esperan aprobación.','#gestion'],
['Cuentas restringidas',members.filter(m=>m.restricted||new Date(m.suspended_until)>new Date()).length,'Usuarios con revisión previa o suspensión actualmente activa.'],
['Alertas prioritarias',urgent.length,'Contenido denunciado por tres usuarios distintos y que requiere atención prioritaria.']
].map(([label,n,detail,href])=>href?`<a class="card moderation-metric-link ${n?'has-pending':''}" href="${href}"><strong class="metric-value">${n}</strong><span>${label}</span><small class="moderation-card-help">${detail}</small></a>`:`<div class="card"><strong class="metric-value">${n}</strong><span>${label}</span><small class="moderation-card-help">${detail}</small></div>`).join('')}</div><div class="legacy-pending-grid"><a class="card legacy-pending-card ${legacy.shimoda?'has-pending':''}" href="moderacion.html#shimoda_comentarios"><strong class="metric-value">${legacy.shimoda}</strong><span>Rincón Shimoda pendientes</span><small class="moderation-card-help">Comentarios del Rincón Shimoda que todavía esperan moderación.</small></a><a class="card legacy-pending-card ${(legacy.compraVenta+legacy.aeroShop)?'has-pending':''}" href="moderacion.html#comercio"><strong class="metric-value">${legacy.compraVenta+legacy.aeroShop}</strong><span>CompraVenta / AeroShop pendientes</span><small>CompraVenta: ${legacy.compraVenta} · AeroShop: ${legacy.aeroShop}</small><small class="moderation-card-help">Avisos de CompraVenta y publicaciones de AeroShop que todavía deben aprobarse.</small></a><a class="card legacy-pending-card ${legacy.fotosHangar?'has-pending':''}" href="moderacion.html#galeria"><strong class="metric-value">${legacy.fotosHangar}</strong><span>Fotos de Mi Hangar pendientes</span><small class="moderation-card-help">Fotografías enviadas por integrantes que esperan tu aprobación para aparecer en la Galería. Abrir para revisar, aprobar o eliminar.</small></a></div><p>Prioridad alta: tres denunciantes distintos sobre el mismo contenido. La decisión sigue siendo humana.</p>${urgent.map(([id,users])=>{const r=reports.find(r=>(r.comment_id||r.topic_id)===id);return `<p class="priority">⚑ ${users.size} denunciantes · ${link('Revisar contenido','#tema/'+r.topic_id+(r.comment_id?'/'+r.comment_id:''))}</p>`}).join('')}`;app.querySelector('h1').after(panel);
const actionButtons=[...app.querySelectorAll('.moderation-action')];
if(actionButtons[1])actionButtons[1].classList.toggle('has-pending',(legacy.shimoda+legacy.compraVenta+legacy.aeroShop+legacy.fotosHangar)>0);
refreshAdminPendingBadge().catch(()=>{});await mountRobertKnowledgePanel();};

(async()=>{try{user=await window.GDV_AUTH.ready;await loadRole();await heartbeat();account();await load();await route()}catch(e){app.innerHTML='<h1>Comunidad</h1><p>No se pudo conectar. Volvé a intentarlo en unos momentos.</p>';message(e.message,true)}})();
})();
