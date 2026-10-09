import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { S3Client, ListObjectsV2Command } from "npm:@aws-sdk/client-s3@3.821.0";

const allowedOrigins = new Set([
  "https://gentedevuelo.com",
  "https://www.gentedevuelo.com",
  "https://gentedevuelo.vercel.app",
]);
const bucket = "gente-de-vuelo-media";
const maxPages = 30;
function cors(origin: string | null): Record<string,string> {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://gentedevuelo.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}
function json(origin: string | null, status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status, headers: {...cors(origin), "Content-Type":"application/json; charset=utf-8"}
  });
}
function r2Client(): S3Client {
  const id = Deno.env.get("R2_ACCOUNT_ID");
  const key = Deno.env.get("R2_ACCESS_KEY_ID");
  const secret = Deno.env.get("R2_SECRET_ACCESS_KEY");
  if (!id || !key || !secret) throw new Error("No hay credenciales R2 configuradas");
  return new S3Client({
    endpoint: "https://" + id + ".r2.cloudflarestorage.com",
    credentials: {accessKeyId:key, secretAccessKey:secret},
    region: "auto",
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    maxAttempts: 2,
  });
}
async function r2Stats() {
  const s3 = r2Client();
  const groups: Record<string,{name:string;bytes:number;count:number}> = {
    imagenes: {name:"Fotografías y logos", bytes:0, count:0},
    videos: {name:"Videos",bytes:0,count:0},
    documentos: {name:"Documentos PDF",bytes:0,count:0},
    otros: {name:"Otros archivos",bytes:0,count:0},
  };
  let totalBytes=0, totalFiles=0;
  let token: string | undefined=undefined;
  let complete=false;
  for(let page=0;page<maxPages;page++){
    const result=await s3.send(new ListObjectsV2Command({
      Bucket:bucket,MaxKeys:1000,ContinuationToken:token
    }));
    for(const item of result.Contents||[]){
      if(!item.Key)continue;
      const length=Number(item.Size||0);
      const safeSize=Number.isFinite(length)&&length>=0?length:0;
      const first=item.Key.split("/")[0];
      const group=groups[first]||groups.otros;
      group.bytes+=safeSize;
      group.count++;
      totalBytes+=safeSize;
      totalFiles++;
    }
    if(!result.IsTruncated){complete=true;break}
    if(!result.NextContinuationToken)throw new Error("Cloudflare no devolvió la continuación del inventario");
    token=result.NextContinuationToken;
  }
  return {totalBytes,totalFiles,groups:Object.values(groups),complete};
}
Deno.serve(async req=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=="POST")return json(origin,405,{error:"Método no permitido"});
  if(origin&&!allowedOrigins.has(origin))return json(origin,403,{error:"Origen no permitido"});
  const jwt=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if(!jwt)return json(origin,401,{error:"Se requiere iniciar sesión"});
  const url=Deno.env.get("SUPABASE_URL");
  const anon=Deno.env.get("SUPABASE_ANON_KEY");
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anon||!service)return json(origin,503,{error:"Servicio de estadísticas sin configurar"});
  const client=createClient(url,anon,{auth:{persistSession:false}});
  const {data:{user},error:userError}=await client.auth.getUser(jwt);
  if(userError||!user)return json(origin,401,{error:"La sesión no es válida"});
  const privileged=createClient(url,service,{auth:{persistSession:false}});
  const {data:admin,error:adminError}=await privileged.from("site_admins")
    .select("user_id").eq("user_id",user.id).maybeSingle();
  if(adminError)return json(origin,503,{error:"No se pudieron verificar permisos"});
  if(!admin)return json(origin,403,{error:"Solo el administrador puede ver el almacenamiento"});
  let request: {action?:string};
  try{request=await req.json()}catch{return json(origin,400,{error:"Solicitud inválida"})}
  if(request.action!=="report")return json(origin,400,{error:"Acción desconocida"});
  const warnings:string[]=[];
  let supabase:null|{buckets:unknown[];totalBytes:number;totalFiles:number}=null;
  let cloudflare:null|Awaited<ReturnType<typeof r2Stats>>=null;
  const [dbResult,r2Result]=await Promise.allSettled([
    privileged.rpc("gdv_storage_usage_service"),r2Stats()
  ]);
  if(dbResult.status==="fulfilled"){
    if(!dbResult.value.error&&dbResult.value.data){
      const data=dbResult.value.data;
      supabase={
        buckets:Array.isArray(data.buckets)?data.buckets:[],
        totalBytes:Number(data.totalBytes||0),
        totalFiles:Number(data.totalFiles||0)
      };
    } else warnings.push("No se pudo consultar el uso de Supabase Storage");
  } else warnings.push("No respondió el informe de Supabase Storage");
  if(r2Result.status==="fulfilled") cloudflare=r2Result.value;
  else{
    console.error("Error al consultar tamaño R2",r2Result.reason instanceof Error?r2Result.reason.message:"desconocido");
    warnings.push("No se pudo obtener el inventario de Cloudflare R2");
  }
  return json(origin,200,{
    asOf:new Date().toISOString(),
    supabase,
    cloudflare,
    warnings
  });
});
