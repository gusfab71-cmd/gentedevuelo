// AeroLocator · comprobación privada de OpenAIP.
// No publica credenciales, no devuelve el catálogo ni modifica datos.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ENV_NAME = "OPENAIP_API_KEY";
const URL = "https://api.core.openaip.net/api/navaids?country=AR&limit=1&page=1";

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json(405, { ok: false, error: "method_not_allowed" });
  const auth = req.headers.get("authorization") ?? "";
  const tokenMatch = /^Bearer ([^\s]+)$/i.exec(auth);
  if (!tokenMatch) return json(401, { ok: false, error: "login_required" });

  const projectUrl = Deno.env.get("SUPABASE_URL");
  let publishable = Deno.env.get("SUPABASE_ANON_KEY");
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (typeof keys.default === "string" && keys.default) publishable = keys.default;
  } catch { /* Fallback to legacy anon public key. */ }
  if (!projectUrl || !publishable) return json(503, { ok: false, error: "auth_configuration_missing" });

  let verifiedUserId: string | null = null;
  // Verify an actual signed-in user; a public anon key is not sufficient.
  try {
    const userResponse = await fetch(new URL("/auth/v1/user", projectUrl), {
      headers: { "Authorization": auth, "apikey": publishable },
      signal: AbortSignal.timeout(8000),
    });
    if (!userResponse.ok) return json(401, { ok: false, error: "login_required" });
    const user = await userResponse.json();
    if (!user?.id || user?.is_anonymous === true) return json(401, { ok: false, error: "login_required" });
    verifiedUserId = String(user.id);
  } catch {
    return json(503, { ok: false, error: "auth_unavailable" });
  }

  // Only the Gente de Vuelo site administrators may test the private API key.
  // Use the caller's JWT: site_admins RLS remains in force.
  try {
    const adminUrl = new URL("/rest/v1/site_admins", projectUrl);
    if (!verifiedUserId) return json(401, { ok: false, error: "login_required" });
    adminUrl.searchParams.set("user_id", "eq." + verifiedUserId);
    adminUrl.searchParams.set("select", "user_id");
    adminUrl.searchParams.set("limit", "1");
    const adminResponse = await fetch(adminUrl, {
      headers: { "Authorization": auth, "apikey": publishable, "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!adminResponse.ok) return json(403, { ok: false, error: "admin_required" });
    const rows = await adminResponse.json();
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.user_id !== verifiedUserId) {
      return json(403, { ok: false, error: "admin_required" });
    }
  } catch {
    return json(503, { ok: false, error: "authorization_unavailable" });
  }

  const apiKey = Deno.env.get(ENV_NAME)?.trim();
  if (!apiKey) return json(503, { ok: false, configured: false, error: "openaip_key_not_configured" });

  try {
    const response = await fetch(URL, {
      headers: { "Accept": "application/json", "x-openaip-api-key": apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      // Never echo the provider body because it could include sensitive content.
      return json(502, { ok: false, configured: true, providerStatus: response.status, error: "openaip_auth_or_service_error" });
    }
    const responseType = response.headers.get("content-type") ?? "";
    if (!responseType.includes("application/json")) {
      return json(502, { ok: false, configured: true, error: "openaip_response_not_json" });
    }
    const data = await response.json();
    const valid = Array.isArray(data?.items) || Array.isArray(data);
    return json(valid ? 200 : 502, {
      ok: valid, configured: true, providerStatus: response.status,
      returnedRecords: Array.isArray(data?.items) ? data.items.length : (Array.isArray(data) ? data.length : null),
      dataSource: "OpenAIP", operationalUse: false,
    });
  } catch {
    return json(503, { ok: false, configured: true, error: "openaip_connection_unavailable" });
  }
});
