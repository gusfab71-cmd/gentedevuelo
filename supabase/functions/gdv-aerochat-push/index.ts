// AeroChat web push: HTTPS only; secret key never reaches browsers.
// One-time dispatch is authorized against the stored message, not caller-supplied text.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { generateVapidKey, vapidPublicKey, send } from "jsr:@daaku/webpush@0.2.0";

const allowedOrigins = new Set([
  "https://gentedevuelo.com",
  "https://www.gentedevuelo.com",
  "https://gentedevuelo.vercel.app",
  "http://localhost:8000"
]);
const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const admin = url && serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const corsFor = (origin) => ({
  "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://gentedevuelo.com",
  "Access-Control-Allow-Headers": "authorization,apikey,x-client-info,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8"
});
function reply(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: corsFor(origin) });
}
function endpointAllowed(input) {
  if (typeof input !== "string" || input.length > 2048) return false;
  try {
    const u = new URL(input);
    if (u.protocol !== "https:" || u.username || u.password || u.port && u.port !== "443" || u.hash) return false;
    const host = u.hostname.toLowerCase();
    return host === "fcm.googleapis.com" ||
      host === "web.push.apple.com" ||
      host.endsWith(".push.apple.com") ||
      host === "updates.push.services.mozilla.com" ||
      host.endsWith(".push.services.mozilla.com") ||
      host.endsWith(".notify.windows.com");
  } catch { return false; }
}
function keyAllowed(input, maxLen) {
  return typeof input === "string" && input.length > 10 && input.length <= maxLen &&
    /^[A-Za-z0-9_-]+$/.test(input);
}
async function getVapid() {
  const stored = await admin.rpc("gdv_webpush_vapid_key", { p_key: null });
  if (stored.error) throw stored.error;
  if (stored.data) return stored.data;
  // First subscription bootstraps a single VAPID key. Concurrent requests all retrieve the same row.
  const proposed = await generateVapidKey();
  const created = await admin.rpc("gdv_webpush_vapid_key", { p_key: proposed });
  if (created.error || !created.data) throw created.error || Error("VAPID unavailable");
  return created.data;
}
async function dropInvalid(id, err) {
  if (err?.permanent || [404, 410].includes(Number(err?.statusCode || err?.status))) {
    await admin.from("gdv_webpush_subscriptions").delete().eq("id", id);
  }
}
async function dispatch(user, data) {
  const kind = data.kind;
  const id = Number(data.message_id);
  if (!["general","private"].includes(kind) || !Number.isSafeInteger(id) || id <= 0)
    return { status: 400, result: { error: "Mensaje inválido" } };
  const table = kind === "private" ? "gdv_private_messages" : "gdv_chat_messages";
  const ownerCol = kind === "private" ? "sender_id" : "author_id";
  const fields = kind === "private" ? "id,sender_id,recipient_id,created_at" : "id,author_id,created_at";
  const msg = await admin.from(table).select(fields).eq("id", id).eq(ownerCol, user.id).maybeSingle();
  if (msg.error) throw msg.error;
  if (!msg.data) return { status: 403, result: { error: "No autorizado" } };
  const age = Date.now() - Date.parse(msg.data.created_at);
  if (!Number.isFinite(age) || age < -60000 || age > 180000)
    return { status: 409, result: { error: "Aviso vencido" } };

  // Durable unique claim prevents repeated push requests for the same message.
  const claim = await admin.from("gdv_webpush_dispatches").insert({
    kind, message_id: id, sender_id: user.id
  });
  if (claim.error?.code === "23505")
    return { status: 200, result: { ok: true, duplicate: true } };
  if (claim.error) throw claim.error;

  let q = admin.from("gdv_webpush_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth_key")
    .eq(kind === "private" ? "private_enabled" : "general_enabled", true);
  if (kind === "private") q = q.eq("user_id", msg.data.recipient_id);
  else q = q.neq("user_id", user.id);
  const subscribed = await q.range(0, 999);
  if (subscribed.error) throw subscribed.error;
  const subscriptions = subscribed.data || [];
  if (!subscriptions.length) return { status: 200, result: { ok: true, recipients: 0 } };

  // No reliance on a stale "last seen" heartbeat: a user who just closed
  // the site must receive the next notification immediately.
  const offline = subscriptions;

  const vapid = await getVapid();
  const payload = JSON.stringify({
    title: "AeroChat · Gente de Vuelo",
    body: kind === "private" ? "Tenés un nuevo mensaje privado." : "Hay un nuevo mensaje en la sala general.",
    url: kind === "private"
      ? "https://gentedevuelo.com/aerochat.html?privado=" + encodeURIComponent(user.id)
      : "https://gentedevuelo.com/aerochat.html",
    tag: "gdv-" + kind + "-" + id
  });
  const sent = await Promise.allSettled(offline.map(async s => {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        payload, { vapid, subscriber: "mailto:gentedevuelo@gmail.com", ttl: 3600 });
    } catch (e) { await dropInvalid(s.id, e); throw e; }
  }));
  return { status: 200, result: { ok: true,
    recipients: offline.length, delivered: sent.filter(x => x.status === "fulfilled").length
  } };
}

