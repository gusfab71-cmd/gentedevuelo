import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.0";

/**
 * PREPARADO, NO DESPLEGADO: correo de eventos institucionales AeroSuite.
 * Debe habilitarse explícitamente con secretos, consentimiento del destinatario
 * e interruptor institucional. Nunca utiliza la cola de correo comunitario GDV.
 * No tiene Cron ni activación en el frontend.
 */
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const env=(name:string)=>Deno.env.get(name)||"";
const same=(a:string,b:string)=>{
 if(!a||!b||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
};
const esc=(s:unknown)=>String(s||"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]||c));
type OutboxItem={
 id:string;institution_id:string;notification_id:string;recipient_id:string;attempts:number
};
const ALLOWED_ORIGIN="https://gentedevuelo.com";
Deno.serve(async req=>{
 if(req.method!=="POST")return json({error:"Método no permitido"},405);
 // Nunca devolver secretos o correos en los errores.
 const key=env("AEROSUITE_EXTERNAL_WORKER_SECRET");
 const bearer=(req.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1]||"";
 if(key.length<48||!same(bearer,key))return json({error:"No autorizado"},401);
 const url=env("SUPABASE_URL"),role=env("SUPABASE_SERVICE_ROLE_KEY"),
  sender=env("AEROSUITE_EMAIL_SENDER"),providerKey=env("RESEND_API_KEY");
 if(!url||!role)return json({error:"Backend no configurado"},503);
 let input:{mode?:string;limit?:number}={};
 try{input=await req.json()}catch{return json({error:"Solicitud inválida"},400)}
 if(input.mode==="status"){
  return json({available:env("AEROSUITE_EXTERNAL_SEND_ENABLED")==="true",
   provider_ready:Boolean(providerKey&&sender),
   note:"Este control no envía mensajes. La habilitación requiere consentimiento por destinatario e institución."});
 }
 if(input.mode!=="send")return json({error:"Modo inválido"},400);
 if(env("AEROSUITE_EXTERNAL_SEND_ENABLED")!=="true")return json({error:"Envíos deshabilitados"},503);
 if(!providerKey||!sender)return json({error:"Proveedor no configurado"},503);

 const db=createClient(url,role,{auth:{persistSession:false,autoRefreshToken:false}});
 const n=Math.max(1,Math.min(Number.isInteger(input.limit)?Number(input.limit):3,5));
 const rows=await db.from("aerosuite_external_email_outbox")
  .select("id,institution_id,notification_id,recipient_id,attempts")
  .eq("state","pending").order("created_at",{ascending:true}).limit(n);
 if(rows.error)return json({error:"No se pudo leer la cola"},503);
 const tally={processed:0,sent:0,cancelled:0,manual_review:0};
 for(const candidate of (rows.data||[]) as OutboxItem[]){
  const claimed=await db.from("aerosuite_external_email_outbox").update({
   state:"claimed",attempts:(candidate.attempts||0)+1,claim_until:new Date(Date.now()+300000).toISOString(),
   changed_at:new Date().toISOString()
  }).eq("id",candidate.id).eq("state","pending")
   .select("id,institution_id,notification_id,recipient_id").maybeSingle();
  if(claimed.error||!claimed.data)continue;
  const item=claimed.data;tally.processed++;
  const finish=async(state:"sent"|"cancelled"|"manual_review",note:string,providerId:string|null=null)=>{
   const r=await db.from("aerosuite_external_email_outbox")
    .update({state,last_error:note.slice(0,150),provider_id:providerId,claim_until:null,changed_at:new Date().toISOString()})
    .eq("id",item.id).eq("state","claimed").select("id");
   if(r.error||!r.data?.length)throw Error("No se guardó resultado del aviso");
   if(state==="sent")tally.sent++;
   else if(state==="cancelled")tally.cancelled++;
   else tally.manual_review++;
  };
  try{
   // Revalidar en el instante del envío: escuela real, permiso de correo,
   // consentimiento actualizado, membresía, notificación asociada y correo verificado.
   const [settings,pref,school,member,notification,account]=await Promise.all([
    db.from("aerosuite_external_delivery_settings").select("email_enabled")
      .eq("institution_id",item.institution_id).maybeSingle(),
    db.from("aerosuite_external_delivery_preferences").select("email_opt_in")
      .eq("institution_id",item.institution_id).eq("user_id",item.recipient_id).maybeSingle(),
    db.from("aerosuite_institutions").select("is_test").eq("id",item.institution_id).maybeSingle(),
    db.from("aerosuite_institution_members").select("user_id").eq("institution_id",item.institution_id)
      .eq("user_id",item.recipient_id).limit(1),
    db.from("aerosuite_notification_inbox").select("title,detail")
      .eq("id",item.notification_id).eq("institution_id",item.institution_id)
      .eq("recipient_id",item.recipient_id).maybeSingle(),
    db.auth.admin.getUserById(item.recipient_id)
   ]);
   const user=account.data?.user,email=user?.email||"";
   const allow=settings.data?.email_enabled===true&&pref.data?.email_opt_in===true&&
    school.data?.is_test===false&&Boolean(member.data?.length)&&Boolean(notification.data)&&
    Boolean(user?.email_confirmed_at)&&Boolean(email);
   if(!allow){
    await finish("cancelled","Destinatario o configuración no autorizado");
    continue;
   }
   const title=String(notification.data!.title||"Aviso de AeroSuite").slice(0,120);
   const detail=String(notification.data!.detail||"Consultá el portal institucional.").slice(0,320);
   const body=[
     "Aviso institucional de AeroSuite",title,detail,
     "Accedé a tu escuela con tu cuenta: https://gentedevuelo.com/utilidades/gestion-aeronautica/portal-escuela.html",
     "Podés retirar el consentimiento de correo desde la sección Avisos internos del portal."
   ].join("\n\n");
   const html="<div style=\"font:15px/1.5 Arial,sans-serif;color:#142a39\">"+
    "<h2>"+esc(title)+"</h2><p>"+esc(detail)+"</p>"+
    "<p>Ingresá al <a href=\"https://gentedevuelo.com/utilidades/gestion-aeronautica/portal-escuela.html\">portal de tu escuela</a>.</p>"+
    "<p>Podés retirar tu consentimiento desde Avisos internos.</p></div>";
   const response=await fetch("https://api.resend.com/emails",{
    method:"POST",headers:{"Authorization":"Bearer "+providerKey,
     "Content-Type":"application/json","Idempotency-Key":"aerosuite:"+item.id},
    body:JSON.stringify({from:sender,to:[email],subject:title,html,text:body})
   });
   const data=await response.json().catch(()=>({}));
   if(response.ok&&data?.id){
    await finish("sent","",String(data.id).slice(0,120));
   }else{
    // Sin reintentos automáticos ante errores ambiguos: evitar doble correo
    // fuera de la ventana de idempotencia del proveedor.
    await finish("manual_review","Resend status "+response.status);
   }
  }catch{
   try{await finish("manual_review","Fallo de red o persistencia; revisar antes de reintentar")}catch{
    // El registro queda claimed; requiere conciliación manual, nunca reenvío automático.
   }
  }
 }
 return json({...tally,note:"Sin reintentos automáticos; se requiere supervisión del canal."});
});
