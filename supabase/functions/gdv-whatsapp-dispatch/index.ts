import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const origins=new Set(["https://gentedevuelo.com","https://www.gentedevuelo.com","https://gentedevuelo.vercel.app"]);
const cors=(origin:string|null)=>({
 "Access-Control-Allow-Origin":origin&&origins.has(origin)?origin:"https://gentedevuelo.com",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store","Vary":"Origin"
});
const reply=(origin:string|null,code:number,body:unknown)=>new Response(JSON.stringify(body),{
 status:code,headers:{...cors(origin),"Content-Type":"application/json"}
});
Deno.serve(async req=>{
 const origin=req.headers.get("origin"),headers=cors(origin);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply(origin,405,{error:"Método no permitido"});
 if(origin&&!origins.has(origin))return reply(origin,403,{error:"Origen no permitido"});
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return reply(origin,401,{error:"Ingresá con tu cuenta administradora"});
 const base=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",sr=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!base||!anon||!sr)return reply(origin,503,{error:"Supabase no está configurado"});
 const identity=createClient(base,anon,{auth:{persistSession:false}});
 const {data:{user},error}=await identity.auth.getUser(token);
 if(error||!user)return reply(origin,401,{error:"La sesión venció"});
 const privileged=createClient(base,sr,{auth:{persistSession:false}});
 const admin=await privileged.from("site_admins").select("user_id").eq("user_id",user.id).maybeSingle();
 if(admin.error||!admin.data)return reply(origin,403,{error:"Solo la administración puede gestionar avisos"});
 let arg:any;
 try{arg=await req.json()}catch{return reply(origin,400,{error:"Solicitud inválida"})}
 if(!["status","process"].includes(arg?.mode))return reply(origin,400,{error:"Modo inválido"});
 const phoneId=Deno.env.get("META_WA_PHONE_NUMBER_ID")||"";
 const accessToken=Deno.env.get("META_WA_ACCESS_TOKEN")||"";
 const recipient=(Deno.env.get("META_WA_RECIPIENT")||"").replace(/\D/g,"");
 const templateName=Deno.env.get("META_WA_TEMPLATE_NAME")||"gdv_moderacion";
 const missing:string[]=[];
 if(!/^\d{8,25}$/.test(phoneId))missing.push("META_WA_PHONE_NUMBER_ID");
 if(!accessToken)missing.push("META_WA_ACCESS_TOKEN");
 if(!/^\d{10,16}$/.test(recipient))missing.push("META_WA_RECIPIENT");
 const counts=await privileged.from("gdv_whatsapp_moderation_queue").select("status");
 const statuses=counts.error?{}:counts.data.reduce((acc:Record<string,number>,row:any)=>(acc[row.status]=(acc[row.status]||0)+1,acc),{});
 if(arg.mode==="status")return reply(origin,200,{ready:missing.length===0,missing,templateName,counts:statuses});
 if(missing.length)return reply(origin,503,{error:"Falta configurar Meta: "+missing.join(", ")});
 const count=Math.min(5,Math.max(1,Number.isInteger(arg.limit)?arg.limit:1));
 const completed=[];
 const errors=[];
 for(let i=0;i<count;i++){
  const claim=await privileged.rpc("gdv_wa_claim_send",{p_limit:1});
  if(claim.error){errors.push("No se pudo consultar la cola");break}
  const item=Array.isArray(claim.data)?claim.data[0]:null;
  if(!item)break;
  const params=[item.alert_section,item.alert_title,item.alert_author,item.alert_url]
    .map(v=>({type:"text",text:String(v||"Sin información").slice(0,200)}));
  const payload={messaging_product:"whatsapp",to:recipient,type:"template",
    template:{name:templateName,language:{code:"es_AR"},components:[{type:"body",parameters:params}]}};
  let success=false,messageId="",errorText="";
  try{
   const result=await fetch("https://graph.facebook.com/v24.0/"+phoneId+"/messages",{
    method:"POST",headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},body:JSON.stringify(payload)
   });
   const data=await result.json().catch(()=>({}));
   if(result.ok&&data.messages?.[0]?.id){success=true;messageId=String(data.messages[0].id);}
   else errorText=String(data.error?.message||"Meta rechazó el mensaje").slice(0,220);
  }catch(e){errorText="Error de conexión con Meta; no se reintentará automáticamente";}
  const finish=await privileged.rpc("gdv_wa_finish_send",{
   p_id:item.alert_id,p_sent:success,p_provider_id:success?messageId:null,p_error:success?null:errorText
  });
  if(finish.error||finish.data!==true){errors.push("El proveedor respondió pero no se confirmó el registro; intervención manual requerida");break}
  if(success)completed.push({section:item.alert_section,accepted:true});
  else{errors.push(errorText);break}
 }
 return reply(origin,200,{
  accepted:completed.length,completed,errors,
  note:"Aceptado por Meta no garantiza la entrega al teléfono."
 });
});
