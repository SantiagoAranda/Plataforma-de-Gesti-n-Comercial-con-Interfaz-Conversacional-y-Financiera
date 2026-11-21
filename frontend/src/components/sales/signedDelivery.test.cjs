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
const { render, screen, fireEvent, cleanup, waitFor } = require('@testing-library/react');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith('@/')) request = path.join(__dirname, '../../..', request.slice(2));
  return originalResolve.call(this, request, ...args);
};
require.extensions['.tsx'] = require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const Panel = require('./SignedDeliveryPanel.tsx').default;
const h = React.createElement;
afterEach(cleanup);

const attached = { attached: true, mimeType: 'application/pdf', sizeBytes: 2048, originalName: 'f.pdf', updatedAt: 'x' };
const fake = (initial, calls = []) => ({
  get: async () => initial,
  upload: async (id, file) => (calls.push(['upload', id, file.name]), { ...attached, mimeType: 'image/webp' }),
  remove: async (id) => (calls.push(['remove', id]), { attached: false }),
  file: async (id) => (calls.push(['file', id]), new Blob(['x'])),
});

test('sin copia ofrece adjuntar; al elegir un archivo lo sube y pasa a «Reemplazar»', async () => {
  const calls = [];
  render(h(Panel, { orderId: 'o1', service: fake({ attached: false }, calls) }));
  await screen.findByRole('button', { name: /Adjuntar/ });
  assert.equal(screen.queryByRole('button', { name: /Quitar/ }), null);
  fireEvent.change(screen.getByLabelText('Archivo de la copia firmada'), { target: { files: [new File(['x'], 'firma.jpg', { type: 'image/jpeg' })] } });
  await screen.findByRole('button', { name: /Reemplazar/ });
  assert.deepEqual(calls, [['upload', 'o1', 'firma.jpg']]);
  assert.match(document.body.textContent, /Foto/);
});

test('con copia muestra tipo y tamaño, y permite ver y quitar con confirmación', async () => {
  const calls = [];
  window.open = (url) => calls.push(['open', url.startsWith('blob:')]);
  URL.createObjectURL = () => 'blob:x'; URL.revokeObjectURL = () => {};
  render(h(Panel, { orderId: 'o1', service: fake(attached, calls) }));
  await screen.findByRole('button', { name: /Ver/ });
  assert.match(document.body.textContent, /PDF · 2 KB/);
  fireEvent.click(screen.getByRole('button', { name: /Ver/ }));
  await waitFor(() => assert.deepEqual(calls.at(-1), ['open', true]));

  window.confirm = () => false;
  fireEvent.click(screen.getByRole('button', { name: /Quitar/ }));
  assert.equal(calls.some((c) => c[0] === 'remove'), false);
  window.confirm = () => true;
  fireEvent.click(screen.getByRole('button', { name: /Quitar/ }));
  await screen.findByRole('button', { name: /Adjuntar/ });
  assert.deepEqual(calls.filter((c) => c[0] === 'remove'), [['remove', 'o1']]);
});

test('un archivo de más de 10 MB no se envía', async () => {
  const calls = [];
  render(h(Panel, { orderId: 'o1', service: fake({ attached: false }, calls) }));
  await screen.findByRole('button', { name: /Adjuntar/ });
  const big = new File(['x'], 'grande.pdf', { type: 'application/pdf' });
  Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
  fireEvent.change(screen.getByLabelText('Archivo de la copia firmada'), { target: { files: [big] } });
  assert.deepEqual(calls, []);
});