Deno.serve(async req => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsFor(origin) });
  if (req.method !== "POST") return reply({ error: "Método inválido" }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return reply({ error: "Origen no permitido" }, 403, origin);
  if (!admin) return reply({ error: "Configuración del servidor incompleta" }, 503, origin);
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply({ error: "Sin autorización" }, 401, origin);
  try {
    const token = authorization.slice(7);
    const { data: authenticated, error: authError } = await admin.auth.getUser(token);
    const user = authenticated?.user;
    if (authError || !user) return reply({ error: "Sesión inválida" }, 401, origin);
    const profile = await admin.from("profiles").select("onboarding_completed")
      .eq("id", user.id).maybeSingle();
    if (profile.error || profile.data?.onboarding_completed !== true)
      return reply({ error: "Registro incompleto" }, 403, origin);

    const raw = await req.text();
    if (raw.length > 8000) return reply({ error: "Solicitud demasiado grande" }, 413, origin);
    let data;
    try { data = JSON.parse(raw); } catch { return reply({ error: "JSON inválido" }, 400, origin); }
    if (!data || typeof data.action !== "string") return reply({ error: "Acción requerida" }, 400, origin);
    if (data.action === "key") {
      return reply({ publicKey: await vapidPublicKey(await getVapid()) }, 200, origin);
    }
    if (data.action === "subscribe") {
      const sub = data.subscription;
      const endpoint = sub?.endpoint;
      const p256dh = sub?.keys?.p256dh;
      const authKey = sub?.keys?.auth;
      if (!endpointAllowed(endpoint) || !keyAllowed(p256dh, 150) || !keyAllowed(authKey, 100))
        return reply({ error: "Suscripción inválida" }, 400, origin);
      const previous = await admin.from("gdv_webpush_subscriptions")
        .select("id,user_id").eq("endpoint",endpoint).maybeSingle();
      if (previous.error) throw previous.error;
      if (previous.data && previous.data.user_id !== user.id)
        return reply({ error: "Este navegador tiene avisos asociados a otra cuenta; desactivá el permiso y volvé a activarlo" }, 409, origin);
      const fields = {
        user_id: user.id, endpoint, p256dh, auth_key: authKey,
        private_enabled: data.private_enabled !== false,
        general_enabled: data.general_enabled === true,
        updated_at: new Date().toISOString()
      };
      const saved = previous.data
        ? await admin.from("gdv_webpush_subscriptions").update(fields).eq("id",previous.data.id).eq("user_id",user.id)
        : await admin.from("gdv_webpush_subscriptions").insert(fields);
      if (saved.error) throw saved.error;
      return reply({ ok: true }, 200, origin);
    }
    if (data.action === "unsubscribe") {
      if (!endpointAllowed(data.endpoint)) return reply({ error: "Endpoint inválido" }, 400, origin);
      const removed = await admin.from("gdv_webpush_subscriptions")
        .delete().eq("user_id", user.id).eq("endpoint",data.endpoint);
      if (removed.error) throw removed.error;
      return reply({ ok: true }, 200, origin);
    }
    if (data.action === "dispatch") {
      const result = await dispatch(user,data);
      return reply(result.result,result.status,origin);
    }
    return reply({ error: "Acción desconocida" }, 400, origin);
  } catch(e) {
    console.error("AeroChat push server error:", e?.message || String(e));
    return reply({ error: "No se pudo procesar el aviso" }, 500, origin);
  }
});
