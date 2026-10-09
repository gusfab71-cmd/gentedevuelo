import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const origins=new Set(["https://gentedevuelo.com","https://www.gentedevuelo.com","https://gentedevuelo.vercel.app"]);
const cors=(o:string|null)=>({"Access-Control-Allow-Origin":o&&origins.has(o)?o:"https://gentedevuelo.com","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Cache-Control":"no-store","Vary":"Origin"});
const reply=(o:string|null,status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{...cors(o),"Content-Type":"application/json"}});
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));

// Plantillas institucionales de Gente de Vuelo.
// Diseño apto para correo, contenido escapado y enlaces oficiales.
const GDV_HOME="https://gentedevuelo.com";
const GDV_FORUM=GDV_HOME+"/comunidad.html#foro";
const GDV_PREFERENCES=GDV_HOME+"/comunidad.html#preferencias-correo";
const GDV_LOGO="https://gentedevuelo.com/logo%20circular%20recortado%20gente%20de%20vuelo.png";
const gdvEscape=(s:string)=>String(s||"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));
const GDV_WELCOME_TEXT=[
 "¡Bienvenido a bordo!",
 "Nos alegra darte la bienvenida a Gente de Vuelo, una comunidad creada para quienes compartimos la pasión por la aviación.",
 "Este espacio está pensado para pilotos, estudiantes, instructores, aeromodelistas y todos aquellos que encuentran en el vuelo algo verdaderamente especial.",
 "¿Qué podés encontrar en nuestra comunidad?",
 "• Participar en el Foro y sus distintas temáticas aeronáuticas.",
 "• Crear tu propio espacio en Mi Hangar.",
 "• Compartir fotografías, experiencias y travesías.",
 "• Conocer novedades, eventos y actividades aeronáuticas.",
 "• Intercambiar conocimientos con otros integrantes.",
 "Te invitamos a completar tu perfil, conocer nuestras normas y comenzar a participar.",
 "Gracias por acompañarnos en este proyecto.",
 "Administración de Gente de Vuelo"
].join("\n\n");
function gdvEmailTemplate(kind:string,subject:string,body:string,moderationLink?:string){
 const welcome=kind==="welcome",moderation=kind==="moderation",announcement=kind==="announcement";
 const safeSubject=gdvEscape(subject.slice(0,120));
 const heading=welcome?"¡Bienvenido a bordo!":moderation?"Nueva solicitud de moderación":subject;
 const eyebrow=welcome?"BIENVENIDA A LA COMUNIDAD":moderation?"AVISO PRIVADO DE ADMINISTRACIÓN":"COMUNICADO A LA COMUNIDAD";
 const actionUrl=moderation?(moderationLink||GDV_HOME+"/comunidad.html#moderacion"):GDV_FORUM;
 const actionLabel=welcome?"INGRESAR A GENTE DE VUELO":moderation?"REVISAR MODERACIÓN":"VISITAR GENTE DE VUELO";
 const content=welcome?GDV_WELCOME_TEXT.replace(/^¡Bienvenido a bordo!\n\n/,""):body;
 const paragraphs=content.split(/\n+/).map(s=>s.trim()).filter(Boolean).map(s=>'<p style="margin:0 0 15px;font:15px/1.65 Arial,Helvetica,sans-serif;color:#333c47">'+gdvEscape(s)+'</p>').join("");
 const footerNote=moderation
  ?"Aviso automático exclusivo de la administración. Las aprobaciones se realizan únicamente desde el panel."
  :announcement
  ?"Recibiste este comunicado porque activaste voluntariamente la suscripción a novedades por correo electrónico."
  :"Gracias por formar parte de nuestra comunidad aeronáutica.";
 const preferencesLink=announcement?'<p style="margin:9px 0 0;font:12px/1.5 Arial,sans-serif"><a style="color:#b9763b;text-decoration:underline" href="'+GDV_PREFERENCES+'">Modificar o cancelar la suscripción</a></p>':"";
 const html='<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>'
  +'<body style="margin:0;padding:0;background:#f6f4f0;color:#293039">'
  +'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f4f0"><tr><td align="center" style="padding:24px 12px">'
  +'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:#ffffff;border:1px solid #e4e0da;border-radius:13px;overflow:hidden">'
  +'<tr><td align="center" style="background:#292d32;padding:27px 20px 22px">'
  +'<img alt="Logo de Gente de Vuelo" src="'+GDV_LOGO+'" width="92" height="92" style="width:92px;height:92px;object-fit:contain;border:0;display:block;margin:0 auto 13px">'
  +'<div style="font:700 22px/1.3 Arial,Helvetica,sans-serif;letter-spacing:.5px;color:#f3cb8e">GENTE DE VUELO</div>'
  +'<div style="font:11px/1.5 Arial,sans-serif;letter-spacing:2px;color:#e6a970;margin-top:8px">'+eyebrow+'</div></td></tr>'
  +'<tr><td style="padding:28px 28px 18px">'
  +'<h1 style="margin:0 0 21px;font:700 25px/1.35 Arial,sans-serif;color:#3a3b3d">'+gdvEscape(heading)+'</h1>'
  +paragraphs
  +'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 15px"><tr><td bgcolor="#d08a43" style="background:#d08a43;border-radius:8px;padding:14px 19px">'
  +'<a href="'+actionUrl+'" style="display:inline-block;font:700 13px/1.3 Arial,sans-serif;text-decoration:none;letter-spacing:.2px;color:#20252b">'+actionLabel+'</a>'
  +'</td></tr></table></td></tr>'
  +'<tr><td style="padding:21px 28px 26px;border-top:1px solid #e9e5e0;background:#faf8f5">'
  +'<p style="margin:0;font:12px/1.6 Arial,sans-serif;color:#656668">'+gdvEscape(footerNote)+'</p>'
  +preferencesLink
  +'<p style="margin:16px 0 0;font:italic 12px/1.5 Arial,sans-serif;color:#9b6b3f">Una comunidad unida por la pasión de volar.</p>'
  +'<p style="margin:5px 0 0;font:12px/1.5 Arial,sans-serif"><a style="color:#805d41" href="'+GDV_HOME+'">gentedevuelo.com</a></p>'
  +'</td></tr></table></td></tr></table></body></html>';
 const textContent=(welcome?GDV_WELCOME_TEXT:((moderation?heading+"\n\n":"")+body))
  +"\n\n"+actionLabel+": "+actionUrl
  +"\n\n"+footerNote
  +(announcement?"\nGestionar preferencias: "+GDV_PREFERENCES:"")
  +"\n\nGente de Vuelo — Una comunidad unida por la pasión de volar.";
 return {html,text:textContent,subject:safeSubject};
}

Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=="POST")return reply(origin,405,{error:"Método no permitido"});
 if(origin&&!origins.has(origin))return reply(origin,403,{error:"Origen no permitido"});
 const jwt=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!jwt)return reply(origin,401,{error:"Ingresá como administrador"});
 const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_ANON_KEY")||"",role=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!key||!role)return reply(origin,503,{error:"Servicio sin configurar"});
 const client=createClient(url,key,{auth:{persistSession:false}});
 const {data:{user},error}=await client.auth.getUser(jwt);
 if(error||!user)return reply(origin,401,{error:"Sesión no válida"});
 const adminDb=createClient(url,role,{auth:{persistSession:false}});
 const admin=await adminDb.from("site_admins").select("user_id").eq("user_id",user.id).maybeSingle();
 if(admin.error||!admin.data)return reply(origin,403,{error:"Solo administración"});
 let args:any;
 try{args=await req.json()}catch{return reply(origin,400,{error:"Solicitud inválida"})}
 if(!["status","process"].includes(args.mode))return reply(origin,400,{error:"Modo inválido"});
 const apiKey=Deno.env.get("RESEND_API_KEY")||"";
 const sender=Deno.env.get("GDV_MAIL_SENDER")||"Gente de Vuelo <hola@gentedevuelo.com>";
 const configured=Boolean(apiKey);
 if(args.mode==="status")return reply(origin,200,{ready:configured,sender:sender,missing:configured?[]:["RESEND_API_KEY"]});
 if(!configured)return reply(origin,503,{error:"Falta configurar RESEND_API_KEY en Supabase"});
 const limit=Math.max(1,Math.min(10,Number.isInteger(args.limit)?args.limit:5));
 const result={accepted:0,skipped:0,errors:[] as string[]};
 const claim=await adminDb.rpc("gdv_email_claim_send",{p_limit:limit});
 if(claim.error)return reply(origin,503,{error:"No se pudo iniciar el lote de correos"});
 for(const item of claim.data||[]){
  let delivered=false,providerId="",reason="";
  try{
   const userResult=await adminDb.auth.admin.getUserById(item.user_id);
   const record=userResult.data?.user;
   const confirmed=Boolean(record?.email_confirmed_at),email=record?.email||"";
   const unsubscribed=item.kind==="announcement" ? !(await adminDb.from("gdv_email_preferences").select("news_opt_in").eq("user_id",item.user_id).maybeSingle()).data?.news_opt_in : false;
   if(!confirmed||!email||unsubscribed){
    const skipped=await adminDb.from("gdv_email_outbox").update({status:"skipped",last_error:unsubscribed?"No suscripto":"Sin correo confirmado"}).eq("id",item.id).eq("status","sending").select("id");
    if(skipped.error||!skipped.data?.length)throw new Error("No pudo completarse el descarte");
    result.skipped++;continue;
   }
   const isAnnouncement=item.kind==="announcement";
   const title=String(item.subject).slice(0,120);
   const body=String(item.body).slice(0,1600);
   const {html,text:mailText}=gdvEmailTemplate(item.kind,title,body);
   const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({from:sender,to:[email],reply_to:"gentedevuelo@gmail.com",subject:title,html,
      text:mailText,
      ...(isAnnouncement?{headers:{"List-Unsubscribe":"<"+preferences+">"}}:{})})});
   const data=await response.json().catch(()=>({}));
   if(response.ok&&data?.id){delivered=true;providerId=String(data.id);}
   else reason=String(data?.message||"Resend rechazó el correo").slice(0,210);
  }catch(e){reason=e instanceof Error?e.message:"Error de envío";}
  const done=await adminDb.rpc("gdv_email_finish",{p_id:item.id,p_sent:delivered,p_error:reason||null,p_provider_id:providerId||null});
  if(done.error||done.data!==true){result.errors.push("No se confirmó un envío; revisar antes de reintentar");break}
  if(delivered)result.accepted++;else result.errors.push(reason);
 }
 return reply(origin,200,{...result,note:"Resend aceptó los mensajes indicados; la entrega final depende del proveedor."});
});
