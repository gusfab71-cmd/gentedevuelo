import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.0";

const origins=new Set(["https://gentedevuelo.com","https://www.gentedevuelo.com","https://gentedevuelo.vercel.app"]);
const passwordOK=(p:string)=>p.length>=9&&p.length<=128&&/[a-z]/.test(p)&&/[A-Z]/.test(p)&&/[0-9]/.test(p)&&/[!-/:-@[-\x60{-~]/.test(p);
function respond(origin:string|null,status:number,data:unknown){
 return new Response(JSON.stringify(data),{status,headers:{
   "Content-Type":"application/json; charset=utf-8",
   "Access-Control-Allow-Origin":origins.has(origin||"")?origin!:"https://gentedevuelo.com",
   "Access-Control-Allow-Methods":"POST, OPTIONS",
   "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
   "Cache-Control":"no-store","Vary":"Origin"}});
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:respond(origin,200,{}).headers});
 if(req.method!=="POST")return respond(origin,405,{error:"Método no permitido."});
 if(origin&&!origins.has(origin))return respond(origin,403,{error:"Origen no autorizado."});
 if(Number(req.headers.get("content-length")||0)>5000)return respond(origin,413,{error:"Solicitud demasiado grande."});
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!service)return respond(origin,503,{error:"Servicio de altas no configurado."});
 const jwt=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!jwt)return respond(origin,401,{error:"Ingresá con tu cuenta."});
 const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await auth.auth.getUser(jwt);
 if(authError||!user)return respond(origin,401,{error:"Sesión vencida. Volvé a ingresar."});
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 let body:Record<string,unknown>;
 try{const raw=await req.text();if(raw.length>5000)throw Error();body=JSON.parse(raw);if(!body||Array.isArray(body)||typeof body!=="object")throw Error()}
 catch{return respond(origin,400,{error:"Solicitud inválida."})}
 if(body.action==="complete_initial_password"){
   if(user.app_metadata?.gdv_initial_password!==true)return respond(origin,403,{error:"No tenés un cambio de contraseña pendiente."});
   const {error}=await admin.auth.admin.updateUserById(user.id,{app_metadata:{...user.app_metadata,gdv_initial_password:false}});
   if(error)return respond(origin,503,{error:"No se pudo finalizar el cambio. Volvé a intentar."});
   return respond(origin,200,{ok:true});
 }
 if(body.action!=="create_manual")return respond(origin,400,{error:"Acción desconocida."});
 const permission=await admin.from("site_admins").select("user_id").eq("user_id",user.id).maybeSingle();
 if(permission.error)return respond(origin,503,{error:"No se pudo verificar la autorización."});
 if(!permission.data)return respond(origin,403,{error:"Solo administración puede crear integrantes."});
 const username=typeof body.username==="string"?body.username.trim():"";
 const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
 const full_name=typeof body.full_name==="string"?body.full_name.trim():"";
 const password=typeof body.password==="string"?body.password:"";
 if(body.email_verified_by_admin!==true)return respond(origin,400,{error:"Verificá la titularidad del correo y el consentimiento."});
 if(!/^[A-Za-z0-9_-]{3,25}$/.test(username)||/^(admin|administrador|moderador|shimoda|gentedevuelo|soporte)$/i.test(username))return respond(origin,400,{error:"Nombre de usuario inválido o reservado."});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return respond(origin,400,{error:"Correo electrónico inválido."});
 if(full_name.length>80)return respond(origin,400,{error:"El nombre visible supera 80 caracteres."});
 if(!passwordOK(password))return respond(origin,400,{error:"Contraseña temporal: mínimo 9 caracteres con mayúscula, minúscula, número y símbolo."});
 const found=await admin.from("profiles").select("id").ilike("username",username.replaceAll("_","\\_")).limit(1);
 if(found.error)return respond(origin,503,{error:"No se pudo comprobar el nombre de usuario."});
 if(found.data?.length)return respond(origin,409,{error:"Ese nombre de usuario ya existe."});
 const created=await admin.auth.admin.createUser({
   email,password,email_confirm:true,
   user_metadata:{username,full_name:full_name||username},
   app_metadata:{gdv_initial_password:true}
 });
 if(created.error){
   const duplicate=/already|registered|exists|duplicate/i.test(created.error.message);
   return respond(origin,duplicate?409:400,{error:duplicate?"Ese correo ya está registrado. Recuperá su acceso o reenviá la confirmación.":"No se pudo crear el integrante: "+created.error.message});
 }
 console.info("gdv_manual_registration",JSON.stringify({actor:user.id,member:created.data.user?.id}));
 return respond(origin,201,{ok:true,username});
});