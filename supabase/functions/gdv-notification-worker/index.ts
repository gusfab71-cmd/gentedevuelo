import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const escape=(str:string)=>str.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));

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

Deno.serve(async request=>{
 if(request.method!=="POST")return new Response("Método no permitido",{status:405});
 const bearer=request.headers.get("x-gdv-worker-token")||"";
 if(bearer.length<60||bearer.length>256)return new Response("No autorizado",{status:401});
 const url=Deno.env.get("SUPABASE_URL")||"",secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!secret)return new Response("No disponible",{status:503});
 const db=createClient(url,secret,{auth:{persistSession:false}});
 const check=await db.rpc("gdv_worker_authorize",{p_secret:bearer});
 if(check.error||!check.data?.valid)return new Response("No autorizado",{status:403});
 const summary={whatsappAccepted:0,emailAccepted:0,moderationAccepted:0,moderationSkipped:0,errors:[] as string[]};
 const waPhone=Deno.env.get("META_WA_PHONE_NUMBER_ID")||"";
 const waToken=Deno.env.get("META_WA_ACCESS_TOKEN")||"";
 const waRecipient=(Deno.env.get("META_WA_RECIPIENT")||"").replace(/\D/g,"");
 if(check.data.whatsapp && /^\d{8,25}$/.test(waPhone)&&waToken&&/^\d{10,16}$/.test(waRecipient)){
  const since=new Date(Date.now()-86400000).toISOString();
  const recent=await db.from("gdv_whatsapp_moderation_queue").select("id",{count:"exact",head:true}).eq("status","sent").gte("sent_at",since);
  if((recent.count||0)<25){
   for(let i=0;i<3;i++){
    const claimed=await db.rpc("gdv_wa_claim_send",{p_limit:1});
    const item=claimed.data?.[0];
    if(claimed.error||!item)break;
    const params=[item.alert_section,item.alert_title,item.alert_author,item.alert_url]
      .map(x=>({type:"text",text:String(x||"Sin información").slice(0,200)}));
    const payload={messaging_product:"whatsapp",to:waRecipient,type:"template",
      template:{name:Deno.env.get("META_WA_TEMPLATE_NAME")||"gdv_moderacion",language:{code:"es_AR"},components:[{type:"body",parameters:params}]}};
    let success=false,providerId="",errorText="";
    try{
      const response=await fetch("https://graph.facebook.com/v24.0/"+waPhone+"/messages",{method:"POST",
        headers:{Authorization:"Bearer "+waToken,"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data.messages?.[0]?.id){success=true;providerId=String(data.messages[0].id);}
      else errorText="Meta rechazó la notificación: "+String(data.error?.code||response.status);
    }catch{errorText="Falla de conexión al enviar a Meta";}
    const done=await db.rpc("gdv_wa_finish_send",{p_id:item.alert_id,p_sent:success,p_provider_id:providerId||null,p_error:errorText||null});
    if(done.error||done.data!==true){summary.errors.push("No se pudo registrar estado WhatsApp");break}
    if(success)summary.whatsappAccepted++;else{summary.errors.push(errorText);break}
   }
  }
 }
 const resendKey=Deno.env.get("RESEND_API_KEY")||"";
 if(check.data.email&&resendKey){
  const claimed=await db.rpc("gdv_email_claim_send",{p_limit:8});
  if(claimed.error)summary.errors.push("Fallo al leer cola de correo");
  else for(const item of claimed.data||[]){
    let accepted=false,providerId="",failure="";
    try{
      const u=await db.auth.admin.getUserById(item.user_id);
      const account=u.data?.user,email=account?.email||"";
      const consent=item.kind==="announcement"
        ? await db.from("gdv_email_preferences").select("news_opt_in").eq("user_id",item.user_id).maybeSingle()
        :null;
      if(!email||!account?.email_confirmed_at||(item.kind==="announcement"&&(!consent?.data?.news_opt_in||consent.error))){
       const skip=await db.from("gdv_email_outbox").update({status:"skipped",last_error:"Correo sin confirmar o sin consentimiento"}).eq("id",item.id).eq("status","sending").select("id");
       if(skip.error)summary.errors.push("No se pudo descartar un correo");
       continue;
      }
      const subj=String(item.subject).slice(0,120),body=String(item.body).slice(0,1600);
      const {html,text:mailText}=gdvEmailTemplate(item.kind,subj,body);
      const response=await fetch("https://api.resend.com/emails",{method:"POST",
        headers:{Authorization:"Bearer "+resendKey,"Content-Type":"application/json"},
        body:JSON.stringify({from:Deno.env.get("GDV_MAIL_SENDER")||"Gente de Vuelo <hola@gentedevuelo.com>",
         to:[email],reply_to:"gentedevuelo@gmail.com",subject:subj,html,
         text:mailText})});
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data?.id){accepted=true;providerId=String(data.id);}
      else failure="Resend rechazó correo: "+String(data?.name||response.status);
    }catch{failure="Error de conexión con correo"}
    const done=await db.rpc("gdv_email_finish",{p_id:item.id,p_sent:accepted,p_error:failure||null,p_provider_id:providerId||null});
    if(done.error||done.data!==true){summary.errors.push("No se pudo registrar estado de correo");break}
    if(accepted)summary.emailAccepted++;else{summary.errors.push(failure);break}
   }
 }

 // Canal privado independiente: únicamente moderación para la cuenta administradora.
 // No habilita bienvenidas ni comunicados generales.
 if(check.data.moderationEmail){
  if(!resendKey){
   summary.errors.push("Falta configurar RESEND_API_KEY");
  }else{
   // Límite protector de 20 avisos por hora; los restantes esperan el próximo ciclo.
   const hour=new Date(Date.now()-3600000).toISOString();
   const {count:sentCount,error:countError}=await db.from("gdv_email_outbox")
    .select("id",{count:"exact",head:true}).eq("kind","moderation").eq("status","sent").gte("sent_at",hour);
   if(countError){
    summary.errors.push("No se pudo comprobar el límite de moderación");
   }else if((sentCount||0)>=20){
    // Se difieren los correos restantes, sin perder la cola.
   }else{
    const claim=await db.rpc("gdv_email_claim_moderation",{p_limit:Math.min(5,Math.max(0,20-(sentCount||0)))});
    if(claim.error){
     summary.errors.push("No se pudo tomar la cola de moderación");
    }else for(const item of claim.data||[]){
     let delivered=false,providerId="",failure="";
     try{
      const accountResult=await db.auth.admin.getUserById(item.user_id);
      const account=accountResult.data?.user;
      const email=account?.email||"";
      if(!account?.email_confirmed_at||!email||account?.deleted_at){
       const skip=await db.from("gdv_email_outbox")
        .update({status:"skipped",last_error:"Cuenta administradora sin correo activo"})
        .eq("id",item.id).eq("status","sending").select("id");
       if(skip.error||!skip.data?.length)summary.errors.push("No se pudo descartar un correo inválido");
       summary.moderationSkipped++;
       continue;
      }
      const subject=String(item.subject).slice(0,120);
      const body=String(item.body).slice(0,1700);
      const moderationUrl=item.source_table==="gdv_topics"||item.source_table==="gdv_comments"
       ?"https://gentedevuelo.com/comunidad.html#moderacion"
       :"https://gentedevuelo.com/moderacion.html";
      const {html,text:mailText}=gdvEmailTemplate("moderation",subject,body,moderationUrl);
      const response=await fetch("https://api.resend.com/emails",{
       method:"POST",headers:{Authorization:"Bearer "+resendKey,"Content-Type":"application/json"},
       body:JSON.stringify({from:Deno.env.get("GDV_MAIL_SENDER")||"Gente de Vuelo <hola@gentedevuelo.com>",
        to:[email],reply_to:"gentedevuelo@gmail.com",subject,html,text:mailText})
      });
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data?.id){delivered=true;providerId=String(data.id);}
      else failure="Resend no aceptó el aviso: "+String(data?.name||response.status).slice(0,90);
     }catch{failure="No se pudo confirmar el envío; requiere revisión manual";}
     const finish=await db.rpc("gdv_email_finish",{p_id:item.id,p_sent:delivered,p_error:failure||null,p_provider_id:providerId||null});
     if(finish.error||finish.data!==true){
      summary.errors.push("No se pudo guardar el estado de moderación: intervención manual");
      break;
     }
     if(delivered)summary.moderationAccepted++;
     else{summary.errors.push(failure);break}
    }
   }
  }
 }

 return new Response(JSON.stringify(summary),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
});
