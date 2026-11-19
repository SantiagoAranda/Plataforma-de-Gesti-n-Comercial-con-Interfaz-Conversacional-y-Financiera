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
require.extensions['.css'] = () => {};
require.extensions['.tsx'] = require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const QuotationCard = require('./QuotationCard.tsx').default;
const { quotationView, quotationActions, quotationToDocumentData, quotationWhatsAppUrl, QUOTATION_BADGES } = require('../../lib/quotations/quotationPresentation.ts');
const h = React.createElement;
afterEach(cleanup);

const quote = (over = {}) => ({
  id: 'q1', publicToken: 't', number: 7, displayNumber: 'COT-0007', status: 'OPEN', expired: false, origin: 'PUBLIC_STORE',
  customer: { name: 'Ana Pérez', whatsapp: '+57 300 111 2233', email: 'ana@x.co', document: 'CC 1020' },
  note: null, validityDays: 15, validUntil: '2026-12-04T15:00:00.000Z', sentAt: null, acceptedAt: null, rejectedAt: null, cancelledAt: null, convertedAt: null,
  subtotal: 116000, taxTotal: 22040, total: 138040, currency: 'COP',
  items: [
    { id: 'i1', itemId: 'p1', name: 'Vinilo', description: 'Rinde 40 m²', quantity: 2, unitPrice: 58000, lineTotal: 116000 },
    { id: 'i2', itemId: 'p2', name: 'Asesoría', description: null, quantity: 1, unitPrice: null, lineTotal: null },
  ],
  createdAt: '2026-11-19T15:00:00.000Z', updatedAt: '2026-11-19T15:00:00.000Z', ...over,
});
const biz = { name: 'Tecno', fiscalId: '900.1', phoneWhatsapp: '3000000' };

test('quotationView deriva «vencida» de expired solo en OPEN', () => {
  assert.equal(quotationView(quote()), 'OPEN');
  assert.equal(quotationView(quote({ expired: true })), 'EXPIRED');
  assert.equal(quotationView(quote({ status: 'ACCEPTED', expired: true })), 'ACCEPTED');
  assert.equal(QUOTATION_BADGES.OPEN.label, 'Cotización');
});

test('las acciones ofrecidas siguen la tabla de transiciones del backend', () => {
  assert.deepEqual(quotationActions(quote()), ['send', 'accept', 'reject', 'cancel']);
  assert.deepEqual(quotationActions(quote({ expired: true })), ['reject', 'cancel']);
  assert.deepEqual(quotationActions(quote({ status: 'ACCEPTED' })), ['cancel']);
  for (const status of ['REJECTED', 'CANCELLED', 'CONVERTED']) assert.deepEqual(quotationActions(quote({ status })), [], status);
});

test('quotationToDocumentData usa el número real, la descripción y «consultar precio»', () => {
  const d = quotationToDocumentData(quote(), biz);
  assert.equal(d.number, 'COT-0007');
  assert.equal(d.validityDays, 15);
  assert.equal(d.vatAmount, 22040);
  assert.deepEqual(d.customer, { name: 'Ana Pérez', document: 'CC 1020', phone: '+57 300 111 2233', email: 'ana@x.co' });
  assert.deepEqual(d.lines, [
    { description: 'Vinilo', detail: 'Rinde 40 m²', quantity: 2, unitPrice: 58000 },
    { description: 'Asesoría', detail: undefined, quantity: 1, unitPrice: null },
  ]);
  assert.equal(quotationToDocumentData(quote({ customer: { name: null, whatsapp: null, email: null, document: null } }), null).customer.name, 'Consumidor final');
});

