/* eslint-disable @typescript-eslint/no-require-imports -- Node-based page test harness. */
// Real Ventas page + real SaleDetailsModal + real react-hot-toast + real services/sales -> api;
// only fetch, heavy children and unrelated data hooks are stubbed.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/venta' });
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.MutationObserver = dom.window.MutationObserver;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.matchMedia = window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.HTMLElement.prototype.scrollIntoView = () => {};
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { render, screen, cleanup, act, fireEvent, waitFor } = require('@testing-library/react');

const ROOT = path.resolve(__dirname, '../../..');
const h = React.createElement;
const Null = () => null;
const stubs = {
  'next/navigation': { useRouter: () => ({ replace() {}, push() {} }), useSearchParams: () => new URLSearchParams() },
  'next/dynamic': { __esModule: true, default: () => Null },
  '@/src/components/layout/AppHeader': { __esModule: true, default: Null },
  '@/src/components/shared/EmptyStateCard': { EmptyStateCard: Null },
  '@/src/components/sales/SalesList': {
    __esModule: true,
    default: ({ sales, onDetails }) => h('ul', null, sales.map((s) => h('li', { key: s.id }, h('button', { onClick: () => onDetails(s) }, `ver ${s.id}`)))),
  },
  '@/src/components/sales/SalesChatComposer': { __esModule: true, default: Null },
  './SalesChatComposer': { __esModule: true, default: Null },
  '@/src/components/sales/SalesFilterModal': { __esModule: true, default: Null },
  '@/src/components/sales/FiscalDocumentDetailModal': { __esModule: true, default: Null },
  '@/src/components/sales/ElectronicInvoiceConfirmModal': { __esModule: true, default: Null },
  '@/src/components/shared/selection/SelectionActionBar': { SelectionActionBar: Null },
  '@/src/components/shared/DayPickerCalendar': {
    __esModule: true,
    default: ({ onSelectDate }) => h('button', { onClick: () => onSelectDate(new Date(2026, 10, 11)) }, 'ir al 11/11'),
    isSameCalendarDay: (a, b) => a.toDateString() === b.toDateString(),
  },
  '@/src/services/fiscalDocuments': new Proxy({}, { get: () => async () => [] }),
  '@/src/hooks/useTaxSettings': { useTaxSettings: () => ({ taxSettingsEnabled: false }) },
  '@/src/hooks/useFeatureFlags': { useFeatureFlags: () => ({ simpleRegimeSalesEnabled: true }) },
  '@/src/lib/settings/api': { getTaxProfile: async () => ({}) },
  '@/src/lib/businessLogo': { getBusinessProfile: async () => ({}) },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (stubs[request]) return stubs[request];
  return originalLoad.call(this, request, parent, isMain);
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) request = path.join(ROOT, request.slice(2));
  return originalResolve.call(this, request, ...rest);
};
Module._extensions['.tsx'] = Module._extensions['.ts'] = (module, filename) => {
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  module._compile(source, filename);
};

const { Toaster } = require('react-hot-toast');
const VentaPage = require('./page.tsx').default;

// --- fake backend --------------------------------------------------------
const reservation = (status, extra = {}) => ({
  id: 'res-1', sourceType: 'RESERVATION', status, customerName: 'Ana', paymentMethod: 'CASH',
  origin: 'MANUAL', createdAt: new Date().toISOString(), scheduledAt: '2026-11-10T13:00:00.000Z',
  type: 'SERVICIO', total: 1000, items: [{ name: 'Corte', qty: 1, unitPrice: 1000, price: 1000 }], ...extra,
});
const order = { ...reservation('PENDIENTE'), id: 'ord-1', sourceType: 'ORDER', type: 'PRODUCTO', scheduledAt: undefined };
// Manual service sale with appointment: the ORDER owns a mirror Reservation with the same id.
const serviceOrder = (status) => ({ ...reservation(status), id: 'ord-svc', sourceType: 'ORDER', scheduledAt: '2026-11-20T08:00:00' });
let rows; let calls; let cancelResponse;
global.fetch = async (url, init = {}) => {
  const u = new URL(url);
  calls.push(`${init.method ?? 'GET'} ${u.pathname}${u.search}`);
  const json = (status, body) => ({ ok: status < 400, status, statusText: '', text: async () => JSON.stringify(body) });
  if (u.pathname === '/sales' && (init.method ?? 'GET') === 'GET') return json(200, rows);
  if (u.pathname.endsWith('/cancel')) {
    const [status, body] = cancelResponse();
    if (status < 400) rows = rows.filter((r) => r.id !== u.pathname.split('/')[2]); // cancelled leaves the default list
    return json(status, body);
  }
  return json(200, {});
};

afterEach(async () => {
  cleanup();
  const toast = require('react-hot-toast').default;
  await act(async () => { toast.remove(); });
});

async function openDetails(sale) {
  rows = [sale]; calls = [];
  render(h(React.Fragment, null, h(Toaster), h(VentaPage)));
  fireEvent.click(await screen.findByText(`ver ${sale.id}`));
  return screen.getByText('Detalle de Venta');
}

async function cancelThroughDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
  const confirm = await screen.findByRole('button', { name: 'Sí, cancelar reserva' });
  fireEvent.click(confirm);
}

