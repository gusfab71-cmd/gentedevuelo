import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const escape=(str:string)=>str.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
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
      const prefs="https://gentedevuelo.com/comunidad.html#preferencias-correo";
      const html='<div style="font-family:Arial,sans-serif;line-height:1.65;color:#222b35;max-width:600px;margin:auto"><h1 style="color:#b87738">Gente de Vuelo</h1><h2>'+escape(subj)+'</h2>'+body.split(/\n+/).filter(Boolean).map(s=>'<p>'+escape(s)+'</p>').join('')+
       '<p><a href="https://gentedevuelo.com/comunidad.html#foro">Ir a Gente de Vuelo</a></p>'+
       (item.kind==="announcement"?'<p style="font-size:12px">Recibiste este comunicado porque te suscribiste. <a href="'+prefs+'">Dejar de recibir correos</a>.</p>':'')+'</div>';
      const response=await fetch("https://api.resend.com/emails",{method:"POST",
        headers:{Authorization:"Bearer "+resendKey,"Content-Type":"application/json"},
        body:JSON.stringify({from:Deno.env.get("GDV_MAIL_SENDER")||"Gente de Vuelo <hola@gentedevuelo.com>",
         to:[email],reply_to:"gentedevuelo@gmail.com",subject:subj,html,
         text:body+(item.kind==="announcement"?"\n\nPreferencias: "+prefs:"")})});
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
      const html='<div style="max-width:600px;margin:auto;font-family:Arial,sans-serif;color:#202832;line-height:1.65;background:#f8f9fb;padding:22px;border-radius:12px">'
       +'<h1 style="color:#a96a34">Gente de Vuelo</h1><h2>'+escape(subject)+'</h2>'
       +body.split(/\\n+/).filter(Boolean).map((part:string)=>'<p>'+escape(part)+'</p>').join('')
       +'<p><a style="display:inline-block;background:#f28c45;color:#1c2228;padding:12px 18px;border-radius:8px;font-weight:bold;text-decoration:none" href="'+moderationUrl+'">Revisar moderación</a></p>'
       +'<p style="font-size:12px;color:#747b84">Aviso privado de administración. No es un comunicado a los integrantes.</p></div>';
      const response=await fetch("https://api.resend.com/emails",{
       method:"POST",headers:{Authorization:"Bearer "+resendKey,"Content-Type":"application/json"},
       body:JSON.stringify({from:Deno.env.get("GDV_MAIL_SENDER")||"Gente de Vuelo <hola@gentedevuelo.com>",
        to:[email],reply_to:"gentedevuelo@gmail.com",subject,html,text:body})
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
