import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.0";
import {S3Client,PutObjectCommand,HeadObjectCommand} from "npm:@aws-sdk/client-s3@3.821.0";

const origins=["https://gentedevuelo.com","https://www.gentedevuelo.com","https://gentedevuelo.vercel.app"];
const base="https://media.gentedevuelo.com/";
const bucket="gente-de-vuelo-media";
const validExt:Record<string,[string,string]>={jpg:["image/jpeg","imagenes"],jpeg:["image/jpeg","imagenes"],png:["image/png","imagenes"],webp:["image/webp","imagenes"],mp4:["video/mp4","videos"],webm:["video/webm","videos"],mov:["video/quicktime","videos"],pdf:["application/pdf","documentos"]};
const h=(origin:string|null)=>({"Access-Control-Allow-Origin":origin&&origins.includes(origin)?origin:origins[0],"Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type","Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"});
const reply=(o:string|null,status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:h(o)});
function isR2(u:unknown){return typeof u==="string"&&u.startsWith(base)}
function ext(path:string){return path.split("?")[0].split(".").pop()?.toLowerCase()||""}
function storagePathFromURL(raw:string){
 const prefix=(Deno.env.get("SUPABASE_URL")||"")+"/storage/v1/object/public/";
 if(!raw.startsWith(prefix))return null;
 let tail:string;
 try{tail=decodeURIComponent(new URL(raw).pathname.split("/storage/v1/object/public/")[1])}catch{return null}
 const slash=tail.indexOf("/");
 if(slash<=0)return null;
 return {bucket:tail.slice(0,slash),path:tail.slice(slash+1)};
}
function s3client(){
 const id=Deno.env.get("R2_ACCOUNT_ID"),access=Deno.env.get("R2_ACCESS_KEY_ID"),secret=Deno.env.get("R2_SECRET_ACCESS_KEY");
 if(!id||!access||!secret)throw new Error("R2 no está configurado");
 return new S3Client({endpoint:"https://"+id+".r2.cloudflarestorage.com",credentials:{accessKeyId:access,secretAccessKey:secret},region:"auto",forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED'});
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h(origin)});
 if(req.method!=="POST")return reply(origin,405,{error:"Método no permitido"});
 if(origin&&!origins.includes(origin))return reply(origin,403,{error:"Origen no permitido"});
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return reply(origin,401,{error:"Iniciá sesión"});
 const url=Deno.env.get("SUPABASE_URL")||"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const sr=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!sr)return reply(origin,503,{error:"Servicio de migración sin configurar"});
 const auth=createClient(url,anon,{auth:{persistSession:false}});
 const {data:{user},error:ue}=await auth.auth.getUser(token);
 if(ue||!user)return reply(origin,401,{error:"Sesión inválida"});
 // La identidad viene del JWT verificado; la consulta de roles se hace con
 // service_role solamente en el servidor, nunca desde el navegador.
 const db=createClient(url,sr,{auth:{persistSession:false}});
 const {data:admin,error:ae}=await db.from("site_admins").select("user_id").eq("user_id",user.id).maybeSingle();
 if(ae)return reply(origin,503,{error:"No se pudieron verificar los permisos del administrador"});
 if(!admin)return reply(origin,403,{error:"Solo el administrador puede migrar archivos"});
 let body:any;try{body=await req.json()}catch{return reply(origin,400,{error:"Solicitud inválida"})}
 if(body.action!=="migrate"&&body.action!=="inventory")return reply(origin,400,{error:"Acción inválida"});
 const s3=s3client();
 const tasks:any[]=[];
 const errors:string[]=[];
 const limit=Math.min(8,Math.max(1,Number(body.limit)||5));
 async function select(table:string,cols:string){
  const q=await db.from(table).select(cols).limit(300);
  if(q.error)errors.push(table+": "+q.error.message);
  return q.data||[];
 }
 try{
  const [media,logos,galeria,aportes,avatars,clasificados,travesias]=await Promise.all([
   select("gdv_media","id,owner_id,path,legacy_url,kind"),
   select("gdv_friendly_institutions","id,logo_path,logo_url"),
   select("galeria","id,user_id,archivo"),
   select("aportes_adjuntos","id,user_id,storage_path"),
   select("profiles","id,avatar_url"),
   select("clasificados","id,user_id,fotos"),
   select("travesias","id,user_id,fotos,videos")
  ]);
  function add(table:string,id:string,owner:string,bucketName:string,source:string,update:()=>Promise<any>,priority=5){
   if(!source||!validExt[ext(source)])return;
   tasks.push({table,id,owner,bucketName,source,update,priority});
  }
  for(const m of media){
   if(m.path&&!m.legacy_url)add("gdv_media",m.id,m.owner_id,"community-media",m.path,()=>db.from("gdv_media").update({legacy_url:currentUrl,path:null}).eq("id",m.id).eq("path",m.path).select("id"),1);
  }
  for(const i of logos){
   if(i.logo_path&&!isR2(i.logo_url))add("gdv_friendly_institutions",i.id,user.id,"institution-logos",i.logo_path,()=>db.from("gdv_friendly_institutions").update({logo_url:currentUrl}).eq("id",i.id).eq("logo_path",i.logo_path).select("id"),2);
  }
  for(const g of galeria){
   if(g.archivo&&!isR2(g.archivo))add("galeria",String(g.id),g.user_id,"hangar-fotos",g.archivo,()=>db.from("galeria").update({archivo:currentUrl}).eq("id",g.id).eq("archivo",g.archivo).select("id"),3);
  }
  for(const a of aportes){
   if(a.storage_path&&!isR2(a.storage_path))add("aportes_adjuntos",String(a.id),a.user_id,"aportes",a.storage_path,()=>db.from("aportes_adjuntos").update({storage_path:currentUrl}).eq("id",a.id).eq("storage_path",a.storage_path).select("id"),4);
  }
  for(const av of avatars){
   const obj=storagePathFromURL(av.avatar_url||"");
   if(obj&&validExt[ext(obj.path)])add("profiles",av.id,av.id,obj.bucket,obj.path,()=>db.from("profiles").update({avatar_url:currentUrl}).eq("id",av.id).eq("avatar_url",av.avatar_url).select("id"),4);
  }
  for(const c of clasificados){
   for(const oldUrl of c.fotos||[]){
    const obj=storagePathFromURL(oldUrl);
    if(obj&&validExt[ext(obj.path)])add("clasificados",String(c.id),c.user_id,obj.bucket,obj.path,async()=>{
      const updated=[...(c.fotos||[])].map((v:string)=>v===oldUrl?currentUrl:v);
      return db.from("clasificados").update({fotos:updated}).eq("id",c.id).select("id")
    },5);
   }
  }
  for(const t of travesias){
   for(const campo of ["fotos","videos"]){
    for(const oldUrl of t[campo]||[]){
     const obj=storagePathFromURL(oldUrl);
     if(obj&&validExt[ext(obj.path)])add("travesias",String(t.id),t.user_id,obj.bucket,obj.path,async()=>{
       const updated=[...(t[campo]||[])].map((v:string)=>v===oldUrl?currentUrl:v);
       return db.from("travesias").update({[campo]:updated}).eq("id",t.id).select("id")
     },5);
    }
   }
  }
  tasks.sort((a,b)=>a.priority-b.priority);
  if(body.action==="inventory")return reply(origin,200,{pending:tasks.length,bySection:tasks.reduce((o:any,t)=>{o[t.table]=(o[t.table]||0)+1;return o},{})});
  let currentUrl="";
  let migrated=0;
  const completed:any[]=[];
  for(const task of tasks.slice(0,limit)){
   try{
    const source=await db.storage.from(task.bucketName).download(task.source);
    if(source.error||!source.data)throw new Error("No se pudo descargar el archivo original");
    const bytes=new Uint8Array(await source.data.arrayBuffer());
    if(bytes.length===0||bytes.length>45*1024*1024)throw new Error("Tamaño original no admitido");
    const spec=validExt[ext(task.source)];
    if(!spec)throw new Error("Formato no admitido");
    const key=spec[1]+"/"+(task.owner||user.id)+"/"+crypto.randomUUID()+"."+(ext(task.source)==="jpeg"?"jpg":ext(task.source));
    currentUrl=base+key;
    await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:spec[0]}));
    const verified=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
    if(Number(verified.ContentLength)!==bytes.length)throw new Error("Copia sin verificar");
    const receipt=await db.from("r2_migration_log").upsert({
      source_table:task.table,record_id:task.id,source_bucket:task.bucketName,source_path:task.source,
      r2_key:key,r2_url:currentUrl,size_bytes:bytes.length
    },{onConflict:'source_table,record_id,source_bucket,source_path'});
    if(receipt.error)throw new Error("No se pudo registrar auditoría: "+receipt.error.message);
    const res=await task.update();
    if(res.error||!res.data?.length)throw new Error("No se pudo actualizar referencia");
    migrated++;
    completed.push({section:task.table,bytes:bytes.length});
   }catch(e){errors.push(task.table+"/"+task.id+": "+(e instanceof Error?e.message:"Error desconocido"))}
  }
  return reply(origin,200,{migrated,pendingBefore:tasks.length,remainingEstimate:Math.max(0,tasks.length-migrated),completed,errors});
 }catch(e){console.error("r2 migration",e instanceof Error?e.message:"error");return reply(origin,500,{error:"No se pudo completar el lote de migración",errors})}
});
