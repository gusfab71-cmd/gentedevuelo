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
 if(body.action==="change_initial_password"){
   if(user.app_metadata?.gdv_initial_password!==true)return respond(origin,403,{error:"No tenés un cambio de contraseña pendiente."});
   const newPassword=typeof body.password==="string"?body.password:"";
   if(!passwordOK(newPassword))return respond(origin,400,{error:"La nueva contraseña no cumple los requisitos."});
   // The password and the mandatory-change flag are updated together on the trusted server.
   const {error}=await admin.auth.admin.updateUserById(user.id,{
     password:newPassword,app_metadata:{...user.app_metadata,gdv_initial_password:false}
   });
   if(error)return respond(origin,503,{error:"No se pudo guardar la nueva contraseña. Volvé a intentar."});
   return respond(origin,200,{ok:true});
 }

 if(body.action==="list_incomplete"||body.action==="recover_existing"){
   const permission=await admin.from("site_admins").select("user_id").eq("user_id",user.id).maybeSingle();
   if(permission.error)return respond(origin,503,{error:"No se pudo verificar tu autorización."});
   if(!permission.data)return respond(origin,403,{error:"Función exclusiva del administrador."});
   if(body.action==="list_incomplete"){
     // Read Auth only on the trusted server; return only incomplete/unconfirmed accounts.
     const accounts:Array<{id:string,email?:string,email_confirmed_at?:string|null,last_sign_in_at?:string|null,created_at:string,app_metadata?:Record<string,unknown>}>=[]; 
     for(let page=1;page<=30;page++){
       const result=await admin.auth.admin.listUsers({page,perPage:200});
       if(result.error)return respond(origin,503,{error:"No se pudo consultar Auth."});
       const batch=result.data?.users||[];
       accounts.push(...batch);
       if(batch.length<200)break;
       if(page===30)return respond(origin,503,{error:"Demasiados registros para esta consulta. Contactá al soporte."});
     }
     const profileData=await admin.from("profiles").select("id,username,full_name,aviation_role,avatar_url,onboarding_completed");
     if(profileData.error)return respond(origin,503,{error:"No se pudo consultar el estado de los perfiles."});
     const profiles=new Map((profileData.data||[]).map(p=>[p.id,p]));
     const entries=accounts.flatMap(account=>{
       const p=profiles.get(account.id);
       if(p?.onboarding_completed===true&&account.email_confirmed_at)return [];
       const providers=Array.isArray(account.app_metadata?.providers)?account.app_metadata.providers.filter(v=>typeof v==="string"):[];
       const viaGoogle=account.app_metadata?.provider==="google"||providers.includes("google");
       const pending:string[]=[];
       if(!account.email_confirmed_at)pending.push("Confirmar correo");
       if(!p||p.onboarding_completed!==true)pending.push("Completar perfil");
       if(!p?.username||/^piloto[_-]/i.test(p.username))pending.push("Elegir nombre de usuario");
       if(!p?.aviation_role)pending.push("Actividad aeronáutica");
       if(!p?.avatar_url)pending.push("Subir fotografía");
       return [{
         id:account.id,email:account.email||"",username:p?.username||"",
         full_name:p?.full_name||"",google:viaGoogle,
         email_confirmed:!!account.email_confirmed_at,
         profile_completed:p?.onboarding_completed===true,
         initial_password_pending:account.app_metadata?.gdv_initial_password===true,
         created_at:account.created_at,last_sign_in_at:account.last_sign_in_at||null,
         missing:pending
       }];
     });
     entries.sort((a,b)=>a.created_at>b.created_at?-1:1);
     return respond(origin,200,{ok:true,total:accounts.length,pending:entries.length,entries});
   }
   // Changing an existing account is a privileged, opt-in recovery operation.
   const id=typeof body.user_id==="string"?body.user_id:"";
   const password=typeof body.password==="string"?body.password:"";
   if(!/^[0-9a-f-]{36}$/i.test(id))return respond(origin,400,{error:"Cuenta inválida."});
   if(body.identity_verified_by_admin!==true)return respond(origin,400,{error:"Verificá identidad, titularidad del correo y autorización expresa."});
   if(!passwordOK(password))return respond(origin,400,{error:"Contraseña temporal: 9 caracteres, mayúscula, minúscula, número y símbolo."});
   if(id===user.id)return respond(origin,403,{error:"No podés recuperar tu propia cuenta desde este panel."});
   const targetAdmin=await admin.from("site_admins").select("user_id").eq("user_id",id).maybeSingle();
   if(targetAdmin.error)return respond(origin,503,{error:"No se pudo comprobar la cuenta."});
   if(targetAdmin.data)return respond(origin,403,{error:"No se puede modificar una cuenta administradora."});
   const target=await admin.auth.admin.getUserById(id);
   if(target.error||!target.data?.user)return respond(origin,404,{error:"La cuenta ya no existe."});
   const existing=target.data.user;
   if(!existing.email_confirmed_at)return respond(origin,400,{error:"El correo no está confirmado. Primero completá la verificación de correo."});
   const profile=await admin.from("profiles").select("onboarding_completed").eq("id",id).maybeSingle();
   if(profile.error)return respond(origin,503,{error:"No se pudo consultar el perfil del integrante."});
   if(profile.data?.onboarding_completed===true)return respond(origin,409,{error:"El registro ya está completo. Usá la recuperación habitual de contraseña."});
   const updated=await admin.auth.admin.updateUserById(id,{
     password,app_metadata:{...existing.app_metadata,gdv_initial_password:true}
   });
   if(updated.error)return respond(origin,503,{error:"No se pudo asignar la contraseña temporal."});
   console.info("gdv_recover_incomplete",JSON.stringify({actor:user.id,member:id}));
   return respond(origin,200,{ok:true,email:existing.email});
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