import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { S3Client, DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3.821.0";

const buckets = new Set(["hangar-fotos","travesias-fotos","community-media","clasificados-fotos"]);
const r2Pattern=/^(imagenes|videos|documentos)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp|mp4|webm|mov|pdf)$/i;
const base="https://media.gentedevuelo.com/";
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async (request:Request)=>{
  if(request.method!=="POST") return respond({error:"method_not_allowed"},405);
  const token=request.headers.get("x-gdv-cleanup-token")||"";
  if(!/^[a-f0-9]{64}$/.test(token)) return respond({error:"unauthorized"},401);
  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey) return respond({error:"service_not_configured"},503);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const claim=await db.rpc("gdv_internal_claim_storage_cleanup",{p_token:token});
  if(claim.error||claim.data!==true) return respond({error:"expired_or_invalid_token"},403);

  const report={supabaseFiles:0,supabaseBytes:0,cloudflareFiles:0,cloudflareBytes:0,pendingR2:0,skippedReferenced:0,failures:0,errors:[] as string[]};
  const failure=(scope:string,error:unknown)=>{report.failures++;report.errors.push(scope+": "+String(error instanceof Error?error.message:error).slice(0,160))};

  // Never touch accounts that still exist, institutions or a file referenced by live content.
  try{
    const candidates=await db.rpc("gdv_internal_orphan_storage_files");
    if(candidates.error) throw candidates.error;
    for(const item of candidates.data||[]){
      try{
        if(!buckets.has(item.bucket_id)||!item.object_name) throw new Error("invalid_bucket_or_object");
        const removed=await db.storage.from(item.bucket_id).remove([item.object_name]);
        if(removed.error) throw removed.error;
        report.supabaseFiles++;
        report.supabaseBytes+=Number(item.file_bytes||0);
      }catch(e){failure("supabase_storage",e)}
    }
  }catch(e){failure("supabase_scan",e)}

  // Only delete Cloudflare files previously queued by the database's DELETE/UPDATE triggers.
  try{
    const tasks=await db.from("r2_cleanup_queue")
      .select("path,url,attempts").order("created_at",{ascending:true}).limit(40);
    if(tasks.error) throw tasks.error;
    if((tasks.data||[]).length){
      const account=Deno.env.get("R2_ACCOUNT_ID");
      const accessKeyId=Deno.env.get("R2_ACCESS_KEY_ID");
      const secretAccessKey=Deno.env.get("R2_SECRET_ACCESS_KEY");
      if(!account||!accessKeyId||!secretAccessKey) throw new Error("cloudflare_not_configured");
      const r2=new S3Client({region:"auto",endpoint:"https://"+account+".r2.cloudflarestorage.com",
        credentials:{accessKeyId,secretAccessKey},forcePathStyle:true,maxAttempts:2});
      for(const task of tasks.data||[]){
        try{
          if(!r2Pattern.test(task.path)||task.url!==base+task.path) throw new Error("invalid_r2_key");
          const check=await db.rpc("gdv_r2_is_file_referenced",{p_url:task.url});
          if(check.error||typeof check.data!=="boolean") throw new Error("reference_check_failed");
          if(check.data){report.skippedReferenced++;continue}
          await r2.send(new DeleteObjectCommand({Bucket:"gente-de-vuelo-media",Key:task.path}));
          const done=await db.from("r2_cleanup_queue").delete().eq("path",task.path);
          if(done.error) throw done.error;
          report.cloudflareFiles++;
          report.cloudflareBytes+=0; // Sizes aren't stored on this queue.
        }catch(e){
          failure("cloudflare",e);
          const updated=await db.from("r2_cleanup_queue").update({
            attempts:Number(task.attempts||0)+1,
            last_error:String(e instanceof Error?e.message:e).slice(0,180)
          }).eq("path",task.path);
          if(updated.error) failure("queue_update",updated.error);
        }
      }
    }
    const pending=await db.from("r2_cleanup_queue").select("*",{count:"exact",head:true});
    if(!pending.error) report.pendingR2=pending.count||0;
  }catch(e){failure("cloudflare_queue",e)}

  // Operational report: exclusive to the administration, independent of public newsletters.
  // Resend's acceptance confirms submission to the mail provider, not final inbox delivery.
  const when=new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires",dateStyle:"full",timeStyle:"short"}).format(new Date());
  const releasedMiB=(report.supabaseBytes/1048576).toFixed(2);
  const headline=report.failures>0?"Con incidencias":report.pendingR2>0?"Con archivos pendientes":"Finalizada correctamente";
  const subject="Gente de Vuelo | Informe de limpieza semanal - "+(report.failures>0?"Revisar incidencias":"Resultado");
  const bodyLines=[
    "INFORME DE LIMPIEZA SEMANAL - GENTE DE VUELO",
    "Fecha y hora: "+when+" (Argentina)",
    "Resultado: "+headline,
    "",
    "SUPABASE STORAGE",
    "Archivos eliminados: "+report.supabaseFiles,
    "Espacio liberado: "+releasedMiB+" MiB ("+report.supabaseBytes+" bytes)",
    "",
    "CLOUDFLARE R2",
    "Archivos eliminados: "+report.cloudflareFiles,
    "Espacio liberado: sin medición exacta en la cola R2",
    "",
    "Archivos pendientes en Cloudflare: "+report.pendingR2,
    "Archivos conservados por seguir en uso: "+report.skippedReferenced,
    "Errores: "+report.failures,
    ...(report.errors.length?["","DETALLE DE INCIDENCIAS",...report.errors.slice(0,10)]:[]),
    "",
    "La limpieza solo retira archivos huérfanos y eliminaciones pendientes.",
    "No se borran cuentas ni publicaciones vigentes.",
    "Gente de Vuelo - Administración"
  ];
  let emailStatus="failed",emailProviderId="",emailError="";
  try{
    const apiKey=Deno.env.get("RESEND_API_KEY")||"";
    const recipient=Deno.env.get("GDV_ADMIN_EMAIL")||"gentedevuelo@gmail.com";
    if(!apiKey) throw new Error("RESEND_API_KEY no configurada");
    if(!/^[^ @]+@[^ @]+[.][^ @]+$/.test(recipient)) throw new Error("Email de administración inválido");
    const esc=(s:string)=>s.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));
    const html='<!doctype html><html lang="es"><head><meta charset="UTF-8"></head>'
      +'<body style="margin:0;background:#f5f3ef;font-family:Arial,sans-serif;color:#333">'
      +'<main style="max-width:620px;margin:auto;background:white;border-radius:12px;overflow:hidden">'
      +'<header style="background:#292d32;color:#f3cb8e;padding:24px;text-align:center"><strong style="font-size:23px">GENTE DE VUELO</strong><p style="color:#f0d6b2">Informe de mantenimiento</p></header>'
      +'<section style="padding:26px"><h2 style="color:#343a40">Resultado de limpieza semanal</h2>'
      +bodyLines.map(s=>s?"<p style='font-size:14px;line-height:1.5;margin:6px 0'>"+esc(s)+"</p>":"<div style='height:10px'></div>").join("")
      +'</section><footer style="padding:20px;background:#faf8f5;font-size:12px;color:#6a6a6a">Mensaje automático exclusivo de la administración · <a href="https://gentedevuelo.com">gentedevuelo.com</a></footer></main></body></html>';
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        from:Deno.env.get("GDV_MAIL_SENDER")||"Gente de Vuelo <hola@gentedevuelo.com>",
        to:[recipient],reply_to:"gentedevuelo@gmail.com",subject,html,text:bodyLines.join(String.fromCharCode(10))
      })
    });
    const value=await response.json().catch(()=>({}));
    if(!response.ok||typeof value.id!=="string") throw new Error("Resend: "+String(value.message||response.status).slice(0,120));
    emailStatus="accepted";emailProviderId=value.id;
  }catch(e){
    emailError=String(e instanceof Error?e.message:e).slice(0,200);
    console.error("No se pudo enviar el informe semanal:",emailError);
  }
  const fullReport={...report,emailStatus,emailProviderId,emailError};
  try{
    const saved=await db.rpc("gdv_internal_finish_storage_cleanup",{p_token:token,p_result:fullReport});
    if(saved.error||saved.data!==true) return respond({...fullReport,error:"could_not_save_report"},500);
  }catch(e){return respond({...report,error:"could_not_save_report"},500)}
  return respond(fullReport,report.failures?207:200);
});