'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { isFlightOperations, maybeSecret, selectDiffs, run } = require('../scripts/gemini-pr-review.cjs');

const baseEnv = {
  GITHUB_REPOSITORY: 'gusfab71-cmd/gentedevuelo',
  GITHUB_TOKEN: 'fake-github-token',
  GEMINI_API_KEY: 'fake-google-key'
};
const pr = {
  pull_request: { number: 5, head: { repo: { full_name: 'gusfab71-cmd/gentedevuelo' } } }
};
const exampleFiles = [
  { filename: 'utilidades/meteorologia-aeronautica.html', patch: '@@ -1 +1 @@\n- flight\n+ flight' },
  { filename: 'assets/flight-route-suggestions.js', patch: '@@ -1 +1 @@\n- flight\n+ flight' },
  { filename: 'assets/gallery-new.js', patch: '@@ -1 +1 @@\n- old\n+ const show = x => x.title;' },
  { filename: 'images/plane.png', patch: '@@ 1 @@ binary' }
];
const response = (data, code = 200) => ({ ok: code >= 200 && code < 300, status: code, json: async () => data });

test('Flight Operations stays excluded regardless of other changed files', () => {
  assert.equal(isFlightOperations('utilidades/meteorologia-aeronautica.html'), true);
  assert.equal(isFlightOperations('assets/flight-route-suggestions.js'), true);
  assert.equal(isFlightOperations('api/flight-plan.js'), true);
  assert.equal(isFlightOperations('assets/gallery-new.js'), false);
  const selection = selectDiffs(exampleFiles);
  assert.equal(selection.count, 1);
  assert.match(selection.diff, /gallery-new\.js/);
  assert.doesNotMatch(selection.diff, /flight-route|meteorologia/);
});

test('likely secrets block the entire Gemini request', () => {
  assert.equal(maybeSecret('+ const API_KEY = "AIzaABCDEFGHIJKLMNOPQRSTUV0123456"'), true);
  const selection = selectDiffs([{ filename: 'assets/gallery-new.js', patch: '+ const API_KEY = "AIzaABCDEFGHIJKLMNOPQRSTUV0123456"' }]);
  assert.equal(selection.reason, 'possible_secret');
  assert.equal(selection.diff, '');
});

test('large diffs have a fixed upper bound and omit Flight Operations', () => {
  const selection = selectDiffs([
    { filename: 'assets/app.js', patch: 'x'.repeat(14000) },
    { filename: 'assets/app2.js', patch: '+ changed' }
  ]);
  assert.ok(selection.diff.length <= 9500);
  assert.ok(selection.omitted > 0);
});

test('repo context/fork/absent key never triggers external Gemini call', async () => {
  const noFetch = () => { throw Error('Must not fetch'); };
  assert.equal(await run({ ...baseEnv, GEMINI_API_KEY: '' }, noFetch, pr), 'not_configured');
  assert.equal(await run(baseEnv, noFetch, { pull_request: { ...pr.pull_request, head: { repo: { full_name: 'else/fork' } } } }), 'skipped_fork');
  await assert.rejects(run({ ...baseEnv, GITHUB_REPOSITORY: 'else/another' }, noFetch, pr), /invalid_pr_context/);
});

test('reviewer sends only code for new developments and creates a bot comment', async () => {
  const calls = [];
  const mock = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('/pulls/5/files')) return response(exampleFiles);
    if (url.includes('/issues/5/comments') && (!opts.method || opts.method === 'GET')) return response([]);
    if (url.includes('generativelanguage.googleapis.com')) {
      const data = JSON.parse(opts.body);
      assert.match(data.contents[0].parts[0].text, /gallery-new/);
      assert.doesNotMatch(JSON.stringify(data), /meteorologia|flight-route|fake-github-token|fake-google-key/);
      return response({ candidates: [{ content: { parts: [{ text: 'Hay que escapar el título.' }] } }] });
    }
    if (url.includes('/issues/5/comments') && opts.method === 'POST') {
      const body = JSON.parse(opts.body).body;
      assert.match(body, /Segunda revisión de Gemini/);
      assert.match(body, /escapar el título/);
      assert.match(body, /No incluye Flight Operations/);
      return response({ id: 10 });
    }
    throw Error('Unexpected request to ' + url);
  };
  const result = await run(baseEnv, mock, pr);
  assert.equal(result, 'review_posted');
  assert.equal(calls.length, 4);
  assert.equal(calls.filter(c => c.url.includes('generativelanguage')).length, 1);
});

test('possible credential prevents Gemini but informs PR without revealing it', async () => {
  let geminiCalls = 0;
  const mock = async (url, opts) => {
    if (url.includes('/pulls/5/files')) return response([{ filename: 'assets/config.js', patch: '+ const API_KEY = "AIzaABCDEFGHIJKLMNOPQRSTUV0123456"' }]);
    if (url.includes('generativelanguage')) { geminiCalls++; throw Error('should not call'); }
    if (url.includes('/issues/5/comments') && !opts.method) return response([]);
    if (url.includes('/issues/5/comments') && opts.method === 'POST') {
      const body = JSON.parse(opts.body).body;
      assert.doesNotMatch(body, /AIzaABCDEFGHIJKLMNOPQRSTUV0123456/);
      return response({ id: 20 });
    }
    throw Error('Unexpected request');
  };
  assert.equal(await run(baseEnv, mock, pr), 'possible_secret');
  assert.equal(geminiCalls, 0);
});

test('a second review updates the prior bot comment rather than spamming', async () => {
  let patched = false;
  const mock = async (url, opts) => {
    if (url.includes('/pulls/5/files')) return response(exampleFiles);
    if (url.includes('generativelanguage')) return response({ candidates: [{ content: { parts: [{ text: 'Ahora está correcto.' }] } }] });
    if (url.endsWith('/issues/5/comments?per_page=100')) return response([{ id: 9, user: { login: 'github-actions[bot]' }, body: '<!-- gdv-gemini-pr-audit-v1 -->\nOld review' }]);
    if (url.endsWith('/issues/comments/9') && opts.method === 'PATCH') { patched = true; return response({ id: 9 }); }
    throw Error('Unexpected request to ' + url);
  };
  assert.equal(await run(baseEnv, mock, pr), 'review_posted');
  assert.equal(patched, true);
});
