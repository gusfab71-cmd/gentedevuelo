import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// Buscador geográfico de un SOLO módulo: Pistas y Aeródromos.
// La API pública de Nominatim no admite autocompletado; cada consulta requiere Enter/Buscar.
// Gate centralizado y caché SQL protegen el límite TOTAL de toda la web (0,45 rps).
const allowedOrigins=new Set([
  "https://gentedevuelo.com",
  "https://www.gentedevuelo.com",
  "https://gentedevuelo.vercel.app"
]);
const upstream="https://nominatim.openstreetmap.org/search";
const cacheHours=24*7;
const gateMs=2200;
const headers=(origin:string|null)=>({
 "Access-Control-Allow-Origin":origin&&allowedOrigins.has(origin)?origin:"https://gentedevuelo.com",
 "Access-Control-Allow-Methods":"GET, OPTIONS",
 "Access-Control-Allow-Headers":"authorization, apikey, content-type",
 "Access-Control-Max-Age":"3600",
 "Vary":"Origin",
 "Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff"
});
function reply(origin:string|null,status:number,body:unknown,extra:Record<string,string>={}){
 return new Response(JSON.stringify(body),{status,headers:{...headers(origin),...extra,"Content-Type":"application/json; charset=utf-8"}});
}
function sanitize(raw:string){
 const text=raw.normalize("NFKC").trim().replace(/\s+/g," ");
 if(text.length<2||text.length>100||/[\x00-\x1f<>]/.test(text))return null;
 return text;
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=="GET")return reply(origin,405,{ok:false,error:"Método no permitido."});
 if(origin&&!allowedOrigins.has(origin))return reply(origin,403,{ok:false,error:"Origen no permitido."});
 const url=new URL(req.url);
 const q=sanitize(url.searchParams.get("q")||"");
 if(!q)return reply(origin,400,{ok:false,error:"Ingresá una localidad válida (2 a 100 caracteres)."});
 // El anon JWT del sitio se verifica por Supabase (verify_jwt=true).
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const databaseUrl=Deno.env.get("SUPABASE_URL")||"";
 if(!serviceKey||!databaseUrl)return reply(origin,503,{ok:false,error:"Buscador no configurado."});
 const db=createClient(databaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const key=q.toLocaleLowerCase("es-AR");
 const now=new Date();
 const {data:hit,error:cacheError}=await db.from("airstrip_geocode_cache")
   .select("results,expires_at").eq("query",key).gt("expires_at",now.toISOString()).maybeSingle();
 if(cacheError){
  console.error("Cache SQL no disponible:",cacheError.code);
  return reply(origin,503,{ok:false,error:"Buscador temporalmente no disponible."});
 }
 if(hit)return reply(origin,200,{ok:true,places:hit.results,source:"Nominatim / OpenStreetMap",cached:true});
 // UPDATE condicional atómico: solo UNA ejecución de todas las instancias obtiene autorización.
 const cutoff=new Date(now.getTime()-gateMs).toISOString();
 const {data:gate,error:gateError}=await db.from("airstrip_geocode_gate")
   .update({last_call_at:now.toISOString()})
   .eq("id",1).lte("last_call_at",cutoff).select("id").maybeSingle();
 if(gateError){
  console.error("Límite global no disponible:",gateError.code);
  return reply(origin,503,{ok:false,error:"Buscador temporalmente no disponible."});
 }
 if(!gate)return reply(origin,429,{ok:false,error:"El buscador recibió consultas recientes. Probá nuevamente en unos segundos."},{"Retry-After":"3"});
 const upstreamURL=new URL(upstream);
 upstreamURL.searchParams.set("q",q);
 upstreamURL.searchParams.set("format","jsonv2");
 upstreamURL.searchParams.set("limit","5");
 upstreamURL.searchParams.set("addressdetails","0");
 upstreamURL.searchParams.set("countrycodes","ar");
 let response:Response;
 try{
  response=await fetch(upstreamURL.toString(),{
   headers:{
    "Accept":"application/json",
    "Accept-Language":"es",
    "User-Agent":"GenteDeVuelo-AirstripMap/1.0 (+https://gentedevuelo.com; gentedevuelo@gmail.com)",
    "Referer":"https://gentedevuelo.com/utilidades/pistas-no-oficiales.html"
   },
   signal:AbortSignal.timeout(9500)
  });
 }catch(error){
  console.error("Nominatim red:",error instanceof Error?error.name:"red");
  return reply(origin,503,{ok:false,error:"No se pudo conectar al geocodificador. Probá más tarde o usá coordenadas."});
 }
 if(!response.ok){
  return reply(origin,response.status===429?429:503,{
   ok:false,error:response.status===429?"Nominatim limitó las consultas. Intentá nuevamente más tarde.":"No se obtuvo respuesta de Nominatim."
  },response.status===429?{"Retry-After":"30"}:{});
 }
 let raw:unknown;
 try{raw=await response.json()}catch(_){
  return reply(origin,502,{ok:false,error:"El geocodificador devolvió un formato no reconocido."});
 }
 if(!Array.isArray(raw))return reply(origin,502,{ok:false,error:"Respuesta inesperada del geocodificador."});
 const places: {lat:number;lon:number;label:string;zoom:number}[]=[];
 const seen=new Set<string>();
 for(const row of raw.slice(0,5)){
  if(!row||typeof row!=="object")continue;
  const p=row as Record<string,unknown>;
  const lat=Number(p.lat),lon=Number(p.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -56||lat > -21||lon < -74||lon > -53)continue;
  const label=String(p.display_name||"").trim().slice(0,240);
  if(!label||seen.has(label))continue;
  seen.add(label);
  const type=String(p.type||"");
  const zoom=["house","building","residential","street"].includes(type)?15:
   ["village","hamlet","neighbourhood"].includes(type)?14:
   ["city","town","municipality"].includes(type)?12:11;
  places.push({lat,lon,label,zoom});
 }
 const expires=new Date(Date.now()+cacheHours*3600000).toISOString();
 // Caché persistente compartida entre usuarios para evitar consultas repetidas.
 const {error:putError}=await db.from("airstrip_geocode_cache")
   .upsert({query:key,results:places,expires_at:expires,created_at:new Date().toISOString()},{onConflict:"query"});
 if(putError)console.error("Error caché geocodificación:",putError.code);
 return reply(origin,200,{ok:true,places,source:"Nominatim / OpenStreetMap",cached:false});
});
