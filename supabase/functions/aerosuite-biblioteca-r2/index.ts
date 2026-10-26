import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetBucketCorsCommand, PutBucketCorsCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from "npm:@aws-sdk/client-s3@3.821.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.821.0";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const origins=["https://gentedevuelo.com","https://www.gentedevuelo.com","https://gentedevuelo.vercel.app"];
const bucket="gente-de-vuelo-media";
const publicBase="https://media.gentedevuelo.com/";
const maxBytes=100*1024*1024;
const keys:{[key:string]:string}={
 teoria:"biblioteca/teoria/fichas-teoria-30.pdf",
 crm:"biblioteca/crm/fichas-crm-06.pdf"
};
const cors=(origin:string|null)=>({
 "Access-Control-Allow-Origin":origin&&origins.includes(origin)?origin:origins[0],
 "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-academia-action, x-academia-upload-id, x-academia-path, x-academia-part",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Cache-Control":"no-store",
 "Vary":"Origin"
});
const reply=(origin:string|null,code:number,data:unknown)=>new Response(JSON.stringify(data),{status:code,headers:{...cors(origin),"Content-Type":"application/json"}});
function r2Aws(){
 const account=Deno.env.get("R2_ACCOUNT_ID"),id=Deno.env.get("R2_ACCESS_KEY_ID"),secret=Deno.env.get("R2_SECRET_ACCESS_KEY");
 if(!account||!id||!secret)throw Error("Credenciales R2 no configuradas");
 return {endpoint:"https://"+account+".r2.cloudflarestorage.com",client:new AwsClient({
  accessKeyId:id,secretAccessKey:secret,service:"s3",region:"auto",retries:0
 })};
}
function r2SignedKey(key:string){
 return bucket+"/"+key.split("/").map(encodeURIComponent).join("/");
}
async function signedMultipartComplete(input:any){
 const {endpoint,client}=r2Aws();
 const parts=input.MultipartUpload?.Parts||[];
 if(!parts.length)throw Error("Faltan fragmentos para completar el PDF");
 const xml='<?xml version="1.0" encoding="UTF-8"?>'+
  '<CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'+
  parts.map((part:any)=>'<Part><PartNumber>'+Number(part.PartNumber)+'</PartNumber><ETag>'+
  String(part.ETag).replace(/&/g,"&amp;").replace(/</g,"&lt;")+'</ETag></Part>').join('')+
  '</CompleteMultipartUpload>';
 const target=endpoint+"/"+r2SignedKey(input.Key)+"?uploadId="+encodeURIComponent(input.UploadId);
 const response=await client.fetch(target,{method:"POST",headers:{"Content-Type":"application/xml"},body:xml,
  signal:AbortSignal.timeout(45000)});
 const result=await response.text();
 if(!response.ok||/<(?:[a-z0-9]+:)?Error\b/i.test(result)){
  const reason=result.match(/<Code>([^<]+)<\/Code>/)?.[1]||"Error de Cloudflare R2";
  throw Error("R2 no completó el PDF: "+reason+" (HTTP "+response.status+")");
 }
 if(!/CompleteMultipartUploadResult/.test(result))throw Error("Cloudflare no confirmó la unión del PDF");
 return {ok:true};
}
async function signedCopyObject(input:any){
 const {endpoint,client}=r2Aws();
 const target=endpoint+"/"+r2SignedKey(input.Key);
 const source=String(input.CopySource||"");
 const response=await client.fetch(target,{method:"PUT",headers:{
  "x-amz-copy-source":source,
  "x-amz-metadata-directive":"REPLACE",
  "Content-Type":"application/pdf",
  "Cache-Control":"public, max-age=60"
 },signal:AbortSignal.timeout(45000)});
 const xml=await response.text();
 if(!response.ok||/<(?:[a-z0-9]+:)?Error\b/i.test(xml)){
  const reason=xml.match(/<Code>([^<]+)<\/Code>/)?.[1]||"Error de Cloudflare R2";
  throw Error("R2 no pudo publicar el PDF: "+reason+" (HTTP "+response.status+")");
 }
 if(!/CopyObjectResult/.test(xml))throw Error("Cloudflare no confirmó la publicación");
 return {ok:true};
}
async function signedSend(client:S3Client,command:any){
 if(command.constructor.name==="CompleteMultipartUploadCommand")return signedMultipartComplete(command.input);
 if(command.constructor.name==="CopyObjectCommand")return signedCopyObject(command.input);
 const type=command.constructor.name,input=command.input;
 let method="GET",headers:any={},body:any=undefined;
 if(type==="HeadObjectCommand")method="HEAD";
 else if(type==="GetObjectCommand"){if(input.Range)headers.Range=input.Range;}
 else if(type==="DeleteObjectCommand"||type==="AbortMultipartUploadCommand")method="DELETE";
 else if(type==="PutObjectCommand"||type==="CopyObjectCommand"||type==="UploadPartCommand")method="PUT";
 else if(type==="CreateMultipartUploadCommand"||type==="CompleteMultipartUploadCommand")method="POST";
 else throw Error("Operación R2 desconocida: "+type);
 if(type==="UploadPartCommand")body=input.Body;
 if(type==="CopyObjectCommand"){
  headers["x-amz-copy-source"]=input.CopySource;
  headers["x-amz-metadata-directive"]=input.MetadataDirective||"REPLACE";
  headers["Content-Type"]=input.ContentType||"application/pdf";
  if(input.CacheControl)headers["Cache-Control"]=input.CacheControl;
 }
 if(type==="CreateMultipartUploadCommand")headers["Content-Type"]=input.ContentType||"application/pdf";
 if(type==="CompleteMultipartUploadCommand"){
  const parts=input.MultipartUpload?.Parts||[];
  body='<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>'+
   parts.map((part:any)=>'<Part><PartNumber>'+part.PartNumber+'</PartNumber><ETag>'+
    String(part.ETag).replace(/&/g,"&amp;").replace(/</g,"&lt;")+'</ETag></Part>').join('')+'</CompleteMultipartUpload>';
  headers["Content-Type"]="application/xml";
 }
 const signed=await getSignedUrl(client,command,{expiresIn:120});
 const response=await fetch(signed,{method,headers,body,signal:AbortSignal.timeout(25000)});
 if(response.status===404&&type==="HeadObjectCommand"){const e:any=new Error("R2 HTTP 404");e.name="NotFound";throw e}
 if(!response.ok)throw Error("R2 "+type+" respondió HTTP "+response.status);
 const etag=response.headers.get("etag");
 if(type==="HeadObjectCommand")return {ContentLength:Number(response.headers.get("content-length")||0),
  ETag:etag,LastModified:response.headers.get("last-modified")?new Date(response.headers.get("last-modified")!):undefined,
  ContentType:response.headers.get("content-type")};
 if(type==="GetObjectCommand")return {Body:{transformToByteArray:async()=>new Uint8Array(await response.arrayBuffer())}};
 if(type==="UploadPartCommand")return {ETag:etag};
 if(type==="CreateMultipartUploadCommand"){
  const xml=await response.text(),match=xml.match(/<UploadId>([^<]+)<\/UploadId>/);
  if(!match)throw Error("R2 no entregó identificador de carga");
  return {UploadId:match[1]};
 }
 if(type==="CompleteMultipartUploadCommand"||type==="CopyObjectCommand"){
  const xml=await response.text();
  if(xml.includes("<Error>"))throw Error("Cloudflare R2 rechazó la publicación.");
 }
 return {ETag:etag};
}
function r2(){
 const account=Deno.env.get("R2_ACCOUNT_ID"),key=Deno.env.get("R2_ACCESS_KEY_ID"),secret=Deno.env.get("R2_SECRET_ACCESS_KEY");
 if(!account||!key||!secret)throw new Error("R2 no configurado");
 return new S3Client({region:"auto",endpoint:"https://"+account+".r2.cloudflarestorage.com",
  credentials:{accessKeyId:key,secretAccessKey:secret},forcePathStyle:true,requestChecksumCalculation:"WHEN_REQUIRED"});
}
// La carga directa desde el navegador a una URL firmada requiere CORS en R2.
 // Se preservan las demás reglas del bucket, utilizadas por fotos y videos.
