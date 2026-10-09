"use strict";
(function(){
 const max={"image/jpeg":4*1024*1024,"image/png":4*1024*1024,"image/webp":4*1024*1024,
 "video/mp4":40*1024*1024,"video/webm":40*1024*1024,"video/quicktime":40*1024*1024,
 "application/pdf":15*1024*1024};
 const prefix="https://media.gentedevuelo.com/";
 async function upload(file,client,apiUrl,apiKey){
  if(!file||!max[file.type]||file.size<1||file.size>max[file.type])throw new Error("El archivo no tiene un formato o tamaño permitido.");
  const sessionResult=await client.auth.getSession();
  const session=sessionResult.data?.session;
  if(sessionResult.error||!session?.access_token)throw new Error("La sesión venció. Volvé a ingresar.");
  const endpoint=apiUrl.replace(/\/$/,"")+"/functions/v1/r2-media";
  async function call(body){
   const response=await fetch(endpoint,{method:"POST",headers:{"Authorization":"Bearer "+session.access_token,"apikey":apiKey,"Content-Type":"application/json"},body:JSON.stringify(body)});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"No se pudo conectar con Cloudflare R2.");
   return data;
  }
  const prepared=await call({action:"prepare",contentType:file.type,size:file.size});
  const allowedPath=/^(imagenes|videos|documentos)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm|mov|pdf)$/;
  if(!allowedPath.test(prepared.path)||prepared.path.split("/")[1]!==session.user.id||prepared.url!==prefix+prepared.path)throw new Error("Ruta de carga inválida.");
  let put=null;
  try{put=await fetch(prepared.uploadUrl,{method:"PUT",headers:{"Content-Type":file.type},body:file})}
  catch(error){console.warn("La subida directa a R2 no respondió; se comprobará el archivo y se intentará la vía alternativa.")}
  if(put?.ok){
   const done=await call({action:"finish",path:prepared.path,contentType:file.type});
   if(done.url!==prepared.url)throw new Error("Cloudflare no confirmó la ruta del archivo.");
   return {url:done.url,path:done.path,size:done.size};
  }
  // Un error de CORS puede ocultar un PUT exitoso; evitar duplicar la carga si ya llegó.
  try{
   const done=await call({action:"finish",path:prepared.path,contentType:file.type});
   if(done.url===prepared.url)return {url:done.url,path:done.path,size:done.size};
  }catch(_){}
  const fallback=await fetch(endpoint,{method:"POST",headers:{"Authorization":"Bearer "+session.access_token,"apikey":apiKey,"Content-Type":file.type,"x-gdv-direct-upload":"1"},body:file});
  const recovered=await fallback.json().catch(()=>({}));
  if(!fallback.ok)throw new Error(recovered.error||"No se pudo cargar el archivo por ninguno de los dos métodos de Cloudflare.");
  if(!allowedPath.test(recovered.path)||recovered.path.split("/")[1]!==session.user.id||recovered.url!==prefix+recovered.path)
   throw new Error("La copia alternativa devolvió una ruta no válida.");
  return recovered;
 }
 async function setupCors(client,apiUrl,apiKey){
  const s=await client.auth.getSession(),token=s.data?.session?.access_token;
  if(!token)throw new Error("Iniciá sesión como administrador.");
  const response=await fetch(apiUrl.replace(/\/$/,"")+"/functions/v1/r2-media",{method:"POST",headers:{"Authorization":"Bearer "+token,apikey:apiKey,"Content-Type":"application/json"},body:JSON.stringify({action:"setup-cors"})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"No se pudo configurar Cloudflare.");
  return data;
 }
 window.GDV_R2_MEDIA={upload,setupCors,isR2:(v)=>typeof v==="string"&&v.startsWith(prefix),prefix};
})();
