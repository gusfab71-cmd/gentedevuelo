import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const allow = new Set(["https://gentedevuelo.com", "https://www.gentedevuelo.com", "https://gentedevuelo.vercel.app"]);
function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin":origin && allow.has(origin)?origin:"https://gentedevuelo.com",
    "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods":"OPTIONS,POST",
    "Cache-Control":"no-store",
    "Vary":"Origin"
  };
}
function respond(body: unknown,status: number,headers: Record<string,string>) {
  return new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json"}});
}
Deno.serve(async req=>{
  const origin=req.headers.get("origin");
  const h=cors(origin);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return respond({error:"Método no permitido"},405,h);
  if(origin && !allow.has(origin))return respond({error:"Origen no permitido"},403,h);
  const bearer=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!bearer)return respond({error:"Iniciá sesión como administrador"},401,h);
  const url=Deno.env.get("SUPABASE_URL");
  const anon=Deno.env.get("SUPABASE_ANON_KEY");
  if(!url||!anon)return respond({error:"Servicio de autenticación no configurado"},503,h);
  const db=createClient(url,anon,{
    auth:{persistSession:false},
    global:{headers:{Authorization:"Bearer "+bearer}}
  });
  const {data:{user},error:authError}=await db.auth.getUser(bearer);
  if(authError||!user)return respond({error:"Sesión inválida"},401,h);
  const {data:admin,error:roleError}=await db.from("site_admins").select("user_id").eq("user_id",user.id).maybeSingle();
  if(roleError)return respond({error:"No se pudo verificar la cuenta administradora"},503,h);
  if(!admin)return respond({error:"Solo la administración puede utilizar esta prueba"},403,h);
  let args: {mode?:string}={};
  try {args=await req.json();}catch{return respond({error:"Solicitud inválida"},400,h)}
  if(args.mode==="status"){
    const settings=["META_WA_TEST_ACCESS_TOKEN","META_WA_TEST_PHONE_NUMBER_ID","META_WA_TEST_RECIPIENT"];
    const missing=settings.filter(n=>!Deno.env.get(n));
    return respond({ready:missing.length===0,missing},200,h);
  }
  if(!["test","process"].includes(args.mode||""))return respond({error:"Modo no permitido"},400,h);
  const token=Deno.env.get("META_WA_TEST_ACCESS_TOKEN")||"";
  const phoneId=Deno.env.get("META_WA_TEST_PHONE_NUMBER_ID")||"";
  const recipient=(Deno.env.get("META_WA_TEST_RECIPIENT")||"").replace(/\D/g,"");
  if(!token||!/^\d{8,25}$/.test(phoneId)||!/^\d{10,16}$/.test(recipient)){
    return respond({error:"Faltan las tres credenciales de prueba de Meta en Secrets"},503,h);
  }
  let alert: {alert_id:string,alert_section:string,alert_title:string}|null=null;
  if(args.mode==="process"){
    const {data,error}=await db.rpc("gdv_wa_claim_test_alert");
    if(error)return respond({error:"No se pudo consultar la cola de moderación"},503,h);
    alert=Array.isArray(data)?(data[0]||null):null;
    if(!alert)return respond({ok:true,processed:0,info:"Sin publicaciones nuevas pendientes o límite diario de pruebas alcanzado"},200,h);
  }
  // La plantilla de prueba de Meta no contiene datos de usuarios ni publicaciones.
  const payload={
    messaging_product:"whatsapp",
    to:recipient,
    type:"template",
    template:{name:"hello_world",language:{code:"en_US"}}
  };
  let accepted=false;
  let errorDescription="";
  let messageId:string|null=null;
  let acceptedWithoutNine=false;
  let lastErrorCode:number|null=null;
  // Meta's Argentine testing number allowlist can reject a verified +54 9
  // recipient when Graph API matches the alternate +54 format without the 9.
  // The second attempt is permitted only after Meta explicitly rejects
  // the first with 131030; it does NOT retry ambiguous network errors.
  const alternate=recipient.startsWith("549")&&recipient.length>=12&&recipient.length<=16
    ? "54"+recipient.slice(3) : null;
  const send=async(to:string)=>{
    const body={...payload,to};
    const response=await fetch("https://graph.facebook.com/v24.0/"+phoneId+"/messages",{
      method:"POST",
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify(body)
    });
    const data=await response.json().catch(()=>({}));
    return {ok:response.ok,id:data?.messages?.[0]?.id,code:Number(data?.error?.code)||null,status:response.status};
  };
  try{
    const first=await send(recipient);
    if(first.ok&&first.id){
      accepted=true;messageId=String(first.id);
    }else{
      lastErrorCode=first.code;
      if(first.code===131030 && alternate && alternate!==recipient){
        const second=await send(alternate);
        if(second.ok&&second.id){
          accepted=true;messageId=String(second.id);acceptedWithoutNine=true;
        }else{
          lastErrorCode=second.code;
          errorDescription=second.code===131030
            ?"Meta no reconoce el destinatario de prueba autorizado. En Meta, registrá ese teléfono sin el 9 después de 54 y verificá el código recibido."
            :"La segunda prueba fue rechazada por Meta (código "+String(second.code||second.status)+").";
        }
      }else if(first.code===131030){
        errorDescription="Meta no reconoce el teléfono en la lista de destinatarios de prueba. Comprobá en Meta que esté agregado y verificado; para Argentina probá sin el 9 después de 54.";
      }else{
        errorDescription="Meta rechazó el mensaje (código "+String(first.code||first.status)+").";
      }
      if(!accepted)console.error("Meta test delivery rejected:",first.code||first.status,lastErrorCode||"");
    }
  }catch(e){
    errorDescription="No se pudo conectar con Meta; el resultado no es seguro para reintentar automáticamente.";
    console.error("Meta API network error",e instanceof Error?e.message:"desconocido");
  }
  if(alert){
    const {data:done,error:doneError}=await db.rpc("gdv_wa_finalize_test_alert",{
      p_id:alert.alert_id,p_success:accepted,p_error:accepted?null:errorDescription
    });
    if(doneError||done!==true){
      console.error("No se pudo confirmar el estado del aviso");
      return respond({error:"Estado del envío no confirmado; no vuelvas a enviar hasta revisar la cola"},502,h);
    }
  }
  if(!accepted)return respond({error:"Meta no aceptó el mensaje de prueba: "+errorDescription},502,h);
  return respond({
    ok:true,accepted:true,mode:args.mode,processed:alert?1:0,
    section:alert?.alert_section||null,message_id:messageId,
    note:"Meta aceptó el mensaje, pero su entrega aún debe confirmarse en WhatsApp.",
    recipient_formato:acceptedWithoutNine?"Argentina: sin 9 después de 54":"Configuración original"
  },200,h);
});