async function ensureUploadCors(client:S3Client){
 let rules:any[]=[];
 try{
  const result=await signedSend(client,new GetBucketCorsCommand({Bucket:bucket}));
  rules=result.CORSRules||[];
 }catch(err){
  const name=String((err as any)?.name||"");
  if(!/NoSuchCORSConfiguration/i.test(name+" "+String(err)))throw err;
 }
 const id="gente-de-vuelo-academia-pdf";
 const existing=rules.find(rule=>rule.ID===id);
 const allowed=existing?.AllowedOrigins||[];
 if(existing&&origins.every(origin=>allowed.includes(origin))&&
  (existing.AllowedMethods||[]).includes("PUT")&&
  (existing.AllowedHeaders||[]).some((value:string)=>value==="*"||value.toLowerCase()==="content-type"))return;
 const rule={ID:id,AllowedOrigins:origins,AllowedMethods:["PUT"],AllowedHeaders:["Content-Type"],ExposeHeaders:["ETag"],MaxAgeSeconds:3600};
 await signedSend(client,new PutBucketCorsCommand({Bucket:bucket,CORSConfiguration:{CORSRules:[...rules.filter(item=>item.ID!==id),rule]}}));
}
async function state(client:S3Client,type:string){
 try{
  const head=await signedSend(client,new HeadObjectCommand({Bucket:bucket,Key:keys[type]}));
  const size=Number(head.ContentLength||0);
  if(!size||size>maxBytes)return {published:false};
  const version=[head.LastModified?.toISOString()||"",String(head.ETag||"").replace(/"/g,"")].join("-");
  return {published:true,url:publicBase+keys[type],version,size,updatedAt:head.LastModified?.toISOString()||null};
 }catch(e){
  if(/NoSuchKey|NotFound|404/i.test(String(e))||["NotFound","NoSuchKey"].includes(String((e as any)?.name)))return {published:false};
  throw e;
 }
}

const legacyBucket="aerosuite-biblioteca";
const legacyMain:{[key:string]:string}={teoria:"teoria/fichas-teoria-30.pdf",crm:"crm/fichas-crm-06.pdf"};
const extraPrefix="biblioteca/materias/";
const publicURL=(key:string)=>publicBase+key.split("/").map(encodeURIComponent).join("/");
const copySource=(key:string)=>encodeURIComponent(bucket+"/"+key).replace(/%2F/gi,"/");
function extraSlug(value:string){
 return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
  .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,55);
}
function extraKey(name:string,count:number,hidden=false){
 return extraPrefix+(hidden?"oculta--":"")+extraSlug(name)+"--"+count+"--"+encodeURIComponent(name)+".pdf";
}
function parseExtra(key:unknown){
 if(typeof key!=="string"||!key.startsWith(extraPrefix))return null;
 const suffix=key.slice(extraPrefix.length);
 const m=suffix.match(/^(oculta--)?([a-z0-9-]+)--([1-9][0-9]{0,2})--(.+)\.pdf$/);
 if(!m)return null;
 try{
  const name=decodeURIComponent(m[4]),count=Number(m[3]);
  if(name.length<3||name.length>80||count<1||count>500||extraKey(name,count,!!m[1])!==key)return null;
  return {name,count,hidden:!!m[1],slug:m[2],path:key};
 }catch{return null}
}

async function listExtras(adminDb:any){
 const {data,error}=await adminDb.from("aerosuite_library_catalog")
  .select("slug,name,fichas,r2_key,hidden,file_size,file_version,updated_at").order("name").limit(2000);
 if(error)throw Error("No se pudo consultar el catálogo: "+error.message);
 return (data||[]).map((x:any)=>({
  slug:x.slug,name:x.name,count:x.fichas,hidden:x.hidden,path:x.r2_key,
  size:x.file_size,version:x.file_version,updatedAt:x.updated_at,
  url:publicURL(x.r2_key),source:"r2"
 }));
}
async function eraseLegacyExtras(adminDb:any,slug:string){
 const store=adminDb.storage.from(legacyBucket);
 const listed=await store.list("materias",{limit:1000});
 if(listed.error)throw listed.error;
 const paths=(listed.data||[]).filter((f:any)=>{
  const m=String(f.name||"").match(/^(oculta--)?([a-z0-9-]+)--[0-9]+--/);
  return m?.[2]===slug;
 }).map((f:any)=>"materias/"+f.name);
 if(paths.length){const removed=await store.remove(paths);if(removed.error)throw removed.error}
}
function validStaging(path:unknown,user:string){
 return typeof path==="string"&&new RegExp("^biblioteca/pendientes/"+user.replace(/-/g,"\\-")+"/[0-9a-f-]{36}\\.pdf$").test(path);
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=="POST")return reply(origin,405,{error:"Método no permitido"});
 if(origin&&!origins.includes(origin))return reply(origin,403,{error:"Origen no permitido"});
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return reply(origin,401,{error:"Iniciá sesión para administrar la biblioteca"});
 const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",
  service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!anon||!service)return reply(origin,503,{error:"Configuración incompleta de Supabase para biblioteca R2",missing:[!url?"SUPABASE_URL":null,!anon?"SUPABASE_ANON_KEY":null,!service?"SUPABASE_SERVICE_ROLE_KEY":null].filter(Boolean)});
 try{
  const auth=createClient(url,anon,{auth:{persistSession:false}});
  const {data:{user},error}=await auth.auth.getUser(token);
  if(error||!user)return reply(origin,401,{error:"Sesión vencida"});
  const adminDb=createClient(url,service,{auth:{persistSession:false}});
  const {data:admin,error:adminError}=await adminDb.from("site_admins").select("user_id").eq("user_id",user.id).maybeSingle();
  if(adminError)return reply(origin,503,{error:"No se pudieron verificar permisos administrativos"});
  const client=r2();
  // Plan B: cada fragmento pasa por esta función autenticada y llega a R2,
  // sin necesidad de permisos CORS en las URLs firmadas del dominio de R2.
  if(req.headers.get("x-academia-action")==="multipart-part"){
   if(!admin)return reply(origin,403,{error:"Solo administración puede subir archivos"});
   const path=req.headers.get("x-academia-path");
   const uploadId=req.headers.get("x-academia-upload-id")||"";
   const partNumber=Number(req.headers.get("x-academia-part"));
   if(!validStaging(path,user.id)||!uploadId||uploadId.length>1024||
      !Number.isInteger(partNumber)||partNumber<1||partNumber>20)
    return reply(origin,400,{error:"Fragmento de carga inválido"});
   const bytes=new Uint8Array(await req.arrayBuffer());
   if(bytes.length<1||bytes.length>5*1024*1024)
    return reply(origin,413,{error:"Fragmento de PDF demasiado grande"});
   const uploaded=await signedSend(client,new UploadPartCommand({
    Bucket:bucket,Key:path as string,UploadId:uploadId,PartNumber:partNumber,Body:bytes
   }));
   if(!uploaded.ETag)return reply(origin,502,{error:"Cloudflare no confirmó el fragmento"});
   return reply(origin,200,{ok:true,etag:uploaded.ETag,partNumber});
  }
  let body:any;
  try{body=await req.json()}catch{return reply(origin,400,{error:"Solicitud inválida"})}
  const action=body?.action;
  if(action==="status"){
   const [th,cr,ex]=await Promise.allSettled([state(client,"teoria"),state(client,"crm"),listExtras(adminDb)]);
   const teoria=th.status==="fulfilled"?th.value:{published:false,unavailable:true};
   const crm=cr.status==="fulfilled"?cr.value:{published:false,unavailable:true};
   const allExtras=ex.status==="fulfilled"?ex.value:[];
   const warnings=[th,cr,ex].map((v,i)=>v.status==="rejected"?["Teoría","CRM","Materias"][i]+": "+String(v.reason?.message||"no disponible"):null).filter(Boolean);
   return reply(origin,200,{teoria,crm,extras:admin?allExtras:allExtras.filter((item:any)=>!item.hidden),warnings,maxBytes});
  }

  if(action==="download"){
   const type=body?.type;
   const row=type==="extra"?parseExtra(body?.path):null;
   if((type==="extra"&&!row)||(!keys[type]&&type!=="extra"))return reply(origin,400,{error:"Archivo inválido"});
   if(row?.hidden&&!admin)return reply(origin,403,{error:"Material oculto"});
   const objectKey=type==="extra"?row!.path:keys[type];
   const head=await signedSend(client,new HeadObjectCommand({Bucket:bucket,Key:objectKey}));
   if(!head.ContentLength)return reply(origin,404,{error:"El PDF no existe"});
   const filename=type==="extra"?extraSlug(row!.name)+".pdf":type==="teoria"?"teoria-aeronautica.pdf":"crm-factores-humanos.pdf";
   const downloadUrl=await getSignedUrl(client,new GetObjectCommand({
    Bucket:bucket,Key:objectKey,ResponseContentDisposition:'attachment; filename="'+filename+'"'
   }),{expiresIn:120});
   return reply(origin,200,{ok:true,downloadUrl});
  }
  if(!admin)return reply(origin,403,{error:"Solo administración puede modificar la biblioteca"});
  if(action==="delete-legacy-extra"){
   const path=body?.path;
   if(typeof path!=="string"||!/^materias\/(oculta--)?[a-z0-9-]+--[0-9]+--[^/]+\.pdf$/.test(path))
    return reply(origin,400,{error:"Ruta antigua inválida"});
   const deleted=await adminDb.storage.from(legacyBucket).remove([path]);
   if(deleted.error)throw deleted.error;
   return reply(origin,200,{ok:true});
  }
  if(action==="delete"){
   const type=body?.type,row=type==="extra"?parseExtra(body?.path):null;
   if(body?.confirm!==true||(!keys[type]&&type!=="extra")||(type==="extra"&&!row))
    return reply(origin,400,{error:"Eliminación inválida o sin confirmar"});
   if(type==="extra"){
    await signedSend(client,new DeleteObjectCommand({Bucket:bucket,Key:row!.path}));
    try{
     await signedSend(client,new HeadObjectCommand({Bucket:bucket,Key:row!.path}));
     throw Error("El archivo sigue presente en R2");
    }catch(check:any){
     if(!/404|NotFound/.test(check.message||"")&&check.name!=="NotFound")throw check;
    }
    const {error:catalogError}=await adminDb.from("aerosuite_library_catalog").delete().eq("slug",row!.slug);
    if(catalogError)throw Error("Archivo eliminado de R2; error al limpiar la tarjeta: "+catalogError.message);
    await eraseLegacyExtras(adminDb,row!.slug);
   }else{
    const legacyDeleted=await adminDb.storage.from(legacyBucket).remove([legacyMain[type]]);
    if(legacyDeleted.error)throw Error("No se pudo eliminar el PDF antiguo de Supabase: "+legacyDeleted.error.message);
    await signedSend(client,new DeleteObjectCommand({Bucket:bucket,Key:keys[type]}));
    const checked=await state(client,type);
    if(checked.published)throw Error("El archivo sigue publicado en R2");
   }
   return reply(origin,200,{ok:true,deleted:true});
  }
  if(action==="toggle-extra"){
   const row=parseExtra(body?.path);
   if(!row)return reply(origin,400,{error:"Materia inválida"});
   const target=extraKey(row.name,row.count,!row.hidden);
   await signedSend(client,new CopyObjectCommand({Bucket:bucket,Key:target,
    CopySource:copySource(row.path),ContentType:"application/pdf",CacheControl:"public, max-age=60",MetadataDirective:"REPLACE"}));
   const verified=await signedSend(client,new HeadObjectCommand({Bucket:bucket,Key:target}));
   if(!verified.ContentLength)throw Error("No se confirmó el cambio");
   const {error:catalogError}=await adminDb.from("aerosuite_library_catalog").update({
    r2_key:target,hidden:!row.hidden,updated_at:new Date().toISOString(),
    file_version:new Date().toISOString()
   }).eq("slug",row.slug);
   if(catalogError)throw Error("Materia copiada a R2 pero no cambió de estado: "+catalogError.message);
   await signedSend(client,new DeleteObjectCommand({Bucket:bucket,Key:row.path}));
   return reply(origin,200,{ok:true,path:target});
  }
  if(action==="discard"){
   if(!validStaging(body?.path,user.id))return reply(origin,400,{error:"Archivo temporal inválido"});
   await signedSend(client,new DeleteObjectCommand({Bucket:bucket,Key:body.path}));
   return reply(origin,200,{ok:true});
  }
  const type=body?.type;
  if(!keys[type]&&type!=="extra")return reply(origin,400,{error:"Materia inválida"});
  if(action==="multipart-start"){
   if(!Number.isInteger(body.size)||body.size<5||body.size>maxBytes)
    return reply(origin,413,{error:"Solo PDF de hasta 100 MB"});
   const path="biblioteca/pendientes/"+user.id+"/"+crypto.randomUUID()+".pdf";
   const created=await signedSend(client,new CreateMultipartUploadCommand({
    Bucket:bucket,Key:path,ContentType:"application/pdf"
   }));
   if(!created.UploadId)return reply(origin,502,{error:"R2 no abrió la transferencia fragmentada"});
   return reply(origin,200,{ok:true,path,uploadId:created.UploadId,partBytes:5*1024*1024});
  }
  if(action==="multipart-complete"||action==="multipart-abort"){
   const path=body?.path,uploadId=body?.uploadId;
   if(!validStaging(path,user.id)||typeof uploadId!=="string"||!uploadId||uploadId.length>1024)
    return reply(origin,400,{error:"Transferencia inválida"});
   if(action==="multipart-abort"){
    await signedSend(client,new AbortMultipartUploadCommand({Bucket:bucket,Key:path,UploadId:uploadId}));
    return reply(origin,200,{ok:true});
   }
   const parts=body?.parts;
   if(!Array.isArray(parts)||!parts.length||parts.length>20||
      !parts.every((part:any,index:number)=>typeof part==="string"&&part.length>2&&part.length<256))
    return reply(origin,400,{error:"Faltan fragmentos para confirmar la transferencia"});
   try{
    await signedSend(client,new CompleteMultipartUploadCommand({
     Bucket:bucket,Key:path,UploadId:uploadId,
     MultipartUpload:{Parts:parts.map((etag:string,i:number)=>({ETag:etag,PartNumber:i+1}))}
    }));
   }catch(error){
    // CompleteMultipartUpload puede haber finalizado aunque se pierda la respuesta.
    try{const head=await signedSend(client,new HeadObjectCommand({Bucket:bucket,Key:path}));
      if(!head.ContentLength)throw error;
    }catch{throw error}
   }
   return reply(origin,200,{ok:true,path});
  }
  if(action==="prepare"){
   if(body.contentType!=="application/pdf"||!Number.isInteger(body.size)||body.size<5||body.size>maxBytes)
    return reply(origin,413,{error:"Solo PDF de hasta 100 MB"});
   const path="biblioteca/pendientes/"+user.id+"/"+crypto.randomUUID()+".pdf";
   // CORS se configura de forma idempotente en R2 antes de generar una URL firmada.
   // Si la credencial no administra políticas del bucket, se devuelve un aviso claro.
   const corsWarning="Si la carga directa falla por CORS, se utiliza transferencia por fragmentos.";
   const uploadUrl=await getSignedUrl(client,new PutObjectCommand({Bucket:bucket,Key:path,ContentType:"application/pdf"}),{expiresIn:600});
   return reply(origin,200,{uploadUrl,path,maxBytes,expiresIn:600,corsWarning});
  }
  if(action==="finish"){
   const path=body?.path;
   if(!validStaging(path,user.id))return reply(origin,400,{error:"Ruta de carga inválida"});
   const head=await signedSend(client,new HeadObjectCommand({Bucket:bucket,Key:path}));
   const size=Number(head.ContentLength||0);
   if(size<5||size>maxBytes){await signedSend(client,new DeleteObjectCommand({Bucket:bucket,Key:path}));return reply(origin,413,{error:"El archivo supera los 100 MB"})}
   if((head.ContentType||"").split(";")[0]!=="application/pdf")return reply(origin,415,{error:"El archivo no es PDF"});
   const sample=await signedSend(client,new GetObjectCommand({Bucket:bucket,Key:path,Range:"bytes=0-7"}));
   const magic=await sample.Body?.transformToByteArray();
   if(!magic||new TextDecoder().decode(magic.slice(0,5))!=="%PDF-")return reply(origin,415,{error:"PDF inválido"});

   // Publicar primero y verificar; recién después retirar versiones anteriores.
   if(type==="extra"){
    const name=typeof body.name==="string"?body.name.trim():"",count=Number(body.count);
    if(name.length<3||name.length>80||!Number.isInteger(count)||count<1||count>500)
     return reply(origin,400,{error:"Nombre o cantidad de fichas inválida"});
    const key=extraKey(name,count);
    if(!extraSlug(name))return reply(origin,400,{error:"Nombre de materia inválido"});
    const previous=await adminDb.from("aerosuite_library_catalog").select("r2_key")
      .eq("slug",extraSlug(name)).maybeSingle();
    if(previous.error)throw Error("No se pudo comprobar la versión anterior del catálogo: "+previous.error.message);
    await signedSend(client,new CopyObjectCommand({Bucket:bucket,Key:key,CopySource:copySource(path),
     ContentType:"application/pdf",CacheControl:"public, max-age=60",MetadataDirective:"REPLACE"}));
    const published=await signedSend(client,new HeadObjectCommand({Bucket:bucket,Key:key}));
    if(Number(published.ContentLength)!==size)return reply(origin,502,{error:"No se confirmó la materia en R2"});
    const version=(published.LastModified?.toISOString()||"")+"-"+String(published.ETag||"").replace(/"/g,"");
    const {error:catalogError}=await adminDb.from("aerosuite_library_catalog").upsert({
     slug:extraSlug(name),name,fichas:count,r2_key:key,hidden:false,file_size:size,
     file_version:version,updated_at:new Date().toISOString()
    },{onConflict:"slug"});
    if(catalogError)throw Error("PDF subido a R2, pero la ficha no quedó en el catálogo: "+catalogError.message);
    let cleanupWarning="";
    if(previous.data?.r2_key&&previous.data.r2_key!==key){
     try{await signedSend(client,new DeleteObjectCommand({Bucket:bucket,Key:previous.data.r2_key}))}
     catch{cleanupWarning="La versión anterior de R2 no pudo borrarse; hace falta repetir la limpieza."}
    }
    try{await eraseLegacyExtras(adminDb,extraSlug(name))}
    catch(error){cleanupWarning="Se publicó en R2, pero no se pudo eliminar el PDF antiguo de Supabase: "+String(error)}
    await signedSend(client,new DeleteObjectCommand({Bucket:bucket,Key:path})).catch(()=>{});
    return reply(origin,200,{ok:true,published:true,url:publicURL(key),size,path:key,cleanupWarning});
   }
   await signedSend(client,new CopyObjectCommand({Bucket:bucket,Key:keys[type],CopySource:copySource(path),ContentType:"application/pdf",CacheControl:"public, max-age=60",MetadataDirective:"REPLACE"}));
   const published=await state(client,type);
   if(!published.published||published.size!==size)return reply(origin,502,{error:"La publicación no pudo verificarse"});
   let cleanupWarning="";
   const legacy=await adminDb.storage.from(legacyBucket).remove([legacyMain[type]]);
   if(legacy.error)cleanupWarning="La nueva versión está en R2, pero el PDF antiguo en Supabase no pudo eliminarse.";
   await signedSend(client,new DeleteObjectCommand({Bucket:bucket,Key:path})).catch(()=>{});
   return reply(origin,200,{ok:true,...published,cleanupWarning});
  }
  return reply(origin,400,{error:"Operación desconocida"});
 }catch(error){
  console.error("Biblioteca R2:",error instanceof Error?error.message:String(error));
  return reply(origin,502,{error:"Fallo de Cloudflare R2: "+(error instanceof Error?error.message:"conexión interrumpida")});
 }
});