const {JSDOM}=require('jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const data={gdv_categories:[{slug:'travesias',name:'Travesías',color:'#22C55E',welcome:'Compartí tus viajes',rules:'Fecha y ruta',position:0},{slug:'otros',name:'Otros',color:'#999999',welcome:'Bienvenidos',rules:'Respeto',position:1}],profiles:[{id:'u1',username:'Piloto_1',created_at:'2026-01-01',avatar_url:null}],gdv_topics:[{id:'t1',author_id:'u1',category:'travesias',title:'Viaje de prueba',summary:'Resumen',content:'## Título\n• Primera\n• Segunda\n[Fuente](https://example.com)\n<script>alert(1)</script>',status:'approved',state:'open',tags:[],created_at:'2026-01-01',updated_at:'2026-01-01'}],gdv_comments:[],gdv_media:[{id:'m1',topic_id:'t1',owner_id:'u1',legacy_url:'https://example.com/a.webp',kind:'image'},{id:'m2',topic_id:'t1',owner_id:'u1',legacy_url:'https://example.com/v.mp4',kind:'video'}],gdv_reactions:[],gdv_saved:[],gdv_follows:[],site_admins:[],gdv_contact:[],gdv_notifications:[]};
let mutations=[],activeUser=null;
class Query{
 constructor(table){this.table=table;this.filters=[];this.action='select'}
 select(){return this}order(){return this}limit(){return this}range(){return this}
 eq(k,v){this.filters.push(x=>x[k]===v);return this}ilike(k,v){this.filters.push(x=>(x[k]||'').toLowerCase()===v.replaceAll('\\_','_').toLowerCase());return this}
 maybeSingle(){this.singleRow=true;return this}single(){this.singleRow=true;return this}
 insert(payload){this.action='insert';this.payload=payload;return this}upsert(payload){return this.insert(payload)}
 update(payload){this.action='update';this.payload=payload;return this}delete(){this.action='delete';return this}
 then(resolve,reject){try{let rows=(data[this.table]||[]).filter(x=>this.filters.every(f=>f(x)));if(this.action!=='select'){mutations.push({table:this.table,action:this.action,payload:this.payload});if(this.action==='insert'){const record={id:'new',status:'pending',...this.payload};data[this.table].push(record);rows=[record]}else if(this.action==='update')rows.forEach(r=>Object.assign(r,this.payload));}return Promise.resolve({data:this.singleRow?rows[0]||null:rows,error:null}).then(resolve,reject)}catch(e){return Promise.reject(e).then(resolve,reject)}}
}
const html=fs.readFileSync(root+'/comunidad.html','utf8');const dom=new JSDOM(html,{url:'https://example.test/comunidad.html#foro',runScripts:'outside-only'}),w=dom.window,d=w.document;
w.GDV_CONFIG={url:'https://test.invalid',key:'public',turnstileSiteKey:''};w.confirm=()=>true;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.HTMLElement.prototype.scrollIntoView=function(){};
w.supabase={createClient:()=>({from:t=>new Query(t),storage:{from:()=>({createSignedUrls:async()=>({data:[]}),getPublicUrl:path=>({data:{publicUrl:'https://example.com/'+path}})})},auth:{getUser:async()=>({data:{user:activeUser}}),onAuthStateChange:()=>{},signOut:async()=>({data:{}})}})};
const source=fs.readFileSync(root+'/assets/comunidad.js','utf8').replace(/\}\)\(\);\s*$/, 'window.testAPI={body,editor,route,load,authView,profileEditor,administration,setUser(value,admin=false){user=value;isAdmin=admin}};})();');w.eval(source);
const wait=()=>new Promise(r=>setTimeout(r,30));const route=async hash=>{w.location.hash=hash;await wait()};
(async()=>{
 await wait();assert.match(d.querySelector('#feed').textContent,/Viaje de prueba/);
 await route('tematica/travesias');assert.match(d.querySelector('.rule-box').textContent,/Compartí tus viajes/);assert.equal(d.querySelector('#breadcrumbs a[href="#foro"]').textContent,'Foro');
 await route('multimedia');assert.deepEqual([...d.querySelector('#media-kind').options].map(o=>o.value),['all','image','video']);d.querySelector('#media-kind').value='video';d.querySelector('#media-kind').dispatchEvent(new w.Event('change'));assert.equal(d.querySelectorAll('#media-list article').length,1);assert(d.querySelector('#media-list video'));
 await route('tema/t1');assert.equal(d.querySelectorAll('.body-text ul li').length,2);assert.equal(d.querySelectorAll('.body-text script').length,0);assert.equal(d.querySelector('.body-text a').href,'https://example.com/');assert.match(d.querySelector('.body-text').textContent,/<script>/);
 await route('notificaciones');assert.match(d.querySelector('#app').textContent,/Ingresar para ver/);
 await route('ingresar');d.querySelector('[data-action="show-password"]').click();assert.equal(d.querySelector('#login-pass').type,'text');
 w.testAPI.setUser({id:'u1',email_confirmed_at:'2026-01-01'});await route('crear');d.querySelector('#topic-title').value='Borrador';d.querySelector('[data-travel="destino"]').value='Cañuelas';d.querySelector('#topic-title').dispatchEvent(new w.Event('input',{bubbles:true}));let draft=JSON.parse(w.localStorage.getItem('gdv-draft-u1new'));assert.equal(draft.travel.destino,'Cañuelas');
 await route('foro');await route('crear');assert.equal(d.querySelector('[data-travel="destino"]').value,'Cañuelas');assert.equal(d.querySelector('#topic-title').value,'Borrador');
 await route('perfil');assert(d.querySelector('#profile-username'));assert.equal(d.querySelector('#profile-username').value,'Piloto_1');
 await route('gestion');assert.match(d.querySelector('#app').textContent,/Acceso restringido/);
 w.testAPI.setUser({id:'u1',email_confirmed_at:'2026-01-01'},true);await w.testAPI.route();assert(d.querySelector('[data-manage-topic="t1"]'));d.querySelector('[data-manage-topic="t1"]').click();assert(d.querySelector('#manage-state'));
 console.log('PASS: feed, breadcrumbs, multimedia filters, safe formatting, anonymous access, password toggle, travel drafts, profile, moderation controls');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;dom.window.close()});
