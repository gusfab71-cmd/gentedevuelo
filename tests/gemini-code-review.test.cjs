'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const handler = require('../api/gemini-code-review.js');

const valid = () => ({ title: 'Nueva aplicación de Galería', diff: '+ function showGallery(items) { return items.map(x => x.title).join(", "); }', consent: true });
const request = (body = valid(), bearer = 'Bearer mock-token-1234') => ({ method: 'POST', headers: { authorization: bearer }, body });
const response = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = JSON.parse(s); } });
const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
function fakeFetch(user, calls, gemini = () => json({ candidates: [{ content: { parts: [{ text: 'Falta probar escapes HTML.' }] } }] })) {
  return async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/auth/v1/user')) return json({ id: user });
    if (url.includes('/site_admins')) return json([{ user_id: user }]);
    return gemini(url, options);
  };
}
async function enabled(run) {
  const oldKey = process.env.GEMINI_API_KEY, oldFlag = process.env.GEMINI_CODE_REVIEW_ENABLED, oldFetch = global.fetch;
  try {
    process.env.GEMINI_API_KEY = 'only-for-unit-tests';
    process.env.GEMINI_CODE_REVIEW_ENABLED = 'true';
    await run();
  } finally {
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
    if (oldFlag === undefined) delete process.env.GEMINI_CODE_REVIEW_ENABLED; else process.env.GEMINI_CODE_REVIEW_ENABLED = oldFlag;
    global.fetch = oldFetch;
  }
}

test('GET rejected', async () => {
  const r = response(); await handler({ ...request(), method: 'GET' }, r);
  assert.equal(r.statusCode, 405);
});
test('closed until server switch is enabled', async () => {
  await enabled(async () => {
    delete process.env.GEMINI_CODE_REVIEW_ENABLED;
    global.fetch = () => { throw Error('never fetch'); };
    const r = response(); await handler(request(), r);
    assert.equal(r.statusCode, 503); assert.equal(r.body.error, 'not_configured');
  });
});
test('anonymous request rejected before external requests', async () => {
  await enabled(async () => {
    global.fetch = () => { throw Error('never fetch'); };
    const r = response(); await handler(request(valid(), ''), r);
    assert.equal(r.statusCode, 401);
  });
});
test('non-admin is denied without Gemini call', async () => {
  await enabled(async () => {
    const calls = [];
    global.fetch = async url => {
      calls.push(url);
      if (url.includes('/auth/v1/user')) return json({ id: 'not-admin' });
      if (url.includes('/site_admins')) return json([]);
      throw Error('Gemini should not be called');
    };
    const r = response(); await handler(request(), r);
    assert.equal(r.statusCode, 403); assert.equal(calls.length, 2);
  });
});
test('consent, schema and secrets validated before Google', async () => {
  await enabled(async () => {
    const calls = [];
    global.fetch = fakeFetch('admin-input', calls, () => { throw Error('no Gemini'); });
    for (const body of [{ ...valid(), consent: false }, { ...valid(), extra: 'flight' }, { ...valid(), diff: 'short' }]) {
      const r = response(); await handler(request(body), r);
      assert.equal(r.statusCode, 400); assert.equal(r.body.error, 'invalid_input');
    }
    const r = response();
    await handler(request({ ...valid(), diff: '+ GEMINI_API_KEY = "AIzaABCDEFGHIJKLMNOPQRSTUV0123456"' }), r);
    assert.equal(r.statusCode, 400); assert.equal(r.body.error, 'possible_secret');
    assert.equal(calls.length, 8);
  });
});
test('admin sends chosen code, receives review and is throttled', async () => {
  await enabled(async () => {
    const calls = []; global.fetch = fakeFetch('admin-success', calls);
    const r = response(); await handler(request(), r);
    assert.equal(r.statusCode, 200); assert.equal(r.body.model, 'gemini-2.5-flash');
    assert.match(r.body.answer, /escapes HTML/);
    assert.equal(calls.length, 3);
    assert.equal(calls[2].options.headers['x-goog-api-key'], 'only-for-unit-tests');
    const payload = JSON.stringify(JSON.parse(calls[2].options.body));
    assert.match(payload, /showGallery/);
    assert.doesNotMatch(payload, /mock-token-1234|only-for-unit-tests/);
    const again = response(); await handler(request(), again);
    assert.equal(again.statusCode, 429); assert.equal(again.body.error, 'slow_down');
    assert.ok(Number(again.headers['Retry-After']) > 0); assert.equal(calls.length, 5);
  });
});
test('Google failures do not expose Google private messages', async () => {
  await enabled(async () => {
    for (const [status, code] of [[429, 'google_quota'], [403, 'google_key_rejected'], [404, 'google_model_unavailable']]) {
      const calls = [];
      global.fetch = fakeFetch('admin-error-' + status, calls, () => json({ error: { message: 'private-info' } }, status));
      const r = response(); await handler(request(), r);
      assert.equal(r.body.error, code); assert.ok(!JSON.stringify(r.body).includes('private-info'));
    }
  });
});
test('oversized input is rejected before Google', async () => {
  await enabled(async () => {
    const calls = []; global.fetch = fakeFetch('admin-size', calls, () => { throw Error('no Gemini'); });
    const r = response(); await handler(request({ ...valid(), diff: 'x'.repeat(17000) }), r);
    assert.equal(r.statusCode, 413); assert.equal(calls.length, 2);
  });
});
test('upstream timeout does not retry or leak', async () => {
  await enabled(async () => {
    const calls = [];
    global.fetch = fakeFetch('admin-timeout', calls, () => { const e = new Error('slow'); e.name = 'TimeoutError'; throw e; });
    const r = response(); await handler(request(), r);
    assert.equal(r.statusCode, 504); assert.equal(calls.length, 3);
  });
});
