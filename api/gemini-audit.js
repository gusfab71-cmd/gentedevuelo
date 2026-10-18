// Gemini audit: server-only, admin-only, synthetic cases. No real flight plans.
const SUPABASE_URL = 'https://lmoifzyhqmccvmgitlcp.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_YfQ3GwlhGecJyW1ZKcq8iQ_PbYp6THX';
const MODEL = 'gemini-2.5-flash';
const MAX_BYTES = 512;
const TIMEOUT_MS = 18000;
const COOLDOWN_MS = 60000;
const lastAttemptByUser = new Map(); // Best-effort per-instance cooldown, not a distributed quota.

// Only these fictional cases ever reach the external AI. User-provided prompts,
// identities and flight plans are intentionally not accepted.
const CASES = Object.freeze({
  tas: {
    title: 'IAS → TAS (ejemplo ficticio)',
    data: 'Ejercicio ficticio: IAS = 100 kt, altitud de presión = 5.000 ft, OAT = 5 °C. Para una aproximación de baja velocidad, suponer IAS ≈ EAS. Verificar la densidad y una TAS aproximada de 108 kt; advertir que IAS no es exactamente CAS/EAS ni hay certificación operacional.'
  },
  wind: {
    title: 'Viento, rumbo y GS (ejemplo ficticio)',
    data: 'Ejercicio ficticio: derrota verdadera 090°, TAS 110 kt, viento DESDE 180° a 20 kt. Verificar corrección de viento hacia rumbo verdadero 100,5° y GS aproximada 108 kt. Distinguir rumbo/derrota, origen del viento y ausencia de variación magnética.'
  },
  fuel: {
    title: 'Combustible (ejemplo ficticio)',
    data: 'Ejercicio ficticio: piernas de 45 y 55 minutos, consumo 24 L/h, rodaje 5 L, contingencia 10% del consumo en ruta y reserva 45 minutos al mismo consumo. Verificar ruta 40 L, contingencia 4 L, reserva 18 L, total teórico 67 L. No representa reservas reglamentarias de una aeronave concreta.'
  }
});

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  // Vercel can parse JSON bodies before invoking Node.js handlers.
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw || '') > MAX_BYTES) throw new Error('payload_too_large');
    return JSON.parse(raw);
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('payload_too_large');
  }
  return JSON.parse(raw);
}
async function getJson(url, token) {
  const response = await fetch(url, {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  return response.json();
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }
  // A missing switch or secret must not trigger an external or billable request.
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_AUDIT_ENABLED !== 'true') return json(res, 503, { error: 'not_configured' });
  const authorization = req.headers?.authorization || '';
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) return json(res, 401, { error: 'unauthorized' });
  const token = authorization.slice(7);
  try {
    // Verify identity against Supabase Auth; never trust a user ID sent by the browser.
    const user = await getJson(SUPABASE_URL + '/auth/v1/user', token);
    if (!user?.id || user.is_anonymous) return json(res, 401, { error: 'unauthorized' });
    // Fail closed: the user's JWT must be allowed to read their own site_admins row by RLS.
    const rows = await getJson(SUPABASE_URL + '/rest/v1/site_admins?select=user_id&user_id=eq.' + encodeURIComponent(user.id) + '&limit=1', token);
    if (!Array.isArray(rows) || !rows.some(row => row.user_id === user.id)) {
      return json(res, 403, { error: 'forbidden' });
    }
    const body = await readBody(req);
    const caseId = body?.caseId;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !Object.hasOwn(CASES, caseId)) {
      return json(res, 400, { error: 'invalid_case' });
    }
    // Additional anti-spam defense. Cross-instance limits still depend on
    // quotas configured for this project in Google AI Studio.
    const now = Date.now();
    const previous = lastAttemptByUser.get(user.id) || 0;
    if (now - previous < COOLDOWN_MS) {
      res.setHeader('Retry-After', String(Math.ceil((COOLDOWN_MS - now + previous) / 1000)));
      return json(res, 429, { error: 'slow_down' });
    }
    lastAttemptByUser.set(user.id, now);
    if (lastAttemptByUser.size > 100) {
      for (const [id, timestamp] of lastAttemptByUser) {
        if (now - timestamp > COOLDOWN_MS) lastAttemptByUser.delete(id);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'Sos un segundo revisor técnico de ejercicios aeronáuticos ficticios. Recalculá independientemente, señalá aciertos, errores, supuestos y límites. Nunca inventes datos ni emitas autorización operacional. Respondé en español y brevemente bajo Verificación, Observaciones y Limitaciones.' }] },
          contents: [{ role: 'user', parts: [{ text: CASES[caseId].data }] }],
          generationConfig: { maxOutputTokens: 650, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } }
        }),
        signal: controller.signal
      });
    } finally { clearTimeout(timeout); }
    if (!response.ok) {
      // Keep Google error text private: it may contain account or project details.
      // A narrow status classification is enough to diagnose setup problems.
      const upstream = await response.json().catch(() => ({}));
      const googleStatus = typeof upstream?.error?.status === 'string' ? upstream.error.status.slice(0, 60) : 'unknown';
      console.warn('Gemini audit upstream failure', { httpStatus: response.status, googleStatus });
      const error = response.status === 429 ? 'google_quota'
        : response.status === 400 ? 'google_bad_request'
        : [401, 403].includes(response.status) ? 'google_key_rejected'
        : response.status === 404 ? 'google_model_unavailable'
        : 'gemini_unavailable';
      return json(res, response.status === 429 ? 429 : 502, { error });
    }
    const result = await response.json();
    const answer = (result.candidates?.[0]?.content?.parts || []).map(part => typeof part.text === 'string' ? part.text : '').join('').slice(0, 5000);
    if (!answer) return json(res, 502, { error: 'empty_response' });
    return json(res, 200, { answer, caseId, title: CASES[caseId].title, model: MODEL, advisory_only: true });
  } catch (error) {
    if (error.message === 'payload_too_large') return json(res, 413, { error: 'payload_too_large' });
    if (error instanceof SyntaxError) return json(res, 400, { error: 'invalid_json' });
    return json(res, 503, { error: 'temporarily_unavailable' });
  }
};
