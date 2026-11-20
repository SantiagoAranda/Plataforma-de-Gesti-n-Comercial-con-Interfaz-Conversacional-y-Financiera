const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
global.window = dom.window; global.document = dom.window.document;
for (const key of ['HTMLElement', 'Element', 'Node', 'MutationObserver']) global[key] = dom.window[key];
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { render, screen, fireEvent, cleanup } = require('@testing-library/react');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith('@/')) request = path.join(__dirname, '../../..', request.slice(2));
  return originalResolve.call(this, request, ...args);
};
require.extensions['.tsx'] = require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const CartSummary = require('./CartSummary.tsx').default;
const h = React.createElement;
afterEach(cleanup);

const base = (over = {}) => ({
  items: [{ id: 'p1', name: 'Vinilo', price: 58000, quantity: 2 }],
  onIncreaseQty() {}, onDecreaseQty() {}, onPaymentMethodChange() {}, onClose() {},
  customerName: 'Ana Pérez', documentNumber: '1020', countryCode: '57', phoneNumber: '3001112233', paymentMethod: 'CASH',
  onConfirm: () => assert.fail('no debe confirmar el pedido'),
  ...over,
});

test('sin onRequestQuotation no aparece el botón (carrito interno)', () => {
  render(h(CartSummary, base()));
  assert.equal(screen.queryByRole('button', { name: /Solicitar cotización/ }), null);
});

test('«Solicitar cotización» valida el contacto y entrega el documento', () => {
  const calls = [];
  render(h(CartSummary, base({ onRequestQuotation: (doc) => calls.push(doc) })));
  fireEvent.click(screen.getByRole('button', { name: /Solicitar cotización/ }));
  assert.deepEqual(calls, ['1020']);

  cleanup();
  render(h(CartSummary, base({ customerName: 'A', onRequestQuotation: () => assert.fail('nombre inválido') })));
  fireEvent.click(screen.getByRole('button', { name: /Solicitar cotización/ }));
});

test('la cotización no espera al total fiscal; el pedido sí', () => {
  const calls = [];
  render(h(CartSummary, base({ isFiscalTotalPending: true, onRequestQuotation: (d) => calls.push(d) })));
  fireEvent.click(screen.getByRole('button', { name: /Solicitar cotización/ }));
  assert.deepEqual(calls, ['1020']);
  assert.equal(screen.getByRole('button', { name: /Confirmar Pedido/ }).disabled, true);
});

test('mientras envía, el botón se desactiva', () => {
  render(h(CartSummary, base({ isRequestingQuotation: true, onRequestQuotation: () => {} })));
  assert.equal(screen.getByRole('button', { name: /Enviando/ }).disabled, true);
});
