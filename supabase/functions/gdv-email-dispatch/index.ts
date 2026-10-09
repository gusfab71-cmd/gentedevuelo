import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const origins=new Set(["https://gentedevuelo.com","https://www.gentedevuelo.com","https://gentedevuelo.vercel.app"]);
const cors=(o:string|null)=>({"Access-Control-Allow-Origin":o&&origins.has(o)?o:"https://gentedevuelo.com","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Cache-Control":"no-store","Vary":"Origin"});
const reply=(o:string|null,status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{...cors(o),"Content-Type":"application/json"}});
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
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
   const preferences="https://gentedevuelo.com/comunidad.html#preferencias-correo";
   const title=String(item.subject).slice(0,120);
   const body=String(item.body).slice(0,1600);
   const paragraphs=body.split(/\n+/).filter(Boolean).map(t=>"<p>"+esc(t)+"</p>").join("");
   const html='<div style="max-width:610px;margin:auto;font-family:Arial,sans-serif;color:#222b35;line-height:1.6"><h1 style="color:#bb7134">Gente de Vuelo</h1><h2>'+esc(title)+'</h2>'+paragraphs+
    '<p><a href="https://gentedevuelo.com/comunidad.html#foro">Visitar la comunidad</a></p>'+
    (isAnnouncement?'<hr><p style="font-size:12px;color:#777">Recibiste este mensaje porque activaste los comunicados por correo. <a href="'+preferences+'">Cambiar preferencias</a>.</p>':'<p style="font-size:12px;color:#777">Mensaje de bienvenida por tu incorporación a Gente de Vuelo.</p>')+'</div>';
   const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({from:sender,to:[email],reply_to:"gentedevuelo@gmail.com",subject:title,html,
      text:body+(isAnnouncement?"\n\nGestionar preferencias: "+preferences:""),
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
