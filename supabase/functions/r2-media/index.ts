import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, GetBucketCorsCommand, PutBucketCorsCommand } from "npm:@aws-sdk/client-s3@3.821.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.821.0";

const origins = ["https://gentedevuelo.com","https://www.gentedevuelo.com","https://gentedevuelo.vercel.app"];
const bucket = "gente-de-vuelo-media";
const base = "https://media.gentedevuelo.com/";
const types: Record<string,[string,string,number]> = {
  "image/jpeg":["imagenes","jpg",4*1024*1024],
  "image/png":["imagenes","png",4*1024*1024],
  "image/webp":["imagenes","webp",4*1024*1024],
  "video/mp4":["videos","mp4",40*1024*1024],
  "video/webm":["videos","webm",40*1024*1024],
  "video/quicktime":["videos","mov",40*1024*1024],
  "application/pdf":["documentos","pdf",15*1024*1024]
};
const headers=(origin:string|null)=>({
  "Access-Control-Allow-Origin":origin && origins.includes(origin)?origin:origins[0],
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-gdv-direct-upload",
  "Vary":"Origin"
});
const reply=(origin:string|null,code:number,data:unknown)=>new Response(JSON.stringify(data),{status:code,headers:{...headers(origin),"Content-Type":"application/json","Cache-Control":"no-store"}});
function r2(){
 const id=Deno.env.get("R2_ACCOUNT_ID"),ak=Deno.env.get("R2_ACCESS_KEY_ID"),sk=Deno.env.get("R2_SECRET_ACCESS_KEY");
 if(!id||!ak||!sk)throw new Error("Credenciales R2 sin configurar");
 return new S3Client({region:"auto",endpoint:"https://"+id+".r2.cloudflarestorage.com",credentials:{accessKeyId:ak,secretAccessKey:sk},forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED'});
}
function safePath(path:unknown,userId:string){
 if(typeof path!=="string")return false;
 return /^(imagenes|videos|documentos)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm|mov|pdf)$/.test(path)&&path.split("/")[1]===userId;
}
async function checkAdmin(userId:string){
 const url=Deno.env.get("SUPABASE_URL")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!serviceKey)throw new Error("No se puede verificar al administrador");
 const adminClient=createClient(url,serviceKey,{auth:{persistSession:false}});
 const {data,error}=await adminClient.from("site_admins").select("user_id").eq("user_id",userId).maybeSingle();
 if(error)throw new Error("No se puede comprobar el permiso de administración");
 return Boolean(data);
}
async function configureCors(s3:S3Client){
 let existing:any[]=[];
 try{const c=await s3.send(new GetBucketCorsCommand({Bucket:bucket}));existing=c.CORSRules||[]}
 catch(e){if(!/NoSuchCORS|NotFound|404/i.test(String(e)))throw e}
 const allowed=origins.every(origin=>existing.some(rule=>rule.AllowedOrigins?.includes(origin)&&rule.AllowedMethods?.includes("PUT")&&rule.AllowedHeaders?.some((h:string)=>h==="*"||h.toLowerCase()==="content-type")));
 if(allowed)return "ya configurado";
 const rule={AllowedOrigins:origins,AllowedMethods:["PUT","GET","HEAD"],AllowedHeaders:["Content-Type"],ExposeHeaders:["ETag"],MaxAgeSeconds:3600};
 await s3.send(new PutBucketCorsCommand({Bucket:bucket,CORSConfiguration:{CORSRules:[...existing.filter(rule=>!origins.some(origin=>rule.AllowedOrigins?.includes(origin))),rule]}}));
 return "configurado";
}

Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=="POST")return reply(origin,405,{error:"Método no permitido"});
 if(origin&&!origins.includes(origin))return reply(origin,403,{error:"Origen no permitido"});
 const jwt=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!jwt)return reply(origin,401,{error:"Iniciá sesión"});
 const url=Deno.env.get("SUPABASE_URL")||"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const auth=createClient(url,anon,{auth:{persistSession:false}});
 const {data:{user},error:authErr}=await auth.auth.getUser(jwt);
 if(authErr||!user)return reply(origin,401,{error:"Sesión inválida"});
 if(req.headers.get("x-gdv-direct-upload")==="1"){
  const ctype=(req.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
  const spec=types[ctype];
  if(!spec)return reply(origin,415,{error:"Formato no permitido"});
  try{
   const bytes=new Uint8Array(await req.arrayBuffer());
   if(!bytes.length||bytes.length>spec[2])return reply(origin,413,{error:"El archivo supera el máximo permitido"});
   const head=(n:number)=>new TextDecoder().decode(bytes.slice(0,n));
   const signature=ctype==="image/jpeg" ? bytes[0]===255&&bytes[1]===216&&bytes[2]===255 :
      ctype==="image/png" ? bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71 :
      ctype==="image/webp" ? head(4)==="RIFF"&&new TextDecoder().decode(bytes.slice(8,12))==="WEBP" :
      ctype==="application/pdf" ? head(5)==="%PDF-" :
      ctype==="video/webm" ? bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163 :
      new TextDecoder().decode(bytes.slice(4,8))==="ftyp";
   if(!signature)return reply(origin,415,{error:"El contenido no corresponde al tipo declarado"});
   const key=spec[0]+"/"+user.id+"/"+crypto.randomUUID()+"."+spec[1];
   const client=r2();
   await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:ctype}));
   const confirmed=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
   if(Number(confirmed.ContentLength)!==bytes.length)throw new Error("La copia en R2 no coincide");
   return reply(origin,201,{url:base+key,path:key,size:bytes.length});
  }catch(e){console.error("Carga directa R2:",e instanceof Error?e.message:"Error");return reply(origin,502,{error:"No se pudo transferir el archivo a Cloudflare R2"})}
 }
 let input:any;
 try{input=await req.json()}catch{return reply(origin,400,{error:"Solicitud inválida"})}
 const action=input?.action;
 try{
  const s3=r2();
  if(action==="prepare"){
   const spec=types[input.contentType];
   if(!spec||!Number.isInteger(input.size)||input.size<1||input.size>spec[2])return reply(origin,400,{error:"Tipo o tamaño de archivo no permitido"});
   const key=spec[0]+"/"+user.id+"/"+crypto.randomUUID()+"."+spec[1];
   const signed=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:input.contentType}),{expiresIn:600});
   return reply(origin,200,{uploadUrl:signed,path:key,url:base+key,contentType:input.contentType,expiresIn:600});
  }
  if(action==="finish"){
   if(!safePath(input.path,user.id))return reply(origin,400,{error:"Ruta inválida"});
   const rule=types[input.contentType];
   if(!rule||!input.path.startsWith(rule[0]+"/")||!input.path.endsWith("."+rule[1]))return reply(origin,400,{error:"Formato incompatible"});
   const head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:input.path}));
   const size=Number(head.ContentLength||0);
   if(size<1||size>rule[2]){await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:input.path}));return reply(origin,413,{error:"El archivo excede el tamaño permitido"})}
   if(String(head.ContentType||"").split(";")[0]!==input.contentType)return reply(origin,415,{error:"El tipo del archivo no coincide"});
   return reply(origin,200,{url:base+input.path,path:input.path,size});
  }
  if(action==="setup-cors"){
   if(!await checkAdmin(user.id))return reply(origin,403,{error:"Solo administración"});
   const result=await configureCors(s3);
   return reply(origin,200,{ok:true,detail:result});
  }
  return reply(origin,400,{error:"Operación desconocida"});
 }catch(e){console.error("R2 media:",e instanceof Error?e.message:"Error");return reply(origin,502,{error:"Cloudflare R2 no completó la operación; revisá la configuración de permisos y CORS."})}
});
