// Gemini audit endpoint: server-only. No frontend or production wiring.
const SUPABASE_URL = 'https://lmoifzyhqmccvmgitlcp.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_YfQ3GwlhGecJyW1ZKcq8iQ_PbYp6THX';
const MODEL = 'gemini-2.5-flash';
const MAX_BYTES = 12000;
const TIMEOUT_MS = 20000;

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}
async function readBody(req) {
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
  if (!process.env.GEMINI_API_KEY) return json(res, 503, { error: 'not_configured' });
  const authorization = req.headers.authorization || '';
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) return json(res, 401, { error: 'unauthorized' });
  const token = authorization.slice(7);
  try {
    // Verify identity against Supabase Auth; never trust a user ID sent by the browser.
    const user = await getJson(SUPABASE_URL + '/auth/v1/user', token);
    if (!user?.id) return json(res, 401, { error: 'unauthorized' });
    // Fail closed: the user's JWT must be allowed to read their own site_admins row by RLS.
    const rows = await getJson(SUPABASE_URL + '/rest/v1/site_admins?select=user_id&user_id=eq.' + encodeURIComponent(user.id) + '&limit=1', token);
    if (!Array.isArray(rows) || !rows.some(row => row.user_id === user.id)) {
      return json(res, 403, { error: 'forbidden' });
    }
    const body = await readBody(req);
    const subject = body?.subject;
    if (typeof subject !== 'string' || subject.length < 10 || subject.length > 7000) {
      return json(res, 400, { error: 'invalid_subject' });
    }
    // No personally identifiable data or secrets should be sent in subject.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'Sos un auditor técnico aeronáutico independiente. Revisá solamente los datos sintéticos suministrados, indicá supuestos, errores y comprobaciones necesarias. No inventes datos. No emitas autorización operacional. Respondé en español y de manera concisa.' }] },
          contents: [{ role: 'user', parts: [{ text: subject }] }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.1 }
        }),
        signal: controller.signal
      });
    } finally { clearTimeout(timeout); }
    if (!response.ok) return json(res, 502, { error: 'gemini_unavailable', upstream_status: response.status });
    const result = await response.json();
    const answer = (result.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('').slice(0, 8000);
    if (!answer) return json(res, 502, { error: 'empty_response' });
    return json(res, 200, { answer, model: MODEL, advisory_only: true });
  } catch (error) {
    if (error.message === 'payload_too_large') return json(res, 413, { error: 'payload_too_large' });
    if (error instanceof SyntaxError) return json(res, 400, { error: 'invalid_json' });
    return json(res, 503, { error: 'temporarily_unavailable' });
  }
};
