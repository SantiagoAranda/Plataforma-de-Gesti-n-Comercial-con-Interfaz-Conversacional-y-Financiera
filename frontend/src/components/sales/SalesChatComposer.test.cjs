// Component behavior only: JSDOM does not validate responsive layout or real availability.
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
const { render, screen, fireEvent, cleanup, act } = require('@testing-library/react');
const h = React.createElement;
const catalog = [
  { id: 'noagenda', name: 'Servicio sin agenda QA', price: 400, type: 'SERVICE', durationMinutes: 95, requiresAppointment: false, allowWalkIn: false },
  { id: 'product', name: 'Producto QA', price: 100, type: 'PRODUCT', inventoryMode: 'NONE' },
  { id: 'service90', name: 'Servicio 90 QA', price: 300, type: 'SERVICE', durationMinutes: 90 },
  { id: 'service', name: 'Servicio QA', price: 200, type: 'SERVICE', durationMinutes: 60 },
];
let fixtureDate = '2099-12-01';
const component = (defaultExport) => ({ __esModule: true, default: defaultExport });
const stubs = {
  '@/src/lib/api': { api: async () => catalog },
  '@/src/hooks/useTaxSettings': { useTaxSettings: () => ({ taxSettingsEnabled: false }) },
  '@/src/hooks/useFeatureFlags': { useFeatureFlags: () => ({ simpleRegimeSalesEnabled: true }) },
  '@/src/components/shared/ItemSelector': component(({ options, onChange, value }) =>
    h('select', { 'aria-label': 'Ítem QA', value, onChange: e => onChange(e.target.value) },
      h('option', { value: '' }, 'Seleccionar'), ...options.map(i => h('option', { key: i.id, value: i.id }, i.name)))),
  '@/src/components/reservations/ReservationSlotPicker': component(({ onChange, durationMin }) =>
    h('button', { type: 'button', 'data-duration': durationMin, onClick: () => onChange({ date: fixtureDate, startMinute: 600 }) }, 'Elegir turno QA')),
  '@/src/components/shared/PhoneSelector': component(() => null),
  '@/src/components/shared/MunicipalitySelect': component(() => null),
  '@/src/components/shared/ProductOptionSelector': component(() => null),
  '@/src/components/shared/WhatsappComposer': { WhatsappComposer: () => null },
};
const originalLoad = Module._load;
Module._load = function(request, ...args) { return stubs[request] || originalLoad.call(this, request, ...args); };
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (request.startsWith('@/')) request = path.join(__dirname, '../../..', request.slice(2));
  return originalResolve.call(this, request, ...args);
};
Module._extensions['.tsx'] = Module._extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const Composer = require('./SalesChatComposer.tsx').default;
afterEach(() => { cleanup(); fixtureDate = '2099-12-01'; });
async function mount(props = {}) {
  const saved = [];
  await act(async () => render(h(Composer, { expanded: true, onCancelComposer() {}, onSave: data => saved.push(data), ...props })));
  return saved;
}
function add(id) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Ítem QA' }), { target: { value: id } });
  fireEvent.click(screen.getByTitle('Agregar ítem'));
}
async function save(edit = false) {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: edit ? 'Guardar cambios' : 'Guardar venta' })));
}
function remove() {
  const icon = document.querySelector('.lucide-trash-2');
  assert.ok(icon, 'remove item action exists');
  fireEvent.click(icon.closest('button'));
}
for (const ids of [['product','noagenda'],['noagenda','product']]) {
 test(`F1.5 commercial mixed order ${ids.join('+')} has no appointment payload`,async()=>{
  const saved=await mount();for(const id of ids)add(id);
  assert.equal(screen.queryByRole('button',{name:'Elegir turno QA'}),null);
  await save();assert.equal(saved.length,1);assert.equal(saved[0].items.length,2);
  assert.equal(saved[0].type,'SERVICIO');assert.equal(saved[0].scheduledAt,undefined);assert.equal(saved[0].serviceProvided,undefined);
  assert.equal(saved[0].items.find(line=>line.itemId==='noagenda').unitPrice,400);
 });
}
for (const [label, expected] of [['Pendiente', 'PENDIENTE'], ['Confirmado', 'CERRADO']]) {
  test(`product preserves ${label} and has no schedule`, async () => {
    const saved = await mount(); add('product');
    fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
    await save();
    assert.equal(saved[0].status, expected); assert.equal(saved[0].type, 'PRODUCTO');
    assert.equal(saved[0].scheduledAt, undefined); assert.equal(screen.queryByText('Atención:'), null);
  });
}
test('service replaces selector, requires schedule and sends pending despite previous closed choice', async () => {
  const saved = await mount(); add('product');
  fireEvent.click(screen.getByRole('button', { name: 'Confirmado', exact: true }));
  remove(); add('service');
  assert.ok(screen.getByText('Atención:')); assert.equal(screen.queryByRole('button', { name: 'Pendiente', exact: true }), null);
  await save(); assert.equal(saved.length, 0);
  assert.ok(screen.getByText('Elegí fecha y hora para registrar la cita.'));
  fireEvent.click(screen.getByRole('button', { name: 'Elegir turno QA' })); await save();
  assert.equal(saved[0].status, 'PENDIENTE'); assert.equal(saved[0].scheduledAt, '2099-12-01T10:00:00');
  assert.equal(saved[0].type, 'SERVICIO');
  remove(); add('product'); assert.ok(screen.getByRole('button', { name: 'Pendiente', exact: true }));
  assert.equal(screen.queryByText('Atención:'), null);
});
test('mixed creation remains unavailable and a second service is rejected', async () => {
  await mount(); add('product');
  assert.equal(screen.queryByRole('option', { name: 'Servicio QA' }), null);
  remove(); add('service');
  assert.equal(screen.queryByRole('option', { name: 'Producto QA' }), null);
  add('service'); assert.ok(screen.getByText('Para registrar servicios con turno, cargá la cita por separado.'));
});
for (const version of [1, 2]) {
  test(`editing policy ${version} preserves status, version and agreed price`, async () => {
    const sale = { id: 'qa', type: 'SERVICIO', status: 'PENDIENTE', sourceType: 'RESERVATION', reservationStatus: 'CONFIRMED',
      commercialPolicyVersion: version, scheduledAt: '2099-12-01T10:00:00', paymentMethod: 'CASH',
      items: [{ itemId: 'service', name: 'Servicio QA', qty: 1, unitPrice: 150, price: 150, durationMin: 60 }] };
    const saved = await mount({ mode: 'edit', sale });
    assert.equal(Boolean(screen.queryByText('Atención:')), version === 2);
    assert.equal(Boolean(screen.queryByRole('button', { name: 'Pendiente', exact: true })), version === 1);
    await save(true);
    assert.equal(saved[0].commercialPolicyVersion, version); assert.equal(saved[0].reservationStatus, 'CONFIRMED');
    assert.equal(saved[0].status, 'PENDIENTE'); assert.equal(saved[0].items[0].unitPrice, 150);
  });
}
for (const ids of [['product', 'service'], ['service', 'product'], ['service']]) {
  test(`unversioned order ${ids.join('+')} keeps its existing selector`, async () => {
    await mount({ mode: 'edit', sale: {
      id: 'unversioned', type: ids[0] === 'service' ? 'SERVICIO' : 'PRODUCTO',
      status: 'PENDIENTE', sourceType: 'ORDER', commercialPolicyVersion: null, scheduledAt: null,
      items: ids.map(id => ({ itemId: id, name: id, qty: 1, unitPrice: 100, price: 100 })),
    } });
    assert.ok(screen.getByRole('button', { name: 'Pendiente', exact: true }));
    assert.ok(screen.getByRole('button', { name: 'Confirmado', exact: true }));
    assert.equal(screen.queryByText('Atención:'), null);
  });
}

