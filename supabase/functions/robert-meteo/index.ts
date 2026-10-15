import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const OFFICIAL = {
  pronarea: "https://www.smn.gob.ar/pronarea",
  metar: "https://www.smn.gob.ar/metar",
  taf: "https://www.smn.gob.ar/taf",
  sigmet: "https://www.smn.gob.ar/mensajes-sigmet",
  cartas: "https://www.smn.gob.ar/cartas-de-tiempo-significativo-sfcfl250",
  notam: "https://ais.anac.gob.ar/notam"
};
function send(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
function envDefault(key: string): string {
  try { return JSON.parse(Deno.env.get(key) || "{}")?.default || ""; }
  catch { return ""; }
}
function limited(text: string): string {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  return words.length <= 20 ? words.join(" ") : words.slice(0, 20).join(" ").replace(/[,:;—–-]+$/u, "") + "…";
}
function outputText(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts: string[] = [];
  for (const item of data?.output || []) {
    if (item?.type !== "message") continue;
    for (const p of item?.content || []) {
      if (p?.type === "output_text" && typeof p?.text === "string") parts.push(p.text);
    }
  }
  return parts.join(" ");
}
async function fetchBulletin(product: "metar" | "taf", icao: string) {
  const url = new URL("https://aviationweather.gov/api/data/" + product);
  url.searchParams.set("ids", icao);
  url.searchParams.set("format", "raw");
  const response = await fetch(url, {
    headers: { "Accept": "text/plain", "User-Agent": "GenteDeVuelo/1.0 (gentedevuelo@gmail.com)" },
    signal: AbortSignal.timeout(10000)
  });
  if (response.status === 204) return { available: false, raw: "", error: "Sin boletín disponible" };
  if (!response.ok) return { available: false, raw: "", error: "Fuente meteorológica HTTP " + response.status };
  const raw = (await response.text()).trim().slice(0, 3500);
  if (!raw || /^(no data|no reports|not found)/i.test(raw)) {
    return { available: false, raw: "", error: "Sin boletín disponible" };
  }
  return { available: true, raw, error: null };
}

const FIR_NAMES: Record<string,string> = {
  SAEF: "EZEIZA", SACF: "CORDOBA", SAMF: "MENDOZA", SARR: "RESISTENCIA", SAVF: "COMODORO RIVADAVIA"
};
const NOAA_API = "https://aviationweather.gov/api/data/";
type Report = { available: boolean; raw: string; error: string | null };
type FirSigmet = {
  fir: string; fir_name: string; available: boolean; raw: string;
  error: string | null; status: string; matched_count: number;
  verified_time: boolean; warning: string;
};
async function fetchInternationalSigmets(firs: string[]): Promise<FirSigmet[]> {
  const warning="Consulta complementaria SIGMET de NOAA/AWC (API unificada), no exhaustiva para Argentina. Un aviso encontrado en una FIR no necesariamente afecta tu ruta, horario o altitud. Verificá siempre los avisos oficiales del SMN.";
  const empty=(fir:string,status:string,error:string|null=null):FirSigmet=>({
    fir,fir_name:FIR_NAMES[fir],available:false,raw:"",error,status,
    matched_count:0,verified_time:false,warning
  });
  let response:Response;
  try {
    // NOAA/AWC 4.34 (octubre 2026) unificó SIGMET domésticos e internacionales.
    // /isigmet quedó obsoleto: usar /sigmet y filtrar FIR argentinas.
    response=await fetch(NOAA_API+"sigmet?format=json",{
      headers:{"Accept":"application/json","User-Agent":"GenteDeVuelo/1.0 (gentedevuelo@gmail.com)"},
      signal:AbortSignal.timeout(11000)
    });
  }catch{
    return firs.map(fir=>empty(fir,"error_fuente","No se pudo contactar la fuente internacional."));
  }
  if(response.status===204)return firs.map(fir=>empty(fir,"sin_coincidencias_no_concluyente"));
  if(!response.ok)return firs.map(fir=>empty(fir,"error_fuente","Servicio internacional HTTP "+response.status));
  let data:unknown;
  try { data=await response.json(); } catch {
    return firs.map(fir=>empty(fir,"error_fuente","No se pudieron interpretar los datos."));
  }
  // /sigmet devuelve normalmente una lista JSON; tolerar contenedores
  // estandarizados sin aceptar objetos de error como datos meteorológicos.
  const reports=Array.isArray(data)?data:
    data&&typeof data==="object"&&Array.isArray((data as any).features)
      ?(data as any).features
      :data&&typeof data==="object"&&Array.isArray((data as any).data)
        ?(data as any).data:null;
  if(!reports)return firs.map(fir=>empty(fir,"error_fuente","Formato SIGMET inesperado de la fuente NOAA."));
  const now=Date.now();
  const parseTime=(v:unknown):number|null=>{
    if(typeof v==="number"&&Number.isFinite(v))return v<10000000000?v*1000:v;
    if(typeof v==="string"&&v.trim()){
      const t=Date.parse(v);return Number.isFinite(t)?t:null;
    }
    return null;
  };
  return firs.map(fir=>{
    const name=FIR_NAMES[fir];
    const expression=new RegExp("\\b(?:"+fir+"|"+name.replace(/ /g,"\\s+")+")\\b","i");
    const found:string[]=[];
    for(const entry of reports){
      if(!entry||typeof entry!=="object")continue;
      const item=entry.properties&&typeof entry.properties==="object"?entry.properties:entry;
      const raw=[item.rawSigmet,item.rawSIGMET,item.rawText,item.raw,item.text]
        .find((v:unknown)=>typeof v==="string"&&v.trim())||"";
      if(typeof raw!=="string"||!raw.trim())continue;
      // En los reportes internacionales el código FIR puede llegar como
      // icaoId (formato NOAA actual), además de firId/fir/firICAO.
      const scope=raw+"\n"+[
        item.icaoId,item.firId,item.fir,item.firName,item.firICAO,
        item.firIcao,item.flightInformationRegion
      ].filter((v:unknown)=>typeof v==="string").join(" ");
      if(!expression.test(scope))continue;
      const from=parseTime(item.validTimeFrom??item.validFrom??item.validStart??item.valid_time_from);
      const until=parseTime(item.validTimeTo??item.validTo??item.validEnd??item.valid_time_to);
      if(from===null||until===null||from>now||now>=until)continue;
      if(!found.includes(raw.slice(0,1500)))found.push(raw.slice(0,1500));
      if(found.length>=8)break;
    }
    return {
      fir,fir_name:name,available:found.length>0,
      raw:found.join("\n\n").slice(0,4800),error:null,
      status:found.length?"coincidencias_vigentes_parciales":"sin_coincidencias_no_concluyente",
      matched_count:found.length,verified_time:found.length>0,warning
    };
  });
}


function describeAvailableWeather(
  icao: string, question: string, metar: Report,
  taf: Report, sigmet: { available: boolean; raw: string; matched_count: number }
): string {
  const q = (question || "").toLocaleLowerCase("es-AR");
  const aboutSigmet = /\bsigmet\b|torment|engelam|hielo|fen[oó]men/.test(q);
  const aboutTaf = /\btaf\b|pron[oó]stic|tendencia|ma[nñ]ana|cambio\s+de\s+tiempo/.test(q);
  const aboutRunway = /cruzado|pista|componente/.test(q);
  if (aboutRunway) return "Para calcular viento cruzado necesito rumbo de pista y direcciones en igual referencia angular.";
  if (aboutSigmet) {
    if (!sigmet.available) return "Sin SIGMET confirmado por esta búsqueda parcial; no significa que no existan. Verificá el SMN.";
    // Nunca se presenta un SIGMET para la FIR como si necesariamente afectara al aeródromo.
    return limited("Hay " + sigmet.matched_count + " SIGMET recuperados para la FIR; verificá sectores, niveles, vigencia y fuente oficial.");
  }
  if (aboutTaf) {
    return taf.available
      ? "TAF recuperado: revisá períodos BECMG, TEMPO, PROB y vigencia. Para análisis detallado, habilitá interpretación IA."
      : "No hay TAF confirmado para este aeródromo. Verificá en el SMN.";
  }
  if (!metar.available || !metar.raw) {
    return "METAR no disponible: no puedo confirmar viento, visibilidad ni nubosidad. Consultá la fuente oficial.";
  }
  // Los campos se extraen únicamente del METAR observado, nunca del TAF ni de la FIR.
  const line = metar.raw.split(/\r?\n/).find(l => /\b(?:METAR|SPECI)\b/.test(l)) || metar.raw.split(/\r?\n/)[0];
  const wind = line.match(/\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/i);
  const visibility = /\bCAVOK\b/.test(line) ? "CAVOK"
    : /\b9999\b/.test(line) ? "≥10 km"
    : (() => {
        // Después del grupo de viento, la visibilidad principal suele ser de cuatro dígitos.
        const afterWind = wind ? line.slice((wind.index || 0) + wind[0].length) : "";
        const match = afterWind.match(/(?:^|\s)(\d{4})(?:\s|$)/);
        return match ? String(Number(match[1])) + " m" : "no identificada";
      })();
  const cloud = [...line.matchAll(/\b(FEW|SCT|BKN|OVC|VV)(\d{3})(?:CB|TCU)?\b/g)][0];
  const temperature = line.match(/\s(M?\d{2})\/(M?\d{2})\s/);
  const qnh = line.match(/\bQ(\d{4})\b/);
  const askTemperature = /temperatur|roc[ií]o|qnh|presi[oó]n/.test(q);
  const askWind = /viento|direcci[oó]n|nudo/.test(q);
  const askClouds = /nube|nubos|techo|cielo/.test(q);
  const askVisibility = /visibilidad|vis\b/.test(q);
  const askAnything = !askWind && !askVisibility && !askClouds && !askTemperature;
  const fields: string[] = [];
  if (wind && (askWind || askAnything)) {
    const heading = wind[1].toUpperCase() === "VRB" ? "variable" : wind[1] + "°";
    fields.push("viento " + heading + "/" + Number(wind[2]) + " kt" + (wind[3] ? " (ráfagas " + Number(wind[3]) + ")" : ""));
  }
  if (askVisibility || askAnything) fields.push("visibilidad " + visibility);
  if (askClouds || askAnything) {
    fields.push(cloud ? "nubes " + cloud[1] + " a " + (Number(cloud[2]) * 100).toLocaleString("es-AR") + " pies AGL"
      : /\b(?:CAVOK|SKC|NSC|NCD)\b/.test(line) ? "sin capas significativas informadas"
      : "nubosidad no identificada");
  }
  if (askTemperature && temperature) {
    const temp = temperature[1].replace("M", "-");
    const dew = temperature[2].replace("M", "-");
    fields.push("temperatura " + Number(temp) + "°C", "rocío " + Number(dew) + "°C");
  }
  if (askTemperature && qnh) fields.push("QNH " + Number(qnh[1]) + " hPa");
  return limited(icao + ": " + (fields.length ? fields.join("; ") : "METAR recuperado, sin valores identificables.") + ".");
}


Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return send({ error: "Método no permitido." }, 405);
  const bearer = request.headers.get("Authorization") || "";
  if (!bearer.startsWith("Bearer ")) return send({ error: "Iniciá sesión para consultar a Shimoda." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publicKey = envDefault("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const privateKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || envDefault("SUPABASE_SECRET_KEYS");
  if (!supabaseUrl || !publicKey || !privateKey) return send({ error: "Configuración interna incompleta." }, 503);

  const publicClient = createClient(supabaseUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await publicClient.auth.getUser(bearer.slice(7));
  if (identityError || !identity?.user?.id) return send({ error: "Tu sesión venció. Volvé a ingresar." }, 401);

  const adminClient = createClient(supabaseUrl, privateKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Mesa de Vuelo: acceso reservado al administrador también del lado del servidor.
  const { data: admin, error: adminError } = await adminClient.from("site_admins")
    .select("user_id").eq("user_id", identity.user.id).maybeSingle();
  if (adminError) return send({ error: "No se pudo validar el permiso de administrador." }, 503);
  if (!admin) return send({ error: "La Mesa de Vuelo está reservada para pruebas privadas del administrador." }, 403);

  // Esta función solo consulta boletines; funciona sin habilitar la IA de Shimoda.

  let icao = "";
  let question = "";
  let fir = "";
  let requestedFirs:string[]=[];
  let skipSigmet=false;
  let sigmetOnly=false;

  try {
    const input = await request.json();
    icao = typeof input?.icao === "string" ? input.icao.trim().toUpperCase() : "";
    question = typeof input?.question === "string" ? input.question.trim() : "";
    fir = typeof input?.fir === "string" ? input.fir.trim().toUpperCase() : "";
    skipSigmet=input?.skip_sigmet===true;
    sigmetOnly=input?.sigmet_only===true;
    if(input?.firs!==undefined){
      if(!Array.isArray(input.firs)||input.firs.length<1||input.firs.length>5||
        input.firs.some((f:unknown)=>typeof f!=="string"||!Object.prototype.hasOwnProperty.call(FIR_NAMES,f))||
        new Set(input.firs).size!==input.firs.length)
        return send({error:"Seleccioná de una a cinco FIR válidas, sin repetir."},400);
      requestedFirs=input.firs;
    }
    if (input?.use_ai === true) return send({ error: "El análisis con IA se solicita únicamente al final de Mesa de Vuelo." }, 400);
  } catch { return send({ error: "Solicitud inválida." }, 400); }
  if (!sigmetOnly && !/^SA[A-Z]{2}$/.test(icao)) return send({ error: "Ingresá un código OACI argentino de cuatro letras, como SAEZ o SABE." }, 400);
  if (question.length > 220) return send({ error: "La consulta no puede superar 220 caracteres." }, 400);


  if (!Object.prototype.hasOwnProperty.call(FIR_NAMES,fir)) {
    return send({error:"Seleccioná explícitamente la FIR: Ezeiza, Córdoba, Mendoza, Resistencia o Comodoro Rivadavia."},400);
  }
  if(!requestedFirs.length)requestedFirs=[fir];
  const fetchedAt = new Date().toISOString();
  // SIGMET pertenece a la FIR, no a un aeródromo: permitir consultar las FIR
  // sin exigir los tres códigos OACI ni esperar a las consultas METAR/TAF.
  if(sigmetOnly){
    const sigmets_by_fir=await fetchInternationalSigmets(requestedFirs);
    return send({
      ok:true,consulted_at_utc:fetchedAt,
      source:"NOAA Aviation Weather Center (consulta internacional parcial)",
      sigmets_by_fir,
      warning:"Sin coincidencias en NOAA/AWC no confirma ausencia de SIGMET. Corroborá en el SMN."
    });
  }
  const [metarResult,tafResult,sigmetResult]=await Promise.allSettled([
    fetchBulletin("metar",icao),fetchBulletin("taf",icao),skipSigmet?Promise.resolve([] as FirSigmet[]):fetchInternationalSigmets(requestedFirs)
  ]);
  const product=(result:PromiseSettledResult<Report>):Report=>
    result.status==="fulfilled"?result.value:{available:false,raw:"",error:"La consulta a la fuente falló"};
  const metar=product(metarResult as PromiseSettledResult<Report>);
  const taf=product(tafResult as PromiseSettledResult<Report>);
  const sigmets_by_fir:FirSigmet[]=sigmetResult.status==="fulfilled"?sigmetResult.value:
    requestedFirs.map(f=>({
      fir:f,fir_name:FIR_NAMES[f],available:false,raw:"",
      error:"No se pudo consultar el servicio NOAA/AWC SIGMET",
      status:"error_fuente",matched_count:0,verified_time:false,
      warning:"La búsqueda NOAA/AWC de SIGMET es complementaria y no sustituye al SMN."
    }));
  const sigmet=sigmets_by_fir[0]??{
    fir,fir_name:FIR_NAMES[fir],available:false,raw:"",error:null,
    status:"consulta_omitida",matched_count:0,verified_time:false,
    warning:"La consulta de SIGMET se efectúa por separado para las FIR seleccionadas."
  };
  const pronarea={
    available:false,raw:"",status:"pendiente_integracion_oficial",
    error:null,source:"Servicio Meteorológico Nacional",
    url:OFFICIAL.pronarea,
    note:"Sin alimentación automática verificada. No se utiliza el PRONAREA antiguo de prueba."
  };
  const notam={
    available:false,raw:"",status:"pendiente_integracion_oficial",
    error:null,source:"ANAC AIS / EANA NOF",
    url:OFFICIAL.notam,
    note:"Sin alimentación automática verificada. Consultá el servicio oficial y la oficina ARO-AIS."
  };
  const sources=[
    ...(metar.available?[{product:"METAR",name:"NOAA Aviation Weather Center",url:"https://aviationweather.gov/data/api/"}]:[]),
    ...(taf.available?[{product:"TAF",name:"NOAA Aviation Weather Center",url:"https://aviationweather.gov/data/api/"}]:[]),
    ...(sigmets_by_fir.some(x=>x.available)?[{product:"SIGMET (búsqueda parcial)",name:"NOAA Aviation Weather Center (API unificada)",url:"https://aviationweather.gov/data/api/"}]:[])
  ];
  const answer = describeAvailableWeather(icao, question, metar, taf, sigmet);
  const interpretationAvailable = false;
  const aiUsed = false;
  // Consulta gratuita: jamás invocar OpenAI desde este endpoint.
  return send({
    ok:true,icao,fir,fir_name:FIR_NAMES[fir],
    consulted_at_utc:fetchedAt,
    source:"NOAA Aviation Weather Center: redistribución aeronáutica, no API directa del SMN",
    metar,taf,sigmet,sigmets_by_fir,pronarea,notam,
    answer:limited(answer),interpretation_available:interpretationAvailable,
    ai_used:aiUsed,answer_mode:aiUsed?"ia_opcional":"resumen_automatico_sin_ia",
    complete_flight_briefing:false,source_verified_as_current:false,
    available_products:sources.map(x=>x.product),
    warning:"No es un briefing operacional. Faltan PRONAREA y NOTAM automatizados; el SIGMET es parcial. Verificá productos oficiales, FIR, ruta, fecha y niveles de vuelo.",
    official_links:OFFICIAL,sources
  });

});
