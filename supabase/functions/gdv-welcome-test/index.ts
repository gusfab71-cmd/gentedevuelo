import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const ORIGINS = new Set(["https://gentedevuelo.com", "https://www.gentedevuelo.com", "https://gentedevuelo.vercel.app"]);
const TEST_EMAIL = "gentedevuelo@gmail.com";
const SENDER = "Gente de Vuelo <hola@gentedevuelo.com>";
function headers(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://gentedevuelo.com",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}
function json(data: unknown, status: number, h: Record<string,string>) {
  return new Response(JSON.stringify(data), {status, headers:{...h,"Content-Type":"application/json"}});
}

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

Deno.serve(async (req: Request) => {
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return json({error:"Método no permitido"},405,h);
  if(req.headers.get("origin") && !ORIGINS.has(req.headers.get("origin")!))return json({error:"Origen no permitido"},403,h);
  const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return json({error:"Iniciá sesión con la cuenta administradora"},401,h);
  const url=Deno.env.get("SUPABASE_URL");
  const anon=Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anon||!serviceRole)return json({error:"Supabase no está configurado"},503,h);
  const auth=createClient(url,anon,{auth:{persistSession:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user)return json({error:"Sesión inválida"},401,h);
  const admin=createClient(url,serviceRole,{auth:{persistSession:false}});
  const {data:role,error:roleError}=await admin.from("site_admins").select("user_id").eq("user_id",user.id).maybeSingle();
  if(roleError||!role)return json({error:"Solo la administración puede enviar correos de prueba"},403,h);
  const apiKey=Deno.env.get("RESEND_API_KEY");
  if(!apiKey)return json({error:"Falta configurar RESEND_API_KEY en Supabase"},503,h);
  const {html,text:textBody}=gdvEmailTemplate("welcome","[PRUEBA] ¡Bienvenido a Gente de Vuelo!","");
  let providerResponse: Response;
  try{
    providerResponse=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        from:SENDER,
        to:[TEST_EMAIL],
        reply_to:"gentedevuelo@gmail.com",
        subject:"[PRUEBA] ¡Bienvenido a Gente de Vuelo!",
        html,
        text:textBody
      })
    });
  }catch(e){
    console.error("Fallo al contactar el servicio de correo",e instanceof Error?e.message:"Error");
    return json({error:"No se pudo contactar a Resend. Probá nuevamente más tarde."},502,h);
  }
  if(!providerResponse.ok){
    let msg="Resend rechazó el envío";
    try { const err=await providerResponse.json(); msg=typeof err.message==="string"?err.message:msg; }catch{}
    console.error("Error Resend:",providerResponse.status,msg);
    return json({error:"Resend no pudo procesar el mensaje: "+msg},502,h);
  }
  const result=await providerResponse.json().catch(()=>({}));
  return json({ok:true,to:TEST_EMAIL,providerId:result?.id??null},200,h);
});
