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
const { render, screen, cleanup, waitFor } = require('@testing-library/react');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith('@/')) request = path.join(__dirname, '../../..', request.slice(2));
  return originalResolve.call(this, request, ...args);
};
const settlementsById = {};
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === '@/src/lib/payroll/api') {
    return { payrollApi: { getSettlement: async (id) => settlementsById[id] } };
  }
  return originalLoad.call(this, request, ...args);
};
require.extensions['.tsx'] = require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { SheetShell } = require('./SheetShell.tsx');
const { SettlementReportDetail, SettlementReportSheet } = require('./SettlementReport.tsx');
const h = React.createElement;
afterEach(cleanup);

const settlement = {
  id: 'set-1',
  employeeId: 'emp-1',
  contractId: 'con-1',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-10-31T00:00:00.000Z',
  requestedEndDate: '2026-10-31T00:00:00.000Z',
  totalWorkedDays: 300,
  causedDays: 300,
  calculationYear: 2026,
  severance: '1666667', severanceInterest: '166667', vacation: '729544',
  // Deliberately different from the sum of lines: the UI must show the backend total as-is.
  totalAmount: '4229545',
  vacationDays: '12.5', hourlyRate: '8000',
  lines: [
    { code: 'SEVERANCE', name: 'Cesantias', amount: '1666667' },
    { code: 'SEVERANCE_INTEREST', name: 'Intereses cesantias', amount: '166667' },
    { code: 'VACATION', name: 'Vacaciones', amount: '729544' },
  ],
};

test('SheetShell shares the modal layer, marks itself open and keeps the footer in flow', () => {
  render(h(SheetShell, { open: true, title: 'Pagar Prima de Servicios II', subtitle: 'Periodo', onClose() {}, footer: h('button', null, 'Confirmar pago') }, h('p', null, 'contenido')));
  const dialog = screen.getByRole('dialog', { name: 'Pagar Prima de Servicios II' });
  assert.ok(dialog.hasAttribute('data-modal-open'));
  assert.match(dialog.className, /z-\[120\]/);
  assert.equal(document.querySelector('body:has([data-modal-open])'), document.body);
  const footer = screen.getByText('Confirmar pago').parentElement;
  assert.doesNotMatch(footer.className, /absolute/);
  assert.match(footer.className, /shrink-0/);
  assert.match(footer.className, /safe-area-inset-bottom/);
  cleanup();
  assert.equal(document.querySelector('body:has([data-modal-open])'), null);
});

test('SheetShell renders nothing while closed', () => {
  render(h(SheetShell, { open: false, title: 'X', subtitle: '', onClose() {}, footer: null }, 'x'));
  assert.equal(document.querySelector('[data-modal-open]'), null);
});

test('PayrollChatActionBar hides itself while any modal is open', () => {
  const source = fs.readFileSync(path.join(__dirname, 'PayrollChatActionBar.tsx'), 'utf8');
  assert.match(source, /\[body:has\(\[data-modal-open\]\)_&\]:hidden/);
});

test('SettlementReportDetail shows exactly the backend lines and total, without recalculating', () => {
  render(h(SettlementReportDetail, { settlement }));
  for (const line of settlement.lines) assert.ok(screen.getByText(line.name));
  assert.equal(screen.queryByText(/Prima de servicios/), null);
  const total = screen.getByText('Total liquidación').nextElementSibling.textContent.replace(/\D/g, '');
  assert.equal(total, '4229545');
});

test('SettlementReportSheet shows the registered reason or "No informado" for historical rows', async () => {
  settlementsById.withReason = { ...settlement, terminationReason: 'MUTUAL_AGREEMENT', employee: { id: 'emp-1', firstName: 'Ana', lastName: 'Gomez' }, contract: { id: 'con-1', isActive: false } };
  settlementsById.legacy = { ...settlement, terminationReason: null, employee: { id: 'emp-1', firstName: 'Ana', lastName: 'Gomez' }, contract: { id: 'con-1', isActive: false } };
  const view = render(h(SettlementReportSheet, { settlementId: 'withReason', onClose() {} }));
  await waitFor(() => assert.ok(screen.getByText('Mutuo acuerdo')));
  assert.ok(screen.getByText('Ana Gomez'));
  assert.ok(screen.getByText('Contrato finalizado'));
  assert.equal(screen.queryByText(/pagad/i), null);
  view.rerender(h(SettlementReportSheet, { settlementId: 'legacy', onClose() {} }));
  await waitFor(() => assert.ok(screen.getByText('No informado')));
});

test('SettlementReportSheet shows the Bogotá business day for the registration instant', async () => {
  // 21:40 in Bogotá on 24/11 is already 25/11 in UTC.
  settlementsById.lateNight = { ...settlement, postedAt: '2026-11-25T02:40:00.000Z', employee: { id: 'emp-1', firstName: 'Ana', lastName: 'Gomez' } };
  render(h(SettlementReportSheet, { settlementId: 'lateNight', onClose() {} }));
  await waitFor(() => assert.ok(screen.getByText('Registrada el')));
  assert.equal(screen.getByText('Registrada el').nextElementSibling.textContent, '24/11/2026');
});
