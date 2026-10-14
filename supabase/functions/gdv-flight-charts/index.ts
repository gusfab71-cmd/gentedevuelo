import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
};
function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{...cors,
    "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}
function readKey(key:string):string{
  try{return JSON.parse(Deno.env.get(key)||"{}")?.default||"";}catch{return "";}
}
const products:Record<string,{product:string;title:string}>={
  surface:{product:"medium-mslp-wind850",title:"Isobaras y viento a 850 hPa"},
  height:{product:"medium-z500-t850",title:"Topografía de 500 hPa y temperatura a 850 hPa"}
};
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Método no permitido."},405);
  const token=req.headers.get("authorization")||"";
  if(!token.startsWith("Bearer "))return json({error:"Iniciá sesión como administrador."},401);
  const url=Deno.env.get("SUPABASE_URL")||"";
  const anon=readKey("SUPABASE_PUBLISHABLE_KEYS")||Deno.env.get("SUPABASE_ANON_KEY")||"";
  const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||readKey("SUPABASE_SECRET_KEYS");
  if(!url||!anon||!secret)return json({error:"Configuración de permisos no disponible."},503);
  try{
    const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:identity,error:authError}=await auth.auth.getUser(token.slice(7));
    if(authError||!identity?.user?.id)return json({error:"Sesión vencida."},401);
    const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:admin,error:dbError}=await db.from("site_admins").select("user_id")
      .eq("user_id",identity.user.id).maybeSingle();
    if(dbError)return json({error:"No se pudieron validar los permisos."},503);
    if(!admin)return json({error:"Consulta reservada a la administración."},403);
    let input:unknown;
    try{input=await req.json();}catch{return json({error:"Datos de consulta inválidos."},400);}
    const chart=(input as {chart?:unknown})?.chart;
    if(typeof chart!=="string"||!Object.prototype.hasOwnProperty.call(products,chart))
      return json({error:"Seleccioná una carta disponible."},400);
    const selection=products[chart];
    const endpoint=new URL("https://charts.ecmwf.int/opencharts-api/v1/products/"+selection.product+"/");
    endpoint.searchParams.set("projection","opencharts_south_america");
    const response=await fetch(endpoint,{headers:{"Accept":"application/json"},
      signal:AbortSignal.timeout(16000)});
    if(!response.ok)return json({error:"La API oficial de ECMWF no respondió ("+response.status+"). Abrí la carta en ECMWF."},502);
    const result=await response.json();
    const candidate=result?.data?.link?.href;
    const description=typeof result?.data?.attributes?.description==="string"?
      result.data.attributes.description.slice(0,480):"";
    if(typeof candidate!=="string")return json({error:"ECMWF no proporcionó una imagen para esta carta."},502);
    const image=new URL(candidate);
    if(image.origin!=="https://charts.ecmwf.int"||!/^\/content\/[A-Za-z0-9._-]+\.png$/.test(image.pathname)||
      image.search||image.hash)
      return json({error:"ECMWF no devolvió una imagen verificable."},502);
    // Nunca presentar por error un mapa de Europa como si cubriera Argentina.
    if(!/South America|Am[eé]rica del Sur|Sudam[eé]rica/i.test(description))
      return json({error:"La API no confirmó que la carta corresponde a Sudamérica. Abrila en ECMWF."},502);
    const base=description.match(/Base time:\s*(.+?)\s+Valid time:/i)?.[1]||"";
    const baseTimestamp=Date.parse(base);
    if(!Number.isFinite(baseTimestamp)||Math.abs(Date.now()-baseTimestamp)>96*3600000)
      return json({error:"La fecha de emisión de la carta no pudo verificarse como reciente. Consultá ECMWF directamente.",description},502);
    return json({ok:true,chart,image_url:image.href,title:selection.title,
      description,provider:"ECMWF OpenCharts",checked_at_utc:new Date().toISOString(),
      source_url:"https://charts.ecmwf.int/products/"+selection.product+
      "?projection=opencharts_south_america"});
  }catch(e){
    console.error("gdv-flight-charts",e instanceof Error?e.name:"error");
    return json({error:"No fue posible obtener la carta oficial. Abrí la fuente ECMWF."},503);
  }
});