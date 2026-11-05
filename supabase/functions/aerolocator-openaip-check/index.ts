// AeroLocator · comprobación privada de OpenAIP.
// No publica credenciales, no devuelve el catálogo ni modifica datos.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ENV_NAME = "OPENAIP_API_KEY";
const URL = "https://api.core.openaip.net/api/navaids?country=AR&limit=1&page=1";

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
  try {
    const userResponse = await fetch(new URL("/auth/v1/user", projectUrl), {
      headers: { "Authorization": auth, "apikey": publishable },
      signal: AbortSignal.timeout(8000),
    });
    if (!userResponse.ok) return respond(401, { ok: false, error: "login_required" });
    const user = await userResponse.json();
    if (!user?.id || user?.is_anonymous === true) return respond(401, { ok: false, error: "login_required" });
    verifiedUserId = String(user.id);
  } catch {
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
      signal: AbortSignal.timeout(8000),
    });
    if (!adminResponse.ok) return respond(403, { ok: false, error: "admin_required" });
    const rows = await adminResponse.json();
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.user_id !== verifiedUserId) {
      return respond(403, { ok: false, error: "admin_required" });
    }
  } catch {
    return respond(503, { ok: false, error: "authorization_unavailable" });
  }

  const apiKey = Deno.env.get(ENV_NAME)?.trim();
  if (!apiKey) return respond(503, { ok: false, configured: false, error: "openaip_key_not_configured" });

  try {
    const response = await fetch(URL, {
      headers: { "Accept": "application/json", "x-openaip-api-key": apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      // Never echo the provider body because it could include sensitive content.
      return respond(502, { ok: false, configured: true, providerStatus: response.status, error: "openaip_auth_or_service_error" });
    }
    const responseType = response.headers.get("content-type") ?? "";
    if (!responseType.includes("application/json")) {
      return respond(502, { ok: false, configured: true, error: "openaip_response_not_json" });
    }
    const data = await response.json();
    const valid = Array.isArray(data?.items) || Array.isArray(data);
    return respond(valid ? 200 : 502, {
      ok: valid, configured: true, providerStatus: response.status,
      returnedRecords: Array.isArray(data?.items) ? data.items.length : (Array.isArray(data) ? data.length : null),
      dataSource: "OpenAIP", operationalUse: false,
    });
  } catch {
    return respond(503, { ok: false, configured: true, error: "openaip_connection_unavailable" });
  }
});
