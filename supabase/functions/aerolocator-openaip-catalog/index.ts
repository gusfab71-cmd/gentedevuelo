// AeroLocator · comprobación privada de OpenAIP.
// No publica credenciales, no devuelve el catálogo ni modifica datos.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ENV_NAME = "OPENAIP_API_KEY";


const ALLOWED_ORIGINS = new Set([
  "https://gentedevuelo.com",
  "https://www.gentedevuelo.com",
  "https://gentedevuelo.vercel.app",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    // Only allowed on our own web origins; remain compatible with Supabase client headers.
    "Access-Control-Allow-Headers": req.headers.get("access-control-request-headers") ??
      "authorization, apikey, x-client-info, content-type, x-supabase-api-version",
    "Access-Control-Max-Age": "3600",
    "Vary": "Origin",
  };
}

function json(status: number, payload: Record<string, unknown>, req: Request) {
  // Diagnostic codes only. Never log API keys, tokens, user data or provider bodies.
  if (status >= 500) {
    const known = new Set([
      "auth_configuration_missing", "auth_unavailable", "authorization_unavailable",
      "openaip_key_not_configured", "openaip_auth_or_service_error",
      "openaip_response_not_json", "openaip_connection_unavailable",
    ]);
    const errorCode = typeof payload.error === "string" && known.has(payload.error)
      ? payload.error : "unexpected_server_error";
    console.warn("aerolocator_openaip_check_failure", errorCode, status);
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(req),
    },
  });
}

// Avoid a synchronous failure on runtimes without AbortSignal.timeout().
function timeoutSignal(milliseconds: number): AbortSignal | undefined {
  return typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(milliseconds) : undefined;
}


type RecordItem = Record<string, unknown>;
const responseCache = new Map<string, { at: number; body: Record<string, unknown> }>();
const asText = (x: unknown, max = 150) => typeof x === "string" ? x.slice(0, max) : "";
const obj = (x: unknown): RecordItem => x && typeof x === "object" && !Array.isArray(x) ? x as RecordItem : {};
const number = (x: unknown) => typeof x === "number" && Number.isFinite(x) ? x : null;
function point(geometry: RecordItem): [number, number] | null {
  if (geometry.type !== "Point" || !Array.isArray(geometry.coordinates)) return null;
  const [lon, lat] = geometry.coordinates;
  return typeof lon === "number" && typeof lat === "number" &&
    Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ?
    [lon, lat] : null;
}
function polygon(geometry: RecordItem): RecordItem | null {
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return null;
  // Bound the JSON and reject invalid/oversized geometry; never try to repair polygons.
  const encoded = JSON.stringify(geometry);
  if (encoded.length > 280000 || encoded.length < 50) return null;
  const coords = geometry.coordinates;
  if (!Array.isArray(coords) || coords.length > 300) return null;
  return { type: geometry.type, coordinates: coords };
}
function normalize(kind: string, data: unknown) {
  const item = obj(data), geom = obj(item.geometry);
  const id = asText(item._id || item.id, 100);
  if (!id || (item.country && item.country !== "AR")) return null;
  if (kind === "airspaces") {
    const shape = polygon(geom);
    if (!shape) return null;
    const lower = obj(item.lowerLimit), upper = obj(item.upperLimit);
    return {
      id, kind, name: asText(item.name) || "Espacio aéreo sin nombre",
      type: number(item.type), icaoClass: number(item.icaoClass),
      geometry: shape,
      lowerLimit: { value: number(lower.value), unit: lower.unit ?? null, referenceDatum: lower.referenceDatum ?? null },
      upperLimit: { value: number(upper.value), unit: upper.unit ?? null, referenceDatum: upper.referenceDatum ?? null },
      byNotam: item.byNotam === true, onRequest: item.onRequest === true,
      remarks: asText(item.remarks, 800),
    };
  }
  const coords = point(geom);
  if (!coords) return null;
  if (kind === "navaids") {
    const frequency = obj(item.frequency);
    return {
      id, kind, name: asText(item.name), ident: asText(item.identifier, 24),
      type: number(item.type), coordinates: coords,
      frequency: { value: number(frequency.value), unit: frequency.unit ?? null },
      channel: asText(item.channel, 25),
      remarks: asText(item.remarks, 500),
    };
  }
  if (kind === "reporting-points") {
    return { id, kind, name: asText(item.name), coordinates: coords,
      compulsory: item.compulsory === true, remarks: asText(item.remarks, 500) };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (!ALLOWED_ORIGINS.has(req.headers.get("origin") ?? "")) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  const respond = (status: number, payload: Record<string, unknown>) => json(status, payload, req);
  if (req.method !== "GET") return respond(405, { ok: false, error: "method_not_allowed" });
  const auth = req.headers.get("authorization") ?? "";
  const tokenMatch = /^Bearer ([^\s]+)$/i.exec(auth);
  if (!tokenMatch) return respond(401, { ok: false, error: "login_required" });

  const projectUrl = Deno.env.get("SUPABASE_URL");
  let publishable = Deno.env.get("SUPABASE_ANON_KEY");
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (typeof keys.default === "string" && keys.default) publishable = keys.default;
  } catch { /* Fallback to legacy anon public key. */ }
  if (!projectUrl || !publishable) return respond(503, { ok: false, error: "auth_configuration_missing" });

  let verifiedUserId: string | null = null;
  // Verify an actual signed-in user; a public anon key is not sufficient.
  let authStage = "construct_url";
  try {
    const authUrl = new URL("/auth/v1/user", projectUrl).toString();
    authStage = "fetch_user";
    const userResponse = await fetch(authUrl, {
      headers: { "Authorization": auth, "apikey": publishable, "Accept": "application/json" },
      signal: timeoutSignal(8000),
    });
    if (!userResponse.ok) return respond(401, { ok: false, error: "login_required" });
    authStage = "parse_user";
    const user = await userResponse.json();
    if (!user?.id || user?.is_anonymous === true) return respond(401, { ok: false, error: "login_required" });
    verifiedUserId = String(user.id);
  } catch (cause) {
    // Diagnostic stage and exception class only, never token, URL or raw exception text.
    const kind = cause instanceof Error ? cause.name : "UnknownError";
    console.warn("aerolocator_openaip_auth_stage", authStage, kind);
    return respond(503, { ok: false, error: "auth_unavailable" });
  }

  // Only the Gente de Vuelo site administrators may test the private API key.
  // Use the caller's JWT: site_admins RLS remains in force.
  try {
    const adminUrl = new URL("/rest/v1/site_admins", projectUrl);
    if (!verifiedUserId) return respond(401, { ok: false, error: "login_required" });
    adminUrl.searchParams.set("user_id", "eq." + verifiedUserId);
    adminUrl.searchParams.set("select", "user_id");
    adminUrl.searchParams.set("limit", "1");
    const adminResponse = await fetch(adminUrl, {
      headers: { "Authorization": auth, "apikey": publishable, "Accept": "application/json" },
      signal: timeoutSignal(8000),
    });
    if (!adminResponse.ok) return respond(403, { ok: false, error: "admin_required" });
    const rows = await adminResponse.json();
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.user_id !== verifiedUserId) {
      return respond(403, { ok: false, error: "admin_required" });
    }
  } catch {
    return respond(503, { ok: false, error: "authorization_unavailable" });
  }


  // Beta read-only: explicit allowlist, fixed country, limited pages, only site admins.
  const requestUrl = new URL(req.url);
  const kind = requestUrl.searchParams.get("kind") ?? "";
  const resources = new Set(["navaids", "airspaces", "reporting-points"]);
  const page = Number(requestUrl.searchParams.get("page") ?? "1");
  if (!resources.has(kind) || !Number.isInteger(page) || page < 1 || page > 8) {
    return respond(400, { ok: false, error: "invalid_resource_or_page" });
  }
  const apiKey = Deno.env.get(ENV_NAME)?.trim();
  if (!apiKey) return respond(503, { ok: false, error: "openaip_key_not_configured" });
  const pageLimit = kind === "airspaces" ? 100 : 250;
  const endpoint = new URL("https://api.core.openaip.net/api/" + kind);
  endpoint.searchParams.set("country", "AR");
  endpoint.searchParams.set("page", String(page));
  endpoint.searchParams.set("limit", String(pageLimit));

  // In-instance cache reduces provider requests. No token or API key is cached.
  const cacheKey = kind + ":" + page;
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 20 * 60 * 1000) {
    return respond(200, cached.body);
  }
  try {
    const provider = await fetch(endpoint.toString(), {
      headers: { "Accept": "application/json", "x-openaip-api-key": apiKey },
      signal: timeoutSignal(15000),
    });
    if (!provider.ok) return respond(502, { ok: false, error: "openaip_provider_error", providerStatus: provider.status });
    const ct = provider.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return respond(502, { ok: false, error: "openaip_invalid_content_type" });
    const data = await provider.json();
    if (!data || !Array.isArray(data.items)) {
      return respond(502, { ok: false, error: "openaip_invalid_payload" });
    }

    const sanitized = data.items.map((item: unknown) => normalize(kind, item)).filter(Boolean);
    const totalPages = Number.isInteger(data.totalPages) ? Math.max(1, data.totalPages) : null;
    const response = {
      ok: true, kind, page, pageLimit, totalPages,
      totalCount: Number.isInteger(data.totalCount) ? data.totalCount : null,
      records: sanitized, source: "OpenAIP",
      license: "CC BY-NC 4.0", referenceOnly: true,
      fetchedAt: new Date().toISOString(),
    };
    if (responseCache.size > 48) responseCache.clear();
    responseCache.set(cacheKey, { at: Date.now(), body: response });
    return respond(200, response);
  } catch {
    return respond(503, { ok: false, error: "openaip_connection_unavailable" });
  }
});
