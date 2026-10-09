const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/auth-guard.js'),'utf8');
async function scenario(path,{cached=false,exists=true,error=null,onboardingCompleted=true}={}){
 const url=new URL(path,'https://gusfab71-cmd.github.io/gentedevuelo/'),redirects=[],events={},storage=new Map();let signedOut=0,userChecks=0;
 const client={
  from: table=>table==='profiles'?
   {select:()=>({eq:()=>({maybeSingle:async()=>({data:{onboarding_completed:onboardingCompleted},error:null})})})}:
   {upsert:async()=>({error:null})},
  auth:{getSession:async()=>({data:{session:cached?{user:{id:'cached'}}:null}}),getUser:async()=>{userChecks++;return{data:{user:exists?{id:'verified'}:null},error}},signOut:async()=>{signedOut++},onAuthStateChange:cb=>{events.auth=cb}}
 };
 const ctx={URL,URLSearchParams,setInterval(){},GDV_CONFIG:{url:'https://example.supabase.co',key:'public'},supabase:{createClient:()=>client},document:{hidden:false,addEventListener(){},currentScript:{src:'https://gusfab71-cmd.github.io/gentedevuelo/assets/auth-guard.js'},documentElement:{classList:{add(){},remove(){}}}},location:{href:url.href,pathname:url.pathname,hash:url.hash,replace:u=>redirects.push(u)},sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)}};
 ctx.window={addEventListener:(name,cb)=>events[name]=cb};vm.runInNewContext(source,ctx);await ctx.window.GDV_AUTH.ready;
 return{ctx,redirects,events,storage,signedOut,userChecks};
}
(async()=>{
 for(const path of ['index.html','comunidad.html#foro','comunidad.html#tematicas','comunidad.html#tema/demo','comunidad.html#tematica/instruccion','comunidad.html#hangar/demo']){const r=await scenario(path);assert.equal(r.redirects.length,0);assert.equal(r.userChecks,0)}
 for(const path of ['utilidades/calculo-sustentacion.html','moderacion.html']){const r=await scenario(path);assert.equal(r.redirects[0],'https://gusfab71-cmd.github.io/gentedevuelo/comunidad.html#ingresar');assert.equal(r.userChecks,0)}
 for(const hash of ['ingresar','registro','recuperar','normativa','quienes-somos','foro','tematicas','multimedia','integrantes'])assert.equal((await scenario('comunidad.html#'+hash)).redirects.length,0);
 let r=await scenario('comunidad.html#foro',{cached:true});assert.equal(r.redirects.length,0);assert.equal(r.userChecks,1);assert.equal(await r.ctx.window.GDV_AUTH.requireRoute(),true);
 r=await scenario('comunidad.html#foro',{cached:true,exists:false,error:{status:401}});assert.equal(r.signedOut,1);assert.equal(r.redirects.length,1);
 r=await scenario('index.html#type=recovery&access_token=test',{cached:true});assert.equal(r.redirects.length,0);assert.equal(r.ctx.window.GDV_AUTH.recovery,true);
 r=await scenario('comunidad.html#ingresar',{cached:true});r.storage.set('gdv-return-to','https://evil.example/');await r.ctx.window.GDV_AUTH.afterLogin();assert.match(r.redirects[0],/^https:\/\/gusfab71-cmd.github.io\/gentedevuelo\/comunidad.html#foro$/);
 r=await scenario('comunidad.html#ingresar',{cached:true});r.storage.set('gdv-return-to','https://gusfab71-cmd.github.io/gentedevuelo/index.html#clasificados-seccion');await r.ctx.window.GDV_AUTH.afterLogin();assert.ok(r.redirects[0].endsWith('#clasificados-seccion'));
 for(const path of ['index.html','comunidad.html#foro','aerochat.html','moderacion.html','utilidades/flightprep-nav.html']){
  r=await scenario(path,{cached:true,onboardingCompleted:false});
  assert.equal(r.redirects[0],'https://gusfab71-cmd.github.io/gentedevuelo/comunidad.html#completar-perfil');
 }
 for(const hash of ['completar-perfil','normativa']){
  r=await scenario('comunidad.html#'+hash,{cached:true,onboardingCompleted:false});
  assert.equal(r.redirects.length,0);
  assert.equal(r.ctx.window.GDV_AUTH.needsOnboarding(),true);
  assert.equal(await r.ctx.window.GDV_AUTH.requireRoute(),true);
 }
 r=await scenario('comunidad.html#ingresar',{cached:true,onboardingCompleted:false});
 await r.ctx.window.GDV_AUTH.afterLogin();
 assert.equal(r.redirects.at(-1),'https://gusfab71-cmd.github.io/gentedevuelo/comunidad.html#completar-perfil');
 console.log('PASS: public routes, authentication, Google registration lock across sections and safe returns');
})().catch(e=>{console.error(e);process.exitCode=1});
