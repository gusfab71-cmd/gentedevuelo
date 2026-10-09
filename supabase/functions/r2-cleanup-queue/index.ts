import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { S3Client, DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3.821.0";

const permittedOrigins = new Set(["https://gentedevuelo.com", "https://www.gentedevuelo.com", "https://gentedevuelo.vercel.app"]);
const R2_KEY = /^(imagenes|videos|documentos)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp|mp4|webm|mov|pdf)$/i;
const PUBLIC_BASE = "https://media.gentedevuelo.com/";
const BUCKET = "gente-de-vuelo-media";
function cors(origin: string | null) {
 return {
  "Access-Control-Allow-Origin": origin && permittedOrigins.has(origin) ? origin : "https://gentedevuelo.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
 };
}
function json(payload: unknown, status: number, h: Record<string,string>) {
 return new Response(JSON.stringify(payload), {status,headers:{...h,"Content-Type":"application/json","Cache-Control":"no-store"}});
}
Deno.serve(async (req: Request) => {
 const h = cors(req.headers.get("origin"));
 if (req.method === "OPTIONS") return new Response(null,{status:204,headers:h});
 if (req.method !== "POST") return json({error:"Método no permitido"},405,h);
 const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 const url = Deno.env.get("SUPABASE_URL");
 const anon = Deno.env.get("SUPABASE_ANON_KEY");
 const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if (!token) return json({error:"Se requiere iniciar sesión"},401,h);
 if (!url || !anon || !serviceRole) return json({error:"Servicio no configurado"},503,h);
 const auth = createClient(url,anon,{auth:{persistSession:false}});
 const {data:{user},error:authError} = await auth.auth.getUser(token);
 if (authError || !user) return json({error:"Sesión inválida"},401,h);
 const service = createClient(url,serviceRole,{auth:{persistSession:false}});
 const {data:tasks,error:queueError} = await service.from("r2_cleanup_queue")
   .select("path,url,attempts").order("created_at",{ascending:true}).limit(20);
 if (queueError) return json({error:"No se pudo leer la cola de limpieza"},503,h);
 if (!tasks?.length) return json({processed:0,pending:0},200,h);
 const accountId=Deno.env.get("R2_ACCOUNT_ID");
 const accessKeyId=Deno.env.get("R2_ACCESS_KEY_ID");
 const secretAccessKey=Deno.env.get("R2_SECRET_ACCESS_KEY");
 if (!accountId || !accessKeyId || !secretAccessKey) return json({error:"No hay credenciales R2 disponibles"},503,h);
 const r2=new S3Client({
  region:"auto",
  endpoint:"https://"+accountId+".r2.cloudflarestorage.com",
  credentials:{accessKeyId,secretAccessKey},
  forcePathStyle:true,
  maxAttempts:2,
 });
 let processed=0, errors=0;
 for (const task of tasks) {
  const path=task.path as string;
  const publicUrl=task.url as string;
  if (!R2_KEY.test(path) || publicUrl !== PUBLIC_BASE+path) {
   errors++;
   await service.from("r2_cleanup_queue").update({
    attempts:Number(task.attempts||0)+1,last_error:"Ruta R2 no válida"
   }).eq("path",path);
   continue;
  }
  try {
   const {data:referenced,error:referenceError} =
     await service.rpc("gdv_r2_is_file_referenced",{p_url:publicUrl});
   if (referenceError || typeof referenced !== "boolean") {
     throw new Error("Fallo al comprobar referencias: " +
       (referenceError?.code || "respuesta inválida"));
   }
   if (referenced) continue;
   await r2.send(new DeleteObjectCommand({Bucket:BUCKET,Key:path}));
   const {error:doneError}=await service.from("r2_cleanup_queue").delete().eq("path",path);
   if (doneError) throw new Error("Archivo eliminado; no se pudo confirmar la cola");
   processed++;
  } catch (err) {
   errors++;
   const msg=err instanceof Error?err.message:"Error R2";
   console.error("Limpieza pendiente",msg);
   await service.from("r2_cleanup_queue").update({
    attempts:Number(task.attempts||0)+1,last_error:msg.slice(0,200)
   }).eq("path",path);
  }
 }
 return json({processed,pending:Math.max(0,tasks.length-processed),errors},200,h);
});