for (const [label, status] of [['PENDING', 'PENDIENTE'], ['CONFIRMED', 'CERRADO']]) {
  test(`${label} reservation is cancelled from the button and the list refreshes without reload`, async () => {
    cancelResponse = () => [200, { id: 'res-1', status: 'CANCELLED' }];
    await openDetails(reservation(status, status === 'CERRADO' ? { inventoryPostedAt: '2026-11-09T11:00:00.000Z' } : {}));
    await cancelThroughDialog();
    assert.ok(await screen.findByText('Reserva cancelada. El horario quedó libre.'));
    assert.ok(calls.includes('PATCH /sales/res-1/cancel?sourceType=RESERVATION'));
    assert.equal(calls.filter((c) => c.startsWith('GET /sales')).length, 2, 'list reloaded after cancelling');
    await waitFor(() => assert.equal(screen.queryByText('Detalle de Venta'), null));
    assert.equal(screen.queryByText('ver res-1'), null);
  });
}

test('reservation detail shows "Cancelar reserva" and never the trash "Eliminar" at the same time', async () => {
  await openDetails(reservation('PENDIENTE'));
  assert.ok(screen.getByRole('button', { name: 'Cancelar reserva' }));
  assert.equal(screen.queryByRole('button', { name: 'Eliminar venta' }), null);
});

test('a cancelled reservation keeps archive (trash) but offers no second cancel', async () => {
  await openDetails(reservation('CANCELADO'));
  assert.equal(screen.queryByRole('button', { name: 'Cancelar reserva' }), null);
  assert.ok(screen.getByRole('button', { name: 'Eliminar venta' }));
});

test('normal sales keep the trash "Eliminar" and get no reservation cancel', async () => {
  await openDetails(order);
  assert.ok(screen.getByRole('button', { name: 'Eliminar venta' }));
  assert.equal(screen.queryByRole('button', { name: 'Cancelar reserva' }), null);
});

test('pending ORDER with appointment is cancelled as ORDER (never via the mirror id as RESERVATION)', async () => {
  cancelResponse = () => [200, { id: 'ord-svc', status: 'CANCELLED' }];
  await openDetails(serviceOrder('PENDIENTE'));
  assert.equal(screen.queryByRole('button', { name: 'Eliminar venta' }), null);
  await cancelThroughDialog();
  assert.ok(await screen.findByText('Reserva cancelada. El horario quedó libre.'));
  assert.deepEqual(calls.filter((c) => c.includes('/cancel')), ['PATCH /sales/ord-svc/cancel?sourceType=ORDER']);
  assert.equal(calls.filter((c) => c.startsWith('GET /sales')).length, 2, 'list reloaded after cancelling');
});

test('confirmed ORDER with appointment offers no cancel nor delete (only «Revertir venta»)', async () => {
  await openDetails({ ...serviceOrder('CERRADO'), inventoryPostedAt: '2026-11-09T11:00:00.000Z' });
  assert.equal(screen.queryByRole('button', { name: 'Cancelar reserva' }), null);
  assert.equal(screen.queryByRole('button', { name: 'Eliminar venta' }), null);
});

test('cancelled ORDER with appointment keeps «Eliminar» (archive) and no second cancel', async () => {
  await openDetails(serviceOrder('CANCELADO'));
  assert.equal(screen.queryByRole('button', { name: 'Cancelar reserva' }), null);
  assert.ok(screen.getByRole('button', { name: 'Eliminar venta' }));
});

test('dismissing the dialog ("Volver") does not call the backend', async () => {
  await openDetails(reservation('PENDIENTE'));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Volver' }));
  await act(async () => {});
  assert.equal(calls.some((c) => c.includes('/cancel')), false);
  assert.ok(screen.getByText('Detalle de Venta'));
});

test('reopening the dialog right after «Volver» keeps it open (no stale 1 s removal)', async () => {
  await openDetails(reservation('PENDIENTE'));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Volver' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
  await act(() => new Promise((r) => setTimeout(r, 1300)));
  assert.ok(screen.getByRole('button', { name: 'Sí, cancelar reserva' }));
});

for (const [status, message] of [
  [400, 'Solicitud inválida'],
  [404, 'Reserva no encontrada'],
  [409, 'Esta reserva está vinculada a una venta. Cancelala desde Ventas.'],
  [500, 'No se pudo cancelar la reserva. Intentá nuevamente.'],
  ['network', 'No se pudo cancelar la reserva. Intentá nuevamente.'],
]) {
  test(`${status} on cancel shows a readable message and keeps the detail open`, async () => {
    cancelResponse = () => {
      if (status === 'network') throw new TypeError('Failed to fetch');
      return [status, { statusCode: status, message: status === 500 ? 'Internal server error' : message }];
    };
    await openDetails(reservation('PENDIENTE'));
    await cancelThroughDialog();
    assert.ok(await screen.findByText(message));
    assert.ok(screen.getByText('Detalle de Venta'));
    assert.ok(screen.getByRole('button', { name: 'Cancelar reserva' }));
  });
}

test('the 11/11 calendar shows a service sold on 09/11 only under "Fecha del turno"', async () => {
  rows = [reservation('PENDIENTE', { id: 'svc-1', createdAt: '2026-11-09T15:00:00.000Z', scheduledAt: '2026-11-11T09:00:00' })];
  calls = [];
  render(h(React.Fragment, null, h(Toaster), h(VentaPage)));
  await act(async () => {});
  fireEvent.click(screen.getByText('ir al 11/11'));
  assert.equal(screen.queryByText('ver svc-1'), null, 'registered on 09/11, not on 11/11');
  fireEvent.click(screen.getByRole('button', { name: 'Fecha del turno' }));
  assert.ok(await screen.findByText('ver svc-1'));
  fireEvent.click(screen.getByRole('button', { name: 'Fecha de registro' }));
  assert.equal(screen.queryByText('ver svc-1'), null);
});