test('el enlace de WhatsApp resume la cotización; sin número no hay enlace', () => {
  const url = quotationWhatsAppUrl(quote(), 'Tecno');
  assert.match(url, /^https:\/\/wa\.me\/573001112233\?text=/);
  const text = decodeURIComponent(url.split('text=')[1]);
  assert.match(text, /\*COT-0007\* de \*Tecno\*/);
  assert.match(text, /2 x Vinilo: \$116\.000/);
  assert.match(text, /1 x Asesoría: consultar precio/);
  assert.match(text, /\*Total: \$138\.040\*/);
  assert.match(text, /Válida hasta el 4 de diciembre de 2026/);
  assert.match(decodeURIComponent(quotationWhatsAppUrl(quote(), 'Tecno', 'https://app.co/cotizacion/t').split('text=')[1]), /Ver y descargar: https:\/\/app\.co\/cotizacion\/t/);
  assert.doesNotMatch(text, /Ver y descargar/);
  assert.equal(quotationWhatsAppUrl(quote({ customer: { name: 'Ana', whatsapp: null, email: null, document: null } })), null);
});

test('la tarjeta muestra estado, total y «Consultar precio»; el menú ofrece lo válido', () => {
  const calls = [];
  const props = { quotation: quote(), onView: (q) => calls.push(['view', q.id]), onSend: (q) => calls.push(['send', q.id]), onAction: (q, a) => calls.push([a, q.id]) };
  render(h(QuotationCard, props));
  assert.ok(screen.getByText('Cotización'));
  assert.ok(screen.getByText('Ref: COT-0007'));
  assert.ok(screen.getByText('$138.040'));
  assert.ok(screen.getByText('Consultar precio'));
  assert.match(document.body.textContent, /No incluye 1 producto con precio por consultar/);
  fireEvent.click(screen.getByRole('button', { name: 'Opciones de venta' }));
  assert.deepEqual(
    Array.from(screen.getByRole('dialog').querySelectorAll('button')).map((b) => b.textContent),
    ['Ver cotización', 'Enviar por WhatsApp', 'Marcar como aceptada', 'Marcar como rechazada', 'Cancelar cotización'],
  );
  fireEvent.click(screen.getByRole('button', { name: 'Marcar como aceptada' }));
  assert.deepEqual(calls, [['accept', 'q1']]);
  assert.equal(screen.queryByRole('dialog'), null);
});

test('vencida: sin enviar ni aceptar; aceptada: solo cancelar; finales: sin acciones', () => {
  const open = (q) => {
    cleanup();
    render(h(QuotationCard, { quotation: q, onView: () => {}, onSend: () => {}, onAction: () => {} }));
    fireEvent.click(screen.getByRole('button', { name: 'Opciones de venta' }));
    return Array.from(screen.getByRole('dialog').querySelectorAll('button')).map((b) => b.textContent);
  };
  assert.deepEqual(open(quote({ expired: true })), ['Ver cotización', 'Marcar como rechazada', 'Cancelar cotización']);
  assert.ok(screen.getByText('Vencida'));
  assert.match(document.body.textContent, /Venció el/);
  assert.deepEqual(open(quote({ status: 'ACCEPTED' })), ['Ver cotización', 'Cancelar cotización']);
  assert.deepEqual(open(quote({ status: 'REJECTED' })), ['Ver cotización']);
});

test('el botón WhatsApp se desactiva sin número o sin poder enviar', () => {
  const noop = { onView: () => {}, onSend: () => assert.fail('no debe enviar'), onAction: () => {} };
  render(h(QuotationCard, { ...noop, quotation: quote({ customer: { name: 'Ana', whatsapp: null, email: null, document: null } }) }));
  assert.equal(screen.getByRole('button', { name: 'WhatsApp' }).disabled, true);
  cleanup();
  render(h(QuotationCard, { ...noop, quotation: quote({ status: 'CANCELLED' }) }));
  assert.equal(screen.getByRole('button', { name: 'WhatsApp' }).disabled, true);
  cleanup();
  const sent = [];
  render(h(QuotationCard, { ...noop, onSend: (q) => sent.push(q.id), quotation: quote() }));
  assert.equal(screen.getByRole('button', { name: 'WhatsApp' }).disabled, false);
  fireEvent.click(screen.getByRole('button', { name: 'WhatsApp' }));
  assert.deepEqual(sent, ['q1']);
});