test('retrospective duration stays hidden and configured duration is submitted with the agreed price', async () => {
  const saved=await mount(); add('service');
  fireEvent.click(screen.getByRole('button',{name:'Elegir turno QA'}));
  assert.equal(screen.queryByLabelText('Duración real en minutos'),null);
  fixtureDate='2020-01-01';
  fireEvent.click(screen.getByRole('button',{name:'Elegir turno QA'}));
  assert.equal(screen.queryByLabelText('Duración real en minutos'),null);
  assert.equal(screen.queryByText(/Atención pasada.*Duración real/),null);
  await save();
  assert.equal(saved[0].durationMinutes,60);
  assert.equal(saved[0].items[0].unitPrice,200);
  assert.equal(saved[0].scheduledAt,'2020-01-01T10:00:00');
  assert.equal(saved[0].serviceProvided,undefined); // Only the separate confirmation may declare provision.
});

test('configured duration follows service changes and remains stable across dates', async () => {
  const saved=await mount();
  for (const [id,duration] of [['service',60],['service90',90],['service',60]]) {
    add(id);
    for (const date of ['2020-01-01','2020-02-02','2099-12-01']) {
      fixtureDate=date;
      const picker=screen.getByRole('button',{name:'Elegir turno QA'});
      fireEvent.click(picker);
      assert.equal(picker.dataset.duration,String(duration));
      assert.equal(screen.queryByLabelText('Duración real en minutos'),null);
      await save();
      assert.equal(saved.at(-1).durationMinutes,duration);
      assert.equal(saved.at(-1).scheduledAt,`${date}T10:00:00`);
      assert.equal(saved.at(-1).serviceProvided,undefined);
    }
    remove();
  }
});
