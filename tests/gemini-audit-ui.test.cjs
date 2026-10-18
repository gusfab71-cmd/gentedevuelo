const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../utilidades/meteorologia-aeronautica.html'), 'utf8');
const panel = fs.readFileSync(path.join(__dirname, '../assets/gemini-audit-panel.js'), 'utf8');

test('audit interface is independent of existing flight navigation and requires admin role', () => {
  assert.match(html, /flight-operations-wizard\.js\?v=20261017a/);
  assert.match(html, /gemini-audit-panel\.js\?v=20261018a/);
  assert.match(html, /gemini-audit\.css\?v=20261018a/);
  assert.match(panel, /dataset\.flightRole !== 'admin'/);
  assert.match(panel, /gdv-flight-role-ready/);
});

test('only a case identifier, not the flight plan or arbitrary prompt, leaves the browser', () => {
  assert.match(panel, /JSON\.stringify\(\{caseId: selector\.value\}\)/);
  assert.match(panel, /consent\.checked/);
  assert.match(panel, /textContent = payload\.answer/);
  assert.doesNotMatch(panel, /innerHTML\s*=\s*payload\.answer/);
});
