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
async function fetchInternationalSigmet(fir: string): Promise<{
  available:boolean;raw:string;error:string|null;status:string;matched_count:number;
  verified_time:boolean;warning:string;
}> {
  const warning = "Búsqueda internacional complementaria; no garantiza cobertura total de SIGMET para la FIR. Verificá siempre el SMN.";
  const url = NOAA_API + "isigmet?format=json";
  const response = await fetch(url, {
    headers: { "Accept":"application/json", "User-Agent":"GenteDeVuelo/1.0 (gentedevuelo@gmail.com)" },
    signal: AbortSignal.timeout(11000)
  });
  if (response.status === 204) return {
    available:false,raw:"",error:null,status:"sin_coincidencias_no_concluyente",
    matched_count:0,verified_time:false,warning
  };
  if (!response.ok) return {
    available:false,raw:"",error:"Servicio internacional HTTP "+response.status,
    status:"error_fuente",matched_count:0,verified_time:false,warning
  };
  // AWC limita los resultados y no ofrece, en esta integración, una verificación exhaustiva por FIR.
  const data = await response.json();
  if (!Array.isArray(data)) return {
    available:false,raw:"",error:"Formato SIGMET no reconocido",
    status:"error_fuente",matched_count:0,verified_time:false,warning
  };
  const name = FIR_NAMES[fir];
  const phrase = name.replace(/ /g,"\\s+");
  const expression = new RegExp("\\b(?:"+fir+"|"+phrase+")\\b","i");
  const now=Date.now();
  const parseTime=(v:any):number|null=>{
    if(typeof v==="number"&&Number.isFinite(v)){
      const t=v<10_000_000_000?v*1000:v;
      return Number.isFinite(t)?t:null;
    }
    if(typeof v==="string"&&v.trim()){
      const t=Date.parse(v);
      return Number.isFinite(t)?t:null;
    }
    return null;
  };
  const results:{raw:string;valid:boolean}[]=[];
  for(const item of data) {
    if(!item || typeof item!=="object") continue;
    const raw = [item.rawSigmet,item.rawSIGMET,item.rawText,item.raw].find(x=>typeof x==="string") || "";
    const location=[item.firId,item.fir,item.firName,item.firICAO].filter(x=>typeof x==="string").join(" ");
    if(!expression.test(raw+"\n"+location)) continue;
    const from=parseTime(item.validTimeFrom ?? item.validFrom ?? item.validStart);
    const until=parseTime(item.validTimeTo ?? item.validTo ?? item.validEnd);
    // Vigencia no verificable o vencida: jamás alimentar a Shimoda con su contenido.
    const valid=from!==null && until!==null && from<=now && now<until;
    if(raw.trim() && valid)results.push({raw:raw.slice(0,1500),valid});
    if(results.length>=8)break;
  }
  return {
    available:results.length>0,raw:results.map(x=>x.raw).join("\n\n").slice(0,4800),
    error:null,status:results.length?"coincidencias_vigentes_no_exhaustivas":"sin_coincidencias_no_concluyente",
    matched_count:results.length,verified_time:results.length>0,warning
  };
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

  try {
    const input = await request.json();
    icao = typeof input?.icao === "string" ? input.icao.trim().toUpperCase() : "";
    question = typeof input?.question === "string" ? input.question.trim() : "";
    fir = typeof input?.fir === "string" ? input.fir.trim().toUpperCase() : "";
    if (input?.use_ai === true) return send({ error: "El análisis con IA se solicita únicamente al final de Mesa de Vuelo." }, 400);
  } catch { return send({ error: "Solicitud inválida." }, 400); }
  if (!/^SA[A-Z]{2}$/.test(icao)) return send({ error: "Ingresá un código OACI argentino de cuatro letras, como SAEZ o SABE." }, 400);
  if (question.length > 220) return send({ error: "La consulta no puede superar 220 caracteres." }, 400);


  if (!Object.prototype.hasOwnProperty.call(FIR_NAMES,fir)) {
    return send({error:"Seleccioná explícitamente la FIR: Ezeiza, Córdoba, Mendoza, Resistencia o Comodoro Rivadavia."},400);
  }
  const fetchedAt = new Date().toISOString();
  const [metarResult,tafResult,sigmetResult]=await Promise.allSettled([
    fetchBulletin("metar",icao),fetchBulletin("taf",icao),fetchInternationalSigmet(fir)
  ]);
  const product=(result:PromiseSettledResult<Report>):Report=>
    result.status==="fulfilled"?result.value:{available:false,raw:"",error:"La consulta a la fuente falló"};
  const metar=product(metarResult as PromiseSettledResult<Report>);
  const taf=product(tafResult as PromiseSettledResult<Report>);
  const sigmet=sigmetResult.status==="fulfilled"?sigmetResult.value:{
    available:false,raw:"",error:"No se pudo consultar la fuente internacional",
    status:"error_fuente",matched_count:0,verified_time:false,
    warning:"La consulta SIGMET es complementaria y no sustituye al SMN."
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
    ...(sigmet.available?[{product:"SIGMET (búsqueda parcial)",name:"NOAA Aviation Weather Center",url:"https://aviationweather.gov/data/api/"}]:[])
  ];
  const answer = describeAvailableWeather(icao, question, metar, taf, sigmet);
  const interpretationAvailable = false;
  const aiUsed = false;
  // Consulta gratuita: jamás invocar OpenAI desde este endpoint.
  return send({
    ok:true,icao,fir,fir_name:FIR_NAMES[fir],
    consulted_at_utc:fetchedAt,
    source:"NOAA Aviation Weather Center: redistribución aeronáutica, no API directa del SMN",
    metar,taf,sigmet,pronarea,notam,
    answer:limited(answer),interpretation_available:interpretationAvailable,
    ai_used:aiUsed,answer_mode:aiUsed?"ia_opcional":"resumen_automatico_sin_ia",
    complete_flight_briefing:false,source_verified_as_current:false,
    available_products:sources.map(x=>x.product),
    warning:"No es un briefing operacional. Faltan PRONAREA y NOTAM automatizados; el SIGMET es parcial. Verificá productos oficiales, FIR, ruta, fecha y niveles de vuelo.",
    official_links:OFFICIAL,sources
  });

});
