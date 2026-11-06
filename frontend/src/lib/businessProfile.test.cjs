const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:3000' });
Object.assign(global, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
const React = require('react');
const { render, screen, fireEvent, waitFor, cleanup, act } = require('@testing-library/react');
const root = path.resolve(__dirname, '../..');
const notices = [];
const requests = [];
let answer;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'react-hot-toast') return { __esModule: true, default: { success: message => notices.push(['success', message]), error: message => notices.push(['error', message]) } };
  if (request === 'next/navigation') return { useRouter: () => ({ push() {}, replace() {} }), usePathname: () => '/perfil', notFound() { throw { notFound: true }; }, permanentRedirect(url) { throw { redirect: url, permanent: true }; } };
  if (request === 'next/headers') return { headers: async () => new Headers({ host: 'tienda.test' }) };
  if (request === './PublicStoreClient') return { __esModule: true, default: () => null };
  if (/push\/owner$/.test(request)) return { syncPushOwner() {} };
  if (/useHomeModuleSummaries$/.test(request)) return { useHomeModuleSummaries: () => ({ summaries: [], orders: [], loading: false }) };
  if (/DesktopSidePanelContext$/.test(request)) return { useDesktopSidePanel: () => null };
  if (/AppHeader$/.test(request)) return { __esModule: true, default: ({ title }) => React.createElement('header', null, title) };
  if (/(AppHeader|PhoneSelector|ColorPickerPopover|HomeAgenda|ThreadItem|BottomNav|PushInviteCard)$/.test(request)) return { __esModule: true, default: () => null };
  if (request.startsWith('@/')) request = path.join(root, request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
};
const session = require('./auth/session.ts');
const { getBusinessProfile, updateBusinessProfile } = require('./businessLogo.ts');
const Perfil = require('../../app/(app)/perfil/page.tsx').default;
const Panel = require('../components/layout/DesktopModulePanel.tsx').default;
const Home = require('../../app/(app)/home/page.tsx').default;
const { generateMetadata } = require('../../app/tienda/[slug]/page.tsx');
const profile = { id: 'a', name: 'TecnoGmaes', slug: 'original', phoneWhatsapp: '', logoUrl: null };
function login(id = 'a', name = 'TecnoGmaes') {
  const token = 'x.' + Buffer.from(JSON.stringify({ sub: 'user-' + id, businessId: id, role: 'BUSINESS' })).toString('base64url') + '.x';
  session.establishSession({ accessToken: token, businessName: name, businessSlug: 'original' });
}
function setup() {
  login();
  answer = async (url, init) => {
    if (url.endsWith('/businesses/profile')) return { ...profile, ...(init.method === 'PATCH' ? JSON.parse(init.body) : {}) };
    return { phones: [], socials: [] };
  };
  global.fetch = async (url, init) => {
    requests.push({ url, ...init });
    const data = await answer(url, init);
    return data instanceof Response ? data : new Response(JSON.stringify(data), { status: 200 });
  };
}
afterEach(() => { cleanup(); requests.length = 0; notices.length = 0; session.clearSession(); });
async function form() {
  render(React.createElement(React.Fragment, null, React.createElement(Perfil), React.createElement(Panel)));
  await waitFor(() => assert.equal(document.querySelector('fieldset').disabled, false));
  return screen.getByDisplayValue('TecnoGmaes');
}
test('successful save normalizes name, updates panel and only confirms after footer', async () => {
  setup();
  const input = await form();
  fireEvent.change(input, { target: { value: '  TecnoGames   Shop ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => assert.equal(notices.at(-1)?.[0], 'success'));
  assert.equal(localStorage.getItem('businessName'), 'TecnoGames Shop');
  assert.equal(localStorage.getItem('businessSlug'), 'original');
  assert.equal(input.value, 'TecnoGames Shop');
  assert.equal(document.querySelector('aside p').textContent, 'TecnoGames Shop');
  assert.deepEqual(requests.filter(r => r.method === 'PATCH').map(r => new URL(r.url).pathname), ['/businesses/profile', '/businesses/store-footer-settings']);
});
test('name failure preserves draft and cache, skips footer and permits retry', async () => {
  setup(); const input = await form(); const original = answer;
  answer = async (url, init) => init.method === 'PATCH' ? new Response('{}', { status: 500 }) : original(url, init);
  fireEvent.change(input, { target: { value: 'TecnoGames' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => assert.equal(notices.length, 1));
  assert.equal(input.value, 'TecnoGames');
  assert.equal(localStorage.getItem('businessName'), 'TecnoGmaes');
  assert.equal(requests.filter(r => r.method === 'PATCH').length, 1);
  assert.equal(notices[0][0], 'error');
  answer = original;
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => assert.equal(notices.at(-1)[0], 'success'));
});
test('footer failure reports partial persistence and preserves entered footer', async () => {
  setup(); const input = await form(); const original = answer;
  answer = async (url, init) => init.method === 'PATCH' && url.endsWith('store-footer-settings') ? new Response('{}', { status: 500 }) : original(url, init);
  fireEvent.change(input, { target: { value: 'TecnoGames' } });
  const description = screen.getByPlaceholderText('Descripcion corta (opcional)');
  fireEvent.change(description, { target: { value: 'Draft footer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => assert.match(notices.at(-1)?.[1] || '', /nombre comercial se guardó/));
  assert.equal(localStorage.getItem('businessName'), 'TecnoGames');
  assert.equal(description.value, 'Draft footer');
  assert.equal(screen.queryByRole('button', { name: 'Guardado' }), null);
  assert.equal(notices.some(n => n[0] === 'success'), false);
});
test('invalid names never submit', async () => {
  setup(); const input = await form();
  for (const value of ['', '   ', 'a'.repeat(81)]) {
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  }
  assert.equal(requests.filter(r => r.method === 'PATCH').length, 0);
  assert.equal(notices.length, 3);
});
test('late response from another session cannot populate its cache', async () => {
  setup(); let resolve;
  answer = () => new Promise(r => { resolve = r; });
  const pending = updateBusinessProfile('TecnoGames');
  login('b', 'Other business');
  resolve({ ...profile, name: 'TecnoGames' });
  await assert.rejects(pending, /sesión anterior/);
  assert.equal(localStorage.getItem('businessName'), 'Other business');
});
test('fresh backend data overrides stale local cache after reload and new login', async () => {
  setup(); answer = async () => ({ ...profile, name: 'TecnoGames' });
  localStorage.setItem('businessName', 'Stale value');
  await getBusinessProfile();
  assert.equal(localStorage.getItem('businessName'), 'TecnoGames');
  session.clearSession(); login('a', 'TecnoGames');
  assert.equal(localStorage.getItem('businessName'), 'TecnoGames');
});

test('Home and side panel follow confirmed updates and storage events', async () => {
  setup();
  render(React.createElement(React.Fragment, null, React.createElement(Home), React.createElement(Panel)));
  await waitFor(() => assert.equal(document.querySelector('header').textContent, 'TecnoGmaes'));
  await act(async () => { await updateBusinessProfile('TecnoGames'); });
  assert.equal(document.querySelector('header').textContent, 'TecnoGames');
  assert.equal(document.querySelector('aside p').textContent, 'TecnoGames');
  await act(async () => {
    localStorage.setItem('businessName', 'Another tab');
    window.dispatchEvent(new dom.window.StorageEvent('storage', { key: 'businessName' }));
  });
  assert.equal(document.querySelector('header').textContent, 'Another tab');
});

test('pending save locks edits, prevents duplicate requests and delays success until footer', async () => {
  setup(); const input = await form(); const original = answer;
  let resolveFooter;
  answer = (url, init) => init.method === 'PATCH' && url.endsWith('store-footer-settings')
    ? new Promise(resolve => { resolveFooter = resolve; }) : original(url, init);
  fireEvent.change(input, { target: { value: 'TecnoGames' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => assert.ok(resolveFooter));
  assert.equal(document.querySelector('fieldset').disabled, true);
  assert.equal(notices.length, 0);
  fireEvent.click(screen.getByRole('button', { name: 'Guardando' }));
  assert.equal(requests.filter(r => r.method === 'PATCH').length, 2);
  await act(async () => { resolveFooter({ phones: [], socials: [] }); });
  await waitFor(() => assert.equal(notices.at(-1)?.[0], 'success'));
});

test('public metadata queries backend without owner storage or stale metadata cache', async () => {
  setup();
  session.clearSession();
  let publicName = 'TecnoGmaes';
  answer = async () => ({ name: publicName, slug: 'original', logoUrl: null });
  const props = () => ({ params: Promise.resolve({ slug: 'original' }) });
  assert.equal((await generateMetadata(props())).title.absolute, 'TecnoGmaes');
  publicName = 'TecnoGames';
  assert.equal((await generateMetadata(props())).title.absolute, 'TecnoGames');
  assert.equal(localStorage.getItem('businessName'), null);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(r => r.cache === 'no-store' && new URL(r.url).pathname === '/public/original/resolve'));
});

const storePage = require('../../app/tienda/[slug]/page.tsx');
const slugSection = () => screen.getByText('Dirección actual').parentElement.parentElement;
function slugSetup(overrides = {}) {
  setup();
  const current = { ...profile, slugChangedAt: null, ...overrides };
  answer = async (url, init) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/auth/business-slug-availability') return { mode: 'custom', slug: searchParams.get('slug'), available: searchParams.get('slug') !== 'ocupado' };
    if (pathname === '/businesses/profile/slug') {
      const { slug } = JSON.parse(init.body);
      if (slug === 'carrera') return new Response(JSON.stringify({ code: 'BUSINESS_SLUG_TAKEN', message: 'El identificador dejó de estar disponible. Elegí otro.' }), { status: 409 });
      Object.assign(current, { slug, slugChangedAt: '2026-11-06T00:00:00.000Z' });
      return current;
    }
    if (pathname === '/businesses/profile') return current;
    return { phones: [], socials: [] };
  };
  return current;
}
async function openSlugEditor(value) {
  await form();
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar dirección' }));
  fireEvent.change(screen.getByLabelText('Nuevo identificador'), { target: { value } });
  await screen.findByText('Disponible');
}

test('profile shows the current URL and confirms the single change before saving', async () => {
  slugSetup();
  await openSlugEditor('nuevo-slug');
  assert.match(slugSection().textContent, /\/tienda\/original/);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));
  assert.match(screen.getByRole('alertdialog').textContent, /una sola vez.*seguirá funcionando/);
  assert.equal(requests.some(r => r.url.endsWith('/businesses/profile/slug')), false);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));
  await waitFor(() => assert.match(slugSection().textContent, /\/tienda\/nuevo-slug/));
  assert.equal(localStorage.getItem('businessSlug'), 'nuevo-slug');
  assert.equal(localStorage.getItem('businessName'), 'TecnoGmaes');
  assert.equal(screen.queryByRole('button', { name: 'Cambiar dirección' }), null);
  assert.match(slugSection().textContent, /Ya utilizaste el cambio/);
  assert.deepEqual(JSON.parse(requests.find(r => r.url.endsWith('/businesses/profile/slug')).body), { slug: 'nuevo-slug' });
});

test('cancelling never sends the change and invalid identifiers cannot be saved', async () => {
  slugSetup();
  await openSlugEditor('otro-slug');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  assert.equal(screen.queryByLabelText('Nuevo identificador'), null);
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar dirección' }));
  fireEvent.change(screen.getByLabelText('Nuevo identificador'), { target: { value: 'Mal--Slug' } });
  assert.equal(screen.getByRole('button', { name: 'Guardar dirección' }).disabled, true);
  fireEvent.change(screen.getByLabelText('Nuevo identificador'), { target: { value: 'ocupado' } });
  await screen.findByText('Ocupado');
  assert.equal(requests.some(r => r.url.endsWith('/businesses/profile/slug')), false);
  assert.equal(localStorage.getItem('businessSlug'), 'original');
});

test('a 409 keeps the current address, storage and the available change', async () => {
  slugSetup();
  await openSlugEditor('carrera');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));
  await screen.findByText('El identificador dejó de estar disponible. Elegí otro.');
  assert.equal(localStorage.getItem('businessSlug'), 'original');
  assert.match(slugSection().textContent, /\/tienda\/original/);
  assert.ok(screen.getByRole('button', { name: 'Guardar dirección' }));
});

test('a used change shows only the current address', async () => {
  slugSetup({ slug: 'vigente', slugChangedAt: '2026-11-01T00:00:00.000Z' });
  await form();
  assert.match(slugSection().textContent, /\/tienda\/vigente/);
  assert.equal(screen.queryByRole('button', { name: 'Cambiar dirección' }), null);
  // The profile read is the source for the share link after a new login on another device.
  assert.equal(localStorage.getItem('businessSlug'), 'vigente');
});

test('store page redirects historical slugs with 308 to the current slug, keeping the query', async () => {
  setup(); session.clearSession();
  answer = async url => {
    const slug = decodeURIComponent(new URL(url).pathname.split('/')[2]);
    if (slug === 'missing') return new Response('{}', { status: 404 });
    return { slug: 'vigente', name: 'TecnoGames', logoUrl: null };
  };
  const call = async (slug, search = {}) => {
    try { return await storePage.default({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(search) }); }
    catch (error) { return error; }
  };
  assert.deepEqual(await call('anterior', { producto: '123', tag: ['a', 'b'] }), { redirect: '/tienda/vigente?producto=123&tag=a&tag=b', permanent: true });
  assert.deepEqual(await call('anterior'), { redirect: '/tienda/vigente', permanent: true });
  assert.equal((await call('vigente', { producto: '123' })).redirect, undefined);
  assert.deepEqual(await call('missing'), { notFound: true });
  const metadata = await storePage.generateMetadata({ params: Promise.resolve({ slug: 'anterior' }) });
  assert.equal(metadata.alternates.canonical, 'https://tienda.test/tienda/vigente');
  assert.ok(requests.every(r => r.cache === 'no-store' && new URL(r.url).pathname.endsWith('/resolve')));
});
