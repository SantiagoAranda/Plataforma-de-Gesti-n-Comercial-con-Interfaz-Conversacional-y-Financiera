const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
global.window = dom.window; global.document = dom.window.document;
for (const key of ['HTMLElement', 'Element', 'Node']) global[key] = dom.window[key];
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
require.extensions['.css'] = () => {};
require.extensions['.tsx'] = require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const React = require('react');
const { render, cleanup } = require('@testing-library/react');
const { formatCop, amountInWords, documentTotals, addDays, formatTime } = require('./format.ts');
const { paginate } = require('./paginate.ts');
const { makeFixture } = require('./fixtures.ts');
const { TicketDocument } = require('./documents.tsx');
const CartaDocument = require('./CartaDocument.tsx').default;
const { quotationSpec, deliveryOrderSpec } = require('./documents.tsx');
const h = React.createElement;

afterEach(cleanup);

test('amountInWords usa apócope y "de" en millones exactos', () => {
  assert.equal(amountInWords(0), 'Cero pesos M/CTE');
  assert.equal(amountInWords(100), 'Cien pesos M/CTE');
  assert.equal(amountInWords(21), 'Veintiún pesos M/CTE');
  assert.equal(amountInWords(1001), 'Mil un pesos M/CTE');
  assert.equal(amountInWords(21000), 'Veintiún mil pesos M/CTE');
  assert.equal(amountInWords(1250000), 'Un millón doscientos cincuenta mil pesos M/CTE');
  assert.equal(amountInWords(2000000), 'Dos millones de pesos M/CTE');
});

test('documentTotals no suma las líneas con precio por consultar', () => {
  const t = documentTotals([
    { description: 'a', quantity: 2, unitPrice: 1000 },
    { description: 'b', quantity: 3, unitPrice: null },
  ], 190);
  assert.deepEqual(t, { subtotal: 2000, vat: 190, total: 2190, units: 5, unpriced: 1 });
  assert.equal(formatCop(1234567), '1.234.567');
});

test('formatTime usa espacios normales (evita el desajuste de hidratación Node/Chrome)', () => {
  assert.match(formatTime('2026-09-27T20:13:00.000Z'), /^03:13 p\. m\.$/);
});

test('addDays suma días de calendario', () => {
  assert.equal(addDays('2026-09-27T20:13:00.000Z', 15).slice(0, 10), '2026-10-12');
});

const base = { head: 300, chead: 40, base: 0, side1: 200, sideC: 60, th: 36, totals: 200, bottom: 150, foot: 44 };

test('paginate: pocas filas caben en una hoja con totales', () => {
  assert.deepEqual(paginate({ ...base, rows: [40, 40, 40] }), [{ first: true, a: 0, b: 3, tail: true }]);
});

test('paginate: cada fila aparece una sola vez y en orden', () => {
  for (const n of [0, 1, 14, 15, 16, 30, 60, 61, 120]) {
    const pages = paginate({ ...base, rows: Array(n).fill(40) });
    const seen = pages.flatMap((p) => Array.from({ length: p.b - p.a }, (_, i) => p.a + i));
    assert.deepEqual(seen, Array.from({ length: n }, (_, i) => i), `n=${n}`);
    assert.equal(pages.filter((p) => p.tail).length, 1, `n=${n}`);
    assert.ok(pages[pages.length - 1].tail, `n=${n}`);
    assert.ok(pages[0].first && pages.slice(1).every((p) => !p.first), `n=${n}`);
  }
});

test('paginate: si los totales no caben, la última hoja recibe filas de la anterior', () => {
  // la 1.ª hoja admite 15 filas (622 px); con 15 los totales + parte inferior no caben
  const pages = paginate({ ...base, rows: Array(15).fill(40) });
  assert.equal(pages.length, 2);
  assert.equal(pages[0].b, pages[1].a);
  assert.ok(pages[1].tail && pages[1].b - pages[1].a >= 1);
});

test('ticket 58 y 80 mm; precio por consultar no se suma', () => {
  const data = makeFixture();
  const { container } = render(h(TicketDocument, { kind: 'quotation', d: data, width: 58, showPrices: true }));
  assert.ok(container.querySelector('.sheet-ticket.w58'));
  assert.match(container.textContent, /Consultar precio/);
  assert.match(container.textContent, /COTIZACIÓN No\. COT-1024/);
  cleanup();
  const r = render(h(TicketDocument, { kind: 'delivery', d: data, width: 80, showPrices: false }));
  assert.ok(!r.container.querySelector('.w58'));
  assert.doesNotMatch(r.container.textContent, /TOTAL/);
  assert.match(r.container.textContent, /Recibido por/);
});

function patchHeights() {
  const heights = { head: 300, chead: 40, base: 0, side1: 200, sideC: 60, th: 36, totals: 200, bottom: 150, foot: 44 };
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      if (this.tagName === 'TR') return 40;
      return heights[this.getAttribute?.('data-m')] ?? 0;
    },
  });
}

test('carta: 60 filas se reparten en varias hojas, sin repetir ni perder filas', () => {
  patchHeights();
  const data = makeFixture(56); // 4 + 56 = 60 líneas
  const { container } = render(h(CartaDocument, { spec: quotationSpec(data) }));
  const sheets = container.querySelectorAll('.cv-pages .sheet-carta');
  assert.ok(sheets.length > 1, `hojas: ${sheets.length}`);
  assert.match(sheets[0].textContent, /Cotización/);
  assert.match(sheets[sheets.length - 1].textContent, /Total cotizado/);
  assert.match(sheets[sheets.length - 1].textContent, /Valor en letras/);
  assert.match(sheets[0].textContent, new RegExp(`Página 1 de ${sheets.length}`));
  const rows = container.querySelectorAll('.cv-pages tbody tr').length;
  assert.equal(rows, 60);
});

test('carta: la orden de entrega sin precios solo muestra unidades', () => {
  patchHeights();
  const data = { ...makeFixture(), number: 'OE-1024' };
  const { container } = render(h(CartaDocument, { spec: deliveryOrderSpec(data, false) }));
  const text = container.querySelector('.cv-pages').textContent;
  assert.match(text, /Unidades a entregar/);
  assert.doesNotMatch(text, /Valor unit\./);
  assert.equal(container.querySelectorAll('.cv-pages .cv-check').length, 4);
});
