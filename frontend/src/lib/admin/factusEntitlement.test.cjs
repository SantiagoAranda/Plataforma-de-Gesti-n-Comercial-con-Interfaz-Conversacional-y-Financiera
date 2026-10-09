const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { saveFactusEntitlement } = require('./factusEntitlement.ts');

// Compile the real presentational component with the existing TypeScript dependency.
const filename = path.resolve(__dirname, '../../components/admin/FactusEntitlementCard.tsx');
const cardModule = new Module(filename, module);
cardModule.filename = filename;
cardModule.paths = Module._nodeModulePaths(path.dirname(filename));
cardModule._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const { FactusEntitlementCard } = cardModule.exports;
const off = { enabled: false, configured: true, environment: 'sandbox' };

test('real card renders OFF, ON and disabled saving state', () => {
  for (const enabled of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(FactusEntitlementCard, {
      factus: { ...off, enabled }, saving: false, onToggle() {},
    }));
    assert.match(html, /role="switch"/);
    assert.ok(html.includes(`aria-checked="${enabled}"`));
    assert.ok(html.includes(enabled ? 'Activada' : 'Desactivada'));
    assert.match(html, /Sandbox/);
    assert.doesNotMatch(html, /disabled=""/);
  }
  const saving = renderToStaticMarkup(React.createElement(FactusEntitlementCard, {
    factus: off, saving: true, onToggle() {},
  }));
  assert.match(saving, /disabled=""/);
  assert.match(saving, /Guardando…/);
  assert.match(saving, /aria-checked="false"/);
});

test('successful activation commits the server response only after saving and blocks duplicate requests', async () => {
  let resolve;
  let calls = 0;
  let current = off;
  const pending = new Promise((done) => { resolve = done; });
  const saving = [];
  const lock = { current: false };
  const options = {
    lock, businessId: 'selected-business', enabled: true,
    request: async (url, init) => {
      calls++;
      assert.equal(url, '/businesses/admin/selected-business/factus');
      assert.equal(init.method, 'PATCH');
      assert.deepEqual(JSON.parse(init.body), { enabled: true });
      return pending;
    },
    onSaving: (value) => saving.push(value),
    onSuccess: (value) => { current = value; },
    onError: () => assert.fail('unexpected failure'),
  };
  const first = saveFactusEntitlement(options);
  await saveFactusEntitlement(options);
  assert.equal(calls, 1);
  assert.equal(current.enabled, false);
  assert.equal(lock.current, true);
  resolve({ factus: { ...off, enabled: true } });
  await first;
  assert.equal(current.enabled, true);
  assert.equal(lock.current, false);
  assert.deepEqual(saving, [true, false]);
});

test('failure preserves confirmed state, reports error and releases the lock for retry', async () => {
  let current = off;
  let error;
  const lock = { current: false };
  const saving = [];
  const failure = new Error('server rejected request');
  await saveFactusEntitlement({
    lock, businessId: 'selected-business', enabled: true,
    request: async () => { throw failure; },
    onSaving: (value) => saving.push(value),
    onSuccess: (value) => { current = value; },
    onError: (value) => { error = value; },
  });
  assert.equal(current, off);
  assert.equal(error, failure);
  assert.equal(lock.current, false);
  assert.deepEqual(saving, [true, false]);
});

test('successful deactivation updates confirmed state', async () => {
  let current = { ...off, enabled: true };
  await saveFactusEntitlement({
    lock: { current: false }, businessId: 'selected-business', enabled: false,
    request: async (_, init) => {
      assert.deepEqual(JSON.parse(init.body), { enabled: false });
      return { factus: off };
    },
    onSaving() {}, onSuccess: (value) => { current = value; },
    onError: () => assert.fail('unexpected failure'),
  });
  assert.equal(current.enabled, false);
});
