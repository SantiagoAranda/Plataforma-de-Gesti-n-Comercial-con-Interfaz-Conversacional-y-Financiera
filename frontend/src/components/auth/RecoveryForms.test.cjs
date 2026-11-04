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
const { render, screen, fireEvent, waitFor, cleanup } = require('@testing-library/react');
const requests = [];
const navigation = [];
const notices = [];
global.ResizeObserver = class { observe() {} disconnect() {} };
let answer = async () => ({ message: 'Si existe una cuenta con ese correo, recibirás instrucciones.' });
class AppApiError extends Error { constructor(status, message, details) { super(message); this.status = status; this.details = details; } }
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'react-hot-toast') return { __esModule:true, default:{error:message => notices.push(message)} };
  if (request === 'next/navigation') return { useRouter: () => ({ push: (path) => navigation.push(path) }) };
  if (request === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
  if (request === '../../lib/api' || request === '../api') return { api: async (path, options) => { requests.push({ path, options }); return answer(path, options); }, AppApiError };
  return originalLoad.call(this, request, parent, isMain);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => {
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  module._compile(source, filename);
};
const { ForgotPasswordForm, ResetPasswordForm } = require('./RecoveryForms.tsx');
const RegisterForm = require('./RegisterForm.tsx').default;
const LoginForm = require('./LoginForm.tsx').default;
afterEach(() => { cleanup(); requests.length = 0; navigation.length = 0; answer = async () => ({ message: 'Si existe una cuenta con ese correo, recibirás instrucciones.' }); });

test('forgot password displays a generic confirmation and submits the entered email once', async () => {
  render(React.createElement(ForgotPasswordForm));
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'fictional@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar instrucciones' }));
  await waitFor(() => assert.match(screen.getByRole('status').textContent, /Si existe una cuenta/));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/auth/forgot-password');
  assert.equal(JSON.parse(requests[0].options.body).email, 'fictional@example.test');
});

test('forgot password preserves the email on a 429', async () => {
  answer = async () => { throw new AppApiError(429, 'Demasiados intentos.', { retryAfterSeconds: 60 }); };
  render(React.createElement(ForgotPasswordForm));
  const email = screen.getByLabelText('Correo electrónico');
  fireEvent.change(email, { target: { value: 'fictional@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar instrucciones' }));
  await waitFor(() => assert.match(screen.getByRole('alert').textContent, /Demasiados intentos/));
  assert.equal(email.value, 'fictional@example.test');
  assert.equal(screen.getByRole('button', { name: /Reintentá en/ }).disabled, true);
});

