import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.0";

/**
 * Control de cuentas del Superadministrador.
 * Nunca expone SERVICE_ROLE al navegador ni elimina identidades.
 * "suspend" bloquea nuevos ingresos; los JWT ya emitidos pueden seguir
 * vigentes hasta su expiración. No se promete revocación instantánea.
 */
const origins=new Set([
 "https://gentedevuelo.com",
 "https://www.gentedevuelo.com",
 "https://gentedevuelo.vercel.app",
 "https://aerosuite.gentedevuelo.com",
 "https://gentedevuelo-git-feat-aerometeo-hourly-vis-08a690-gusfab71-3221.vercel.app"
]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(origin:string|null,status:number,body:unknown)=>new Response(JSON.stringify(body),{
 status,headers:{
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store","Vary":"Origin",
  "Access-Control-Allow-Origin":origin&&origins.has(origin)?origin:"https://gentedevuelo.com",
  "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
 }
});
const fail=(status:number,error:string,origin:string|null)=>reply(origin,status,{ok:false,error});
const wasBanned=(until:unknown)=>typeof until==="string"&&Date.parse(until)>Date.now();

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:reply(origin,200,{}).headers});
 if(req.method!=="POST")return fail(405,"Método no permitido.",origin);
 if(origin&&!origins.has(origin))return fail(403,"Origen no permitido.",origin);
 if(Number(req.headers.get("content-length")||"0")>3500)return fail(413,"Solicitud demasiado grande.",origin);
 const endpoint=Deno.env.get("SUPABASE_URL")||"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!endpoint||!anon||!secret)return fail(503,"Configuración incompleta.",origin);
 const jwt=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!jwt)return fail(401,"Debés iniciar sesión.",origin);
 const caller=createClient(endpoint,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authenticationError}=await caller.auth.getUser(jwt);
 if(authenticationError||!user||!user.email_confirmed_at)return fail(401,"Sesión no verificada.",origin);
 const db=createClient(endpoint,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const permission=await db.from("aerosuite_superadmins")
  .select("user_id").eq("user_id",user.id).maybeSingle();
 if(permission.error)return fail(503,"No se pudo consultar la autorización.",origin);
 if(!permission.data)return fail(403,"Solo el Superadministrador puede administrar cuentas.",origin);
 let body:Record<string,unknown>;
 try{
  const raw=await req.text();
  if(raw.length>3500)throw Error("demasiado grande");
  body=JSON.parse(raw);
  if(!body||typeof body!=="object"||Array.isArray(body))throw Error("formato");
 }catch{return fail(400,"Solicitud inválida.",origin)}
 const action=String(body.action||"");
 const targetId=String(body.target_id||"");
 if(!["inspect","suspend","restore"].includes(action)||!uuid.test(targetId))
   return fail(400,"Acción o cuenta inválida.",origin);
 const targetResult=await db.auth.admin.getUserById(targetId);
 if(targetResult.error||!targetResult.data.user)
   return fail(404,"La cuenta seleccionada no existe.",origin);
 const target=targetResult.data.user;
 const email=String(target.email||"").trim().toLowerCase();
 const expected=String(body.expected_email||"").trim().toLowerCase();
 if(email!==expected||!email)return fail(409,"Los datos de esta cuenta cambiaron. Actualizá el padrón.",origin);
 const [site,superUser,special]=await Promise.all([
  db.from("site_admins").select("user_id").eq("user_id",targetId).maybeSingle(),
  db.from("aerosuite_superadmins").select("user_id").eq("user_id",targetId).maybeSingle(),
  db.from("gdv_special_users").select("user_id").eq("user_id",targetId).maybeSingle()
 ]);
 if(site.error||superUser.error||special.error)
   return fail(503,"No fue posible verificar si la cuenta está protegida.",origin);
 // Cuentas del Centro de Testeo: comprobar contra la institución real,
 // incluso si una identidad técnica antigua no tiene metadata de laboratorio.
 const memberships=await db.from("aerosuite_institution_members")
  .select("institution_id").eq("user_id",targetId);
 if(memberships.error)return fail(503,"No se pudo verificar la pertenencia institucional.",origin);
 const institutionIds=[...new Set((memberships.data||[]).map(v=>v.institution_id))];
 let labMember=false;
 if(institutionIds.length){
  const tests=await db.from("aerosuite_institutions").select("id")
   .in("id",institutionIds).eq("is_test",true).limit(1);
  if(tests.error)return fail(503,"No se pudo comprobar si la cuenta pertenece al laboratorio.",origin);
  labMember=Boolean(tests.data?.length);
 }
 const isProtected=targetId===user.id||Boolean(site.data)||Boolean(superUser.data)||
  Boolean(special.data)||target.app_metadata?.aerosuite_lab===true||labMember;
 const banned=wasBanned((target as {banned_until?:string|null}).banned_until);
 if(action==="inspect"){
  const history=await db.from("gdv_superadmin_account_control_audit")
   .select("created_at,action,reason,outcome,actor_email")
   .eq("target_id",targetId).order("created_at",{ascending:false}).limit(8);
  if(history.error)return fail(503,"No se pudo leer el registro de auditoría.",origin);
  return reply(origin,200,{
   ok:true,email,protected:isProtected,banned,
   banned_until:(target as {banned_until?:string|null}).banned_until||null,
   history:history.data||[],
   note:"La suspensión bloquea nuevos inicios de sesión. Los JWT existentes pueden conservar acceso hasta vencer."
  });
 }
 if(isProtected)return fail(403,"Esta cuenta administrativa, especial o de laboratorio está protegida. No se modificó.",origin);
 const reason=typeof body.reason==="string"?body.reason.trim():"";
 if(reason.length<8||reason.length>1000)
   return fail(400,"Indicá un motivo de 8 a 1000 caracteres.",origin);
 const phrase=action==="suspend"?"SUSPENDER CUENTA":"REHABILITAR CUENTA";
 if(body.confirmation!==phrase)
   return fail(400,"Falta la confirmación expresa de la operación.",origin);
 if(action==="suspend"&&banned)return fail(409,"La cuenta ya está suspendida.",origin);
 if(action==="restore"&&!banned)return fail(409,"La cuenta no está suspendida.",origin);
 // Límite contra operaciones masivas o automatizadas a través del panel.
 const recent=await db.from("gdv_superadmin_account_control_audit")
  .select("id",{count:"exact",head:true}).eq("actor_id",user.id)
  .gte("created_at",new Date(Date.now()-24*60*60*1000).toISOString());
 if(recent.error)return fail(503,"No se pudo comprobar el límite administrativo.",origin);
 if((recent.count||0)>=30)return fail(429,"Límite diario de operaciones alcanzado.",origin);
 // La auditoría previa es requisito: si no queda rastro, no actuamos.
 const audit=await db.from("gdv_superadmin_account_control_audit")
  .insert({actor_id:user.id,actor_email:String(user.email||""),
   target_id:targetId,target_email:email,action,reason,outcome:"started"})
  .select("id").single();
 if(audit.error||!audit.data)
   return fail(503,"No se pudo registrar la autorización. No se modificó la cuenta.",origin);
 const update=await db.auth.admin.updateUserById(targetId,{
  ban_duration:action==="suspend"?"876000h":"none"
 });
 const outcome=update.error?"failed":"success";
 const log=await db.from("gdv_superadmin_account_control_audit").update({
  outcome,finished_at:new Date().toISOString(),
  error_code:update.error?"auth_update_failed":null
 }).eq("id",audit.data.id).eq("outcome","started");
 if(update.error)return fail(503,"No se pudo modificar la cuenta. La operación fallida quedó registrada.",origin);
 if(log.error)return reply(origin,200,{ok:true,email,banned:action==="suspend",
   warning:"El cambio fue aplicado, pero no pudo cerrarse el registro de auditoría. Requiere revisión."});
 return reply(origin,200,{ok:true,email,banned:action==="suspend",
  note:"El cambio se realizó en Supabase Auth. Los tokens anteriores pueden seguir vigentes hasta vencer."});
});
