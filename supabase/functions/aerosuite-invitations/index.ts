import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.0";

const trustedOrigins=new Set([
 "https://gentedevuelo.com","https://www.gentedevuelo.com",
 "https://gentedevuelo.vercel.app","https://aerosuite.gentedevuelo.com"
]);
const cors=(origin:string|null)=>({
 "Access-Control-Allow-Origin":origin&&trustedOrigins.has(origin)?origin:"https://gentedevuelo.com",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Cache-Control":"no-store","Vary":"Origin"
});
const reply=(origin:string|null,status:number,body:unknown)=>new Response(JSON.stringify(body),{
 status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8"}
});
const esc=(value:string)=>value.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));
const roleLabels:Record<string,string>={administrador:"administrador",secretaria:"secretaría",instructor:"instructor",alumno:"alumno"};
// Invitaciones habilitadas durante la prueba y los 15 días de cortesía; nunca en modo consulta.
const allowedStatus=(org:any)=>org?.status==="trial"&&Number.isFinite(Date.parse(org.trial_ends_at))
 &&Date.parse(org.trial_ends_at)+15*24*60*60*1000>Date.now()
 ||org?.status==="active"&&Date.parse(org.license_ends_at)>Date.now();

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=="POST")return reply(origin,405,{error:"Método no permitido."});
 if(origin&&!trustedOrigins.has(origin))return reply(origin,403,{error:"Origen no permitido."});
 const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return reply(origin,401,{error:"Iniciá sesión."});
 const url=Deno.env.get("SUPABASE_URL")||"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!anon||!service)return reply(origin,503,{error:"Autenticación de invitaciones no configurada."});
 const identity=createClient(url,anon,{auth:{persistSession:false}});
 const {data:{user},error:identityError}=await identity.auth.getUser(token);
 if(identityError||!user||!user.email_confirmed_at)return reply(origin,401,{error:"Iniciá sesión con un correo verificado."});
 let input:Record<string,unknown>;
 try{input=await req.json()}catch{return reply(origin,400,{error:"Solicitud inválida."})}
 if(input.mode!=="send")return reply(origin,400,{error:"Acción no permitida."});
 const id=String(input.institution_id||"");
 const role=String(input.role||"");
 const email=String(input.email||"").trim().toLowerCase();
 if(!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/.test(id)||!["administrador","secretaria","instructor","alumno"].includes(role)
   ||email.length>254||email.length<5||!/^\S+@\S+\.\S+$/.test(email))
   return reply(origin,400,{error:"Revisá institución, rol y correo."});
 const db=createClient(url,service,{auth:{persistSession:false}});
 const orgResp=await db.from("aerosuite_institutions")
   .select("id,name,status,trial_ends_at,license_ends_at,contact_email")
   .eq("id",id).maybeSingle();
 if(orgResp.error||!orgResp.data)return reply(origin,404,{error:"Institución no encontrada."});
 const org=orgResp.data;
 if(!allowedStatus(org))return reply(origin,403,{error:"La institución no tiene una licencia vigente."});
 const superResp=await db.from("aerosuite_superadmins").select("user_id").eq("user_id",user.id).maybeSingle();
 if(superResp.error)return reply(origin,503,{error:"No se pudo comprobar la autorización."});
 const isSuper=Boolean(superResp.data);
 if(role==="administrador"){
   if(!isSuper)return reply(origin,403,{error:"Solo el Superadministrador autoriza directores."});
   if(email!==String(org.contact_email||"").trim().toLowerCase())
      return reply(origin,400,{error:"El director debe coincidir con el correo institucional registrado."});
 }else if(role==="secretaria"||!isSuper){
   const member=await db.from("aerosuite_institution_members")
     .select("user_id").eq("institution_id",id).eq("user_id",user.id).in("role",role==="secretaria"?["administrador"]:["administrador","secretaria"]).maybeSingle();
   if(member.error||!member.data)return reply(origin,403,{error:role==="secretaria"?"Solo Dirección puede invitar a Secretaría.":"Solo Dirección o Secretaría pueden invitar alumnos e instructores."});
   const recent=await db.from("aerosuite_institution_invitations")
     .select("id",{count:"exact",head:true}).eq("institution_id",id)
     .eq("created_by",user.id).gte("created_at",new Date(Date.now()-86400000).toISOString());
   if(recent.error)return reply(origin,503,{error:"No se pudo comprobar el límite de invitaciones."});
   if((recent.count||0)>=25)return reply(origin,429,{error:"Límite de invitaciones de hoy alcanzado."});
 }
 const key=Deno.env.get("RESEND_API_KEY")||"";
 const sender=Deno.env.get("GDV_MAIL_SENDER")||"Gente de Vuelo <hola@gentedevuelo.com>";
 if(!key)return reply(origin,503,{error:"El servicio de correo todavía no está configurado en Supabase."});
 const outstanding=await db.from("aerosuite_institution_invitations")
   .select("id,last_sent_at,expires_at,sent_count")
   .eq("institution_id",id).eq("email",email).eq("role",role)
   .is("accepted_at",null).is("revoked_at",null).order("created_at",{ascending:false}).limit(1);
 if(outstanding.error)return reply(origin,503,{error:"No se pudo verificar la invitación."});
 const existing=outstanding.data?.[0]||null;
 if(existing?.last_sent_at&&Date.parse(existing.last_sent_at)>Date.now()-120000)
  return reply(origin,429,{error:"La invitación se envió recientemente. Revisá el correo antes de reenviarla."});
 let inviteId=existing?.id;
 if(!inviteId){
  const previous=await db.from("aerosuite_institution_invitations")
    .select("id").eq("institution_id",id).eq("email",email).eq("role",role)
    .not("accepted_at","is",null).is("revoked_at",null).limit(1);
  if(previous.error)return reply(origin,503,{error:"No se pudo verificar el historial."});
  if(previous.data?.length)return reply(origin,409,{error:"Este usuario ya aceptó una invitación para ese rol."});
  const inserted=await db.from("aerosuite_institution_invitations")
    .insert({institution_id:id,email,role,created_by:user.id,expires_at:new Date(Date.now()+7*86400000).toISOString()})
    .select("id").single();
  if(inserted.error)return reply(origin,409,{error:"No se pudo crear la invitación. Actualizá el panel y reintentá."});
  inviteId=inserted.data.id;
 }else if(Date.parse(existing.expires_at)<=Date.now()){
  const renew=await db.from("aerosuite_institution_invitations")
    .update({expires_at:new Date(Date.now()+7*86400000).toISOString()}).eq("id",inviteId);
  if(renew.error)return reply(origin,503,{error:"No se pudo renovar la invitación."});
 }
 // Supabase Auth verifica la titularidad del correo mediante un vínculo personal de un solo uso.
 // NO se envía un enlace público con solo institución y rol: eso exigiría un segundo correo de verificación.
 let generated=await db.auth.admin.generateLink({type:"magiclink",email});
 // Si la primera llamada abrió un usuario nuevo, el siguiente token es de acceso normal.
 if(!generated.error&&generated.data?.properties?.verification_type==="signup")
   generated=await db.auth.admin.generateLink({type:"magiclink",email});
 if(generated.error||!generated.data?.properties?.hashed_token)
  return reply(origin,503,{error:"No se pudo generar un enlace de verificación personal. Reintentá desde el panel."});
 // Para un correo sin usuario previo, GoTrue cambia generateLink(magiclink) a signup.
 // La verificación DEBE usar el tipo real retornado por Auth, no uno fijo.
 const tokenHash=generated.data.properties.hashed_token;
 const verificationType=String(generated.data.properties.verification_type||"");
 if(verificationType!=="magiclink")
   return reply(origin,503,{error:"El servicio de identidad devolvió un tipo de enlace no compatible. No se envió el correo."});
 const link="https://gentedevuelo.com/utilidades/gestion-aeronautica/ingreso-escuela.html?institucion="+encodeURIComponent(id)+
   "&rol="+encodeURIComponent(role)+"#token_hash="+encodeURIComponent(tokenHash)+"&type="+encodeURIComponent(verificationType);
 const subject="Invitación a AeroSuite · "+String(org.name).slice(0,80);
 const safeName=esc(String(org.name));
 const safeLabel=esc(roleLabels[role]);
 const html='<!doctype html><html lang="es"><body style="margin:0;padding:25px;background:#f1f5fa;font:15px Arial,sans-serif;color:#243347">'
 +'<div style="max-width:580px;margin:auto;background:#fff;border:1px solid #d8e3eb;border-radius:14px;overflow:hidden">'
 +'<div style="padding:28px;background:#152d47;color:#fff"><strong style="font-size:25px">AeroSuite</strong><div style="font-size:11px;letter-spacing:2px;color:#9bd2f1;margin-top:7px">BY GENTE DE VUELO</div></div>'
 +'<div style="padding:28px"><h1 style="font-size:23px;margin:0 0 15px">Invitación institucional</h1>'
 +'<p>Fuiste invitado para crear una cuenta en <strong>AeroSuite de Gente de Vuelo</strong> como <strong>'+safeLabel+'</strong> de <strong>'+safeName+'</strong>.</p>'
 +'<p>El botón confirma que sos el destinatario de esta invitación. Después podrás crear tu contraseña e ingresar directamente al portal sin un segundo correo ni volver a escribir usuario y clave.</p>'
 +'<p style="margin:26px 0"><a href="'+link+'" style="background:#255a85;color:#fff;text-decoration:none;padding:13px 20px;border-radius:9px;font-weight:700">Ingresar a AeroSuite</a></p>'
 +'<p>El enlace es personal, de un solo uso y de duración limitada. Si vence, solicitá una nueva invitación. El permiso institucional tiene una vigencia máxima de 7 días.</p>'
 +'<p style="font-size:12px;color:#637686">Nunca solicitaremos tu DNI como contraseña. No compartas claves ni códigos de acceso.</p>'
 +'</div><div style="padding:17px 28px;background:#edf3f9;color:#657787;font-size:12px">AeroSuite · By Gente de Vuelo</div></div></body></html>';
 const plain="Invitación institucional AeroSuite\n\nFuiste invitado para crear una cuenta en AeroSuite de Gente de Vuelo como "+roleLabels[role]+
   " de "+org.name+".\n\nIngresá directamente a AeroSuite: "+link+
   "\n\nEl enlace es personal y verifica tu correo en un paso. Desde AeroSuite podrás establecer la contraseña e ingresar sin un segundo correo."+
   "\n\nEl enlace es de un solo uso y puede vencer antes que la invitación institucional (7 días). Si vence, solicitá que te lo reenvíen. Nunca uses tu DNI como contraseña.";
 try{
  const remote=await fetch("https://api.resend.com/emails",{method:"POST",
   headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
   body:JSON.stringify({from:sender,to:[email],reply_to:"gentedevuelo@gmail.com",subject,html,text:plain})});
  const parsed=await remote.json().catch(()=>({}));
  if(!remote.ok||!parsed.id)return reply(origin,502,{error:"No se pudo enviar la invitación: "+String(parsed.message||"El proveedor rechazó el envío.").slice(0,160)});
  const marked=await db.from("aerosuite_institution_invitations")
    .update({last_sent_at:new Date().toISOString(),sent_count:Number(existing?.sent_count||0)+1})
    .eq("id",inviteId).is("accepted_at",null);
  if(marked.error)return reply(origin,503,{error:"El proveedor aceptó el correo, pero no pudo actualizarse el historial. Verificá recepción antes de reenviar."});
  return reply(origin,200,{ok:true,provider_accepted:true,recipient:email,role,
    message:"El proveedor aceptó el correo; la entrega en la casilla depende del servicio."});
 }catch(error){
  return reply(origin,502,{error:"Fallo de conexión con el servicio de correo. Podés reintentar desde el panel."});
 }
});