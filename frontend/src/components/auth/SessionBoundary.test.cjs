/* eslint-disable @typescript-eslint/no-require-imports -- Node-based component test harness. */
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/' });
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { render, screen, cleanup, act } = require('@testing-library/react');
const navigation = [];
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'next/navigation') return { useRouter: () => ({ replace: (p) => navigation.push(p), push: (p) => navigation.push(p) }) };
  return originalLoad.call(this, request, parent, isMain);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => {
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  module._compile(source, filename);
};
const SessionBoundary = require('./SessionBoundary.tsx').default;
const LoginSessionSync = require('./LoginSessionSync.tsx').default;
const { homePath } = require('../../lib/auth/session.ts');

const jwt = (claims) => 'h.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.s';
const A = jwt({ sub: 'user-a', role: 'BUSINESS', businessId: 'biz-a' });
const B = jwt({ sub: 'user-b', role: 'BUSINESS', businessId: 'biz-b' });
const ADMIN = jwt({ sub: 'admin', role: 'ADMIN', businessId: null });
const setToken = (token) => act(() => {
  if (token) localStorage.setItem('accessToken', token); else localStorage.removeItem('accessToken');
  window.dispatchEvent(new dom.window.StorageEvent('storage', { key: 'accessToken' }));
});
let mounts = 0;
function Probe() { React.useEffect(() => { mounts++; }, []); return React.createElement('p', null, 'contenido privado'); }
afterEach(async () => { cleanup(); navigation.length = 0; mounts = 0; await setToken(null); navigation.length = 0; sessionStorage.clear(); });

test('ADMIN reaches /admin content without redirects', async () => {
  localStorage.setItem('accessToken', ADMIN);
  render(React.createElement(SessionBoundary, { require: 'ADMIN' }, React.createElement(Probe)));
  assert.ok(await screen.findByText('contenido privado'));
  assert.deepEqual(navigation, []);
});

test('BUSINESS on /admin is sent to /home, keeps the session and never mounts admin content', async () => {
  localStorage.setItem('accessToken', A);
  const { container } = render(React.createElement(SessionBoundary, { require: 'ADMIN' }, React.createElement(Probe)));
  await act(async () => {});
  assert.deepEqual(navigation, ['/home']);
  assert.equal(localStorage.getItem('accessToken'), A);
  assert.equal(mounts, 0);
  assert.equal(container.textContent, '');
});

test('anonymous on /admin or private routes goes to /login without an expired notice', async () => {
  for (const require of ['ADMIN', 'auth']) {
    render(React.createElement(SessionBoundary, { require }, React.createElement(Probe)));
    await act(async () => {});
    assert.deepEqual(navigation, ['/login']);
    assert.equal(mounts, 0);
    assert.equal(sessionStorage.getItem('session_expired_notice'), null);
    cleanup(); navigation.length = 0;
  }
});

test('private route: a logout in another tab hides content and redirects once; no redirect for BUSINESS with auth', async () => {
  localStorage.setItem('accessToken', A);
  render(React.createElement(SessionBoundary, { require: 'auth' }, React.createElement(Probe)));
  assert.ok(await screen.findByText('contenido privado'));
  assert.deepEqual(navigation, []);
  await setToken(null);
  assert.equal(screen.queryByText('contenido privado'), null);
  assert.deepEqual(navigation, ['/login']);
});

test('A -> B in another tab remounts private content under B (no state of A survives)', async () => {
  localStorage.setItem('accessToken', A);
  render(React.createElement(SessionBoundary, { require: 'auth' }, React.createElement(Probe)));
  await screen.findByText('contenido privado');
  assert.equal(mounts, 1);
  await setToken(null);
  await setToken(B);
  assert.ok(await screen.findByText('contenido privado'));
  assert.equal(mounts, 2);
});

test('a /login tab receives a new session from another tab and navigates; ADMIN goes to /admin', async () => {
  render(React.createElement(LoginSessionSync));
  await act(async () => {});
  assert.deepEqual(navigation, []);
  await setToken(A);
  assert.deepEqual(navigation, ['/home']);
  await setToken(null);
  assert.deepEqual(navigation, ['/home']);
  await setToken(ADMIN);
  assert.deepEqual(navigation, ['/home', '/admin']);
  await setToken(ADMIN);
  assert.equal(navigation.length, 2);
});

test('a /login tab with a stale session does not navigate on mount and homePath keeps roles apart', async () => {
  localStorage.setItem('accessToken', A);
  render(React.createElement(LoginSessionSync));
  await act(async () => {});
  assert.deepEqual(navigation, []);
  assert.equal(homePath({ role: 'ADMIN', businessId: null }), '/admin');
  assert.equal(homePath({ role: 'ADMIN', businessId: 'x' }), '/home');
  assert.equal(homePath({ role: 'BUSINESS', businessId: 'x' }), '/home');
});
