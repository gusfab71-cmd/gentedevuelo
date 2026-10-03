// Public entrypoint implementing password authentication through Supabase Auth.
// The private email lookup is restricted to service_role in Postgres.
const headers = {'Content-Type':'application/json','Access-Control-Allow-Origin':'https://gusfab71-cmd.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin')||'';
 const allowed=origin==='https://gusfab71-cmd.github.io'||/^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
 const responseHeaders={...headers,'Access-Control-Allow-Origin':allowed?origin:'https://gusfab71-cmd.github.io','Vary':'Origin'};
 const respond=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:responseHeaders});
 if(origin&&!allowed)return respond(403,{error:'Origen no autorizado'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders});
 if(req.method!=='POST')return respond(405,{error:'Método no permitido'});
 try{
  if(Number(req.headers.get('content-length')||0)>8192)return respond(413,{error:'Solicitud demasiado grande'});
  const raw=await req.text();if(raw.length>8192)return respond(413,{error:'Solicitud demasiado grande'});
  const {username,password}=JSON.parse(raw);
  if(typeof username!=='string'||!/^[A-Za-z0-9_-]{3,25}$/.test(username)||typeof password!=='string'||password.length<1||password.length>1024)return respond(400,{error:'Revisá el usuario y la contraseña.'});
  const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const lookup=await fetch(url+'/rest/v1/rpc/gdv_login_lookup',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_username:username})});
  if(!lookup.ok)return respond(503,{error:'No se pudo ingresar. Intentá nuevamente más tarde.'});
  const email=await lookup.json();
  if(email==='__rate_limited__')return respond(429,{error:'Demasiados intentos. Esperá cinco minutos antes de volver a probar.'});
  const login=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email:email||'unregistered-'+crypto.randomUUID()+'@invalid.example',password})});
  if(!login.ok)return respond(login.status===429?429:400,{error:'No se pudo ingresar. Revisá usuario, contraseña y confirmación de correo.'});
  return respond(200,await login.json());
 }catch{return respond(400,{error:'No se pudo procesar el ingreso.'})}
});