test('reset rejects mismatched passwords, lets the user show them and reports expired links', async () => {
  window.history.replaceState(null, '', '/reset-password#token=' + 'a'.repeat(43));
  answer = async () => { throw new AppApiError(400, 'El enlace es inválido o venció. Solicitá uno nuevo.'); };
  render(React.createElement(ResetPasswordForm));
  const password = await screen.findByLabelText('Nueva contraseña');
  const confirmation = screen.getByLabelText('Confirmar contraseña');
  assert.equal(window.location.hash, '');
  fireEvent.change(password, { target: { value: 'Frase larga con espacios 1!' } });
  fireEvent.change(confirmation, { target: { value: 'Distinta frase larga 1!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseñas' }));
  assert.equal(password.type, 'text');
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
  assert.match(screen.getByRole('alert').textContent, /no coinciden/);
  assert.equal(requests.length, 0);
  fireEvent.change(confirmation, { target: { value: 'Frase larga con espacios 1!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
  await waitFor(() => assert.match(screen.getByRole('alert').textContent, /inválido o venció/));
  assert.equal(requests.length, 1);
  assert.equal(screen.getByRole('link', { name: 'Solicitar otro enlace' }).getAttribute('href'), '/forgot-password');
});

test('reset shows success and sends the user to login', async () => {
  window.history.replaceState(null, '', '/reset-password#token=' + 'b'.repeat(43));
  const originalTimer = window.setTimeout;
  let redirect;
  window.setTimeout = (callback) => { redirect = callback; return 1; };
  try {
    answer = async () => ({ message: 'Tu contraseña fue actualizada. Iniciá sesión con tu nueva contraseña.' });
    render(React.createElement(ResetPasswordForm));
    fireEvent.change(await screen.findByLabelText('Nueva contraseña'), { target: { value: 'Frase larga con espacios 1!' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'Frase larga con espacios 1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await waitFor(() => assert.match(screen.getByRole('status').textContent, /actualizada/));
    redirect();
    assert.deepEqual(navigation, ['/login']);
  } finally { window.setTimeout = originalTimer; }
});

test('reset keeps its in-memory token through React StrictMode effect replay', async () => {
  window.history.replaceState(null, '', '/reset-password#token=' + 'c'.repeat(43));
  render(React.createElement(React.StrictMode, null, React.createElement(ResetPasswordForm)));
  assert.ok(await screen.findByLabelText('Nueva contraseña'));
  assert.equal(window.location.hash, '');
});

for (const kind of ['register', 'reset']) {
  for (const value of ['Abcde1!', 'abcdefg1!', 'Abcdefg!', 'Abcdefg1', 'ABCDEF1!', 'Password123!', 'A1!' + 'x'.repeat(1021), 'A1!' + 'x'.repeat(1022), 'Á1' + '😀'.repeat(1022), '  Frase con ñ 1 !  ']) {
    test(kind + ' validates new password of ' + Array.from(value).length + ' code points / ' + new TextEncoder().encode(value).length + ' bytes', async () => {
      window.history.replaceState(null, '', kind === 'reset' ? '/reset-password#token=' + 'd'.repeat(43) : '/register');
      answer = async () => { throw new AppApiError(503, 'El registro está temporalmente deshabilitado.', {code:'AUTH_PASSWORD_POLICY_DISABLED'}); };
      const {container} = render(React.createElement(kind === 'reset' ? ResetPasswordForm : RegisterForm));
      for (const label of ['Mínimo 8 caracteres', 'Al menos una letra mayúscula', 'Al menos un número', 'Al menos un símbolo']) assert.match(container.textContent, new RegExp(label));
      assert.doesNotMatch(container.textContent, /1024|4096|filtrad|común|segura/);
      if (kind === 'register') {
        fireEvent.change(screen.getByPlaceholderText('Mi Negocio'), {target:{value:'Ficticio'}});
        fireEvent.change(screen.getByPlaceholderText('correo@ejemplo.com'), {target:{value:'fixture@example.test'}});
        fireEvent.change(screen.getByPlaceholderText('11 1234 5678'), {target:{value:'123456789'}});
      }
      const inputs = container.querySelectorAll('input[autocomplete="new-password"]');
      fireEvent.change(inputs[0], {target:{value}}); fireEvent.change(inputs[1], {target:{value}});
      fireEvent.click(screen.getByRole('button', {name:kind === 'reset' ? 'Cambiar contraseña' : 'Registrarse'}));
      const length = Array.from(value).length;
      const meets = length >= 8 && /\p{Lu}/u.test(value) && /\p{Nd}/u.test(value) && /[^\p{L}\p{N}\p{M}\s]/u.test(value);
      if (!meets || length > 1024) {
        assert.equal(requests.length, 0);
        if (length > 1024) assert.match(screen.getByRole('alert').textContent, /superar los 1024/);
        else assert.equal(screen.queryAllByRole('alert').length, 0);
        assert.equal(inputs[0].getAttribute('aria-invalid'), 'true');
        const ids = inputs[0].getAttribute('aria-describedby').split(' ');
        assert.ok(ids.every(id => document.getElementById(id)));
      } else {
        await waitFor(() => assert.match(container.textContent, /temporalmente deshabilitado/));
        assert.equal(requests.length, 1);
        assert.equal(JSON.parse(requests[0].options.body).password, value);
        assert.equal(inputs[0].value, value);
        assert.equal(inputs[1].value, value);
        assert.equal(navigation.length, 0);
        assert.doesNotMatch(container.textContent, /Tu sesión ha finalizado/);
      }
    });
  }
}

for (const priorNotice of [false, true]) test('503 followed by login: prior expiration notice=' + priorNotice, async () => {
  sessionStorage.clear(); notices.length = 0;
  if (priorNotice) sessionStorage.setItem('session_expired_notice', 'true');
  window.history.replaceState(null, '', '/register');
  answer = async () => { throw new AppApiError(503, 'El registro está temporalmente deshabilitado.', {code:'AUTH_PASSWORD_POLICY_DISABLED'}); };
  const registration = render(React.createElement(RegisterForm));
  fireEvent.change(screen.getByPlaceholderText('Mi Negocio'), {target:{value:'Ficticio'}});
  fireEvent.change(screen.getByPlaceholderText('correo@ejemplo.com'), {target:{value:'fixture@example.test'}});
  fireEvent.change(screen.getByPlaceholderText('11 1234 5678'), {target:{value:'123456789'}});
  for (const input of registration.container.querySelectorAll('input[autocomplete="new-password"]')) fireEvent.change(input, {target:{value:'Frase ficticia 1!'}});
  fireEvent.click(screen.getByRole('button', {name:'Registrarse'}));
  await waitFor(() => assert.match(registration.container.textContent, /temporalmente deshabilitado/));
  assert.deepEqual(notices, []);
  registration.unmount();
  window.history.replaceState(null, '', '/login');
  render(React.createElement(LoginForm));
  assert.equal(notices.length, priorNotice ? 1 : 0);
  if (priorNotice) assert.match(notices[0], /Tu sesión ha finalizado/);
  assert.equal(sessionStorage.getItem('session_expired_notice'), null);
  sessionStorage.clear();
});

for (const kind of ['register', 'reset']) {
  test(kind + ' collapses requirements when valid, reopens them, and toggles them manually', () => {
    window.history.replaceState(null, '', kind === 'reset' ? '/reset-password#token=' + 'e'.repeat(43) : '/register');
    const { container } = render(React.createElement(kind === 'reset' ? ResetPasswordForm : RegisterForm));
    const [pw, confirm] = container.querySelectorAll('input[autocomplete="new-password"]');
    const list = container.querySelector('ul[id$="password-help"]');
    const status = () => [...container.querySelectorAll('[role="status"]')].map(n => n.textContent);
    assert.equal(list.getAttribute('aria-hidden'), 'false');
    assert.equal(screen.queryByText('Ver requisitos'), null);
    assert.doesNotMatch(container.textContent, /no significa|segura\b/);
    fireEvent.change(pw, { target: { value: 'Abcdefg1!' } });
    assert.equal(list.getAttribute('aria-hidden'), 'true');
    assert.ok(list.hasAttribute('inert'));
    assert.ok(status().includes('La contraseña cumple los requisitos de formato'));
    assert.ok(!status().includes('Las contraseñas coinciden'));
    fireEvent.change(confirm, { target: { value: 'Abcdefg1' } });
    assert.ok(!status().includes('Las contraseñas coinciden'));
    fireEvent.change(confirm, { target: { value: 'Abcdefg1!' } });
    assert.ok(status().includes('Las contraseñas coinciden'));
    fireEvent.click(screen.getByText('Ver requisitos'));
    assert.equal(list.getAttribute('aria-hidden'), 'false');
    assert.equal(screen.getByText('Ocultar requisitos').getAttribute('aria-expanded'), 'true');
    fireEvent.click(screen.getByText('Ocultar requisitos'));
    assert.equal(list.getAttribute('aria-hidden'), 'true');
    fireEvent.click(screen.getByText('Ver requisitos'));
    fireEvent.change(pw, { target: { value: 'abcdefg1!' } });
    assert.equal(list.getAttribute('aria-hidden'), 'false');
    assert.equal(screen.queryByText('Ver requisitos'), null);
    assert.ok(!status().includes('La contraseña cumple los requisitos de formato'));
    assert.ok(!status().includes('Las contraseñas coinciden'));
    fireEvent.change(pw, { target: { value: 'Abcdefg1!' } });
    assert.equal(list.getAttribute('aria-hidden'), 'true');
  });
}

test('empty password fields show no valid check', () => {
  window.history.replaceState(null, '', '/register');
  const { container } = render(React.createElement(RegisterForm));
  assert.deepEqual([...container.querySelectorAll('[role="status"]')].map(n => n.textContent.trim()).filter(Boolean), []);
});

test('login places the recovery link after the submit button and keeps its destination', () => {
  const { container } = render(React.createElement(LoginForm));
  const submit = screen.getByRole('button', { name: 'Ingresar' });
  const link = screen.getByRole('link', { name: 'Recuperarla' });
  assert.equal(link.getAttribute('href'), '/forgot-password');
  assert.ok(submit.compareDocumentPosition(link) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(container.querySelectorAll('a[href="/forgot-password"]').length, 1);
  assert.ok(container.textContent.indexOf('¿Olvidaste tu contraseña?') > container.textContent.indexOf('Ingresar'));
});

test('recovery footer links keep their destinations', () => {
  render(React.createElement(ForgotPasswordForm));
  assert.equal(screen.getByRole('link', { name: 'Volver a iniciar sesión' }).getAttribute('href'), '/login');
});
