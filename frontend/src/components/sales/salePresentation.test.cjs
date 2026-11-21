const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', {url:'http://localhost'});
global.window = dom.window; global.document = dom.window.document;
for (const key of ['HTMLElement','Element','Node','MutationObserver']) global[key] = dom.window[key];
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { render, screen, fireEvent, cleanup } = require('@testing-library/react');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request,...args) {
  if(request.startsWith('@/')) request=path.join(__dirname,'../../..',request.slice(2));
  return originalResolve.call(this,request,...args);
};
const originalLoad = Module._load;
Module._load = function(request,...args) {
  if(request==='next/navigation') return {useRouter:()=>({push(){}})};
  if(request==='@/src/lib/cache') return {getCached:async()=>[]};
  return originalLoad.call(this,request,...args);
};
require.extensions['.tsx']=require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {getSaleBadge}=require('../../lib/sales/salePresentation.ts');
const {menuPosition}=require('./CardActionsMenu.tsx');
const SaleCard=require('./SaleCard.tsx').default;
const h=React.createElement;
const sale={id:'test',sourceType:'RESERVATION',status:'CONFIRMADO',reservationStatus:'CONFIRMED',customerName:'Ana',type:'SERVICIO',items:[{name:'Corte',qty:1,price:1000}],total:1000,createdAt:'2026-11-12T15:00:00Z',scheduledAt:'2026-11-12T16:00:00',origin:'MANUAL',allowedActions:[]};
afterEach(cleanup);
for (const sourceType of ['RESERVATION','ORDER']) for (const [reservationStatus,label] of [['PENDING','Pendiente'],['CONFIRMED','Confirmado'],['COMPLETED','Finalizado'],['CANCELLED','Cancelado']]) {
  test(`${sourceType} ${reservationStatus} uses operational badge`,()=>{
    const result=getSaleBadge({...sale,sourceType,status:'CERRADO',reservationStatus});
    assert.equal(result.styles.label,label);assert.equal(result.operational,true);
  });
}
test('products and unbooked services keep commercial status; missing/invalid status never invents a reservation',()=>{
  for (const type of ['PRODUCTO','SERVICIO']) for (const [status,label] of [['CERRADO','Cerrado'],['PENDIENTE','Pendiente'],['CANCELADO','Cancelado']]) {
    const result=getSaleBadge({...sale,sourceType:'ORDER',type,status,reservationStatus:null});
    assert.equal(result.styles.label,label);assert.equal(result.operational,false);assert.equal(result.diagnostic,false);
  }
  assert.equal(getSaleBadge({...sale,reservationStatus:'BROKEN'}).diagnostic,true);
  assert.equal(getSaleBadge({...sale,reservationStatus:undefined}).diagnostic,true);
});
test('card removes redundant attention heading and does not run an action on opening',()=>{
  const called=[];
  render(h(SaleCard,{sale:{...sale,allowedActions:['complete','reschedule','cancel','edit','delete']},onComplete:s=>called.push(['complete',s.sourceType]),onCancelReservation:()=>called.push('cancel'),onEdit:()=>{},onDelete:()=>{}}));
  assert.ok(screen.getByText('Confirmado'));assert.equal(screen.queryByText(/Atención:/),null);assert.equal(screen.queryByText('Cerrado'),null);
  fireEvent.click(screen.getByRole('button',{name:'Opciones de venta'}));
  assert.deepEqual(called,[]);
  assert.deepEqual(Array.from(screen.getByRole('dialog').querySelectorAll('button')).map(b=>b.textContent),['Finalizar atención','Cancelar reserva','Editar','Eliminar','Ver detalles']);
  fireEvent.click(screen.getByRole('button',{name:'Finalizar atención'}));
  assert.deepEqual(called,[['complete','RESERVATION']]);assert.equal(screen.queryByRole('dialog'),null);
});
for (const [action,label] of [['complete','Finalizar atención'],['edit','Editar'],['cancel','Cancelar reserva']]) test(`only ${action} is offered and passes mirror sourceType`,()=>{
  const called=[];const props={sale:{...sale,sourceType:'ORDER',allowedActions:[action]},onComplete:s=>called.push(s.sourceType),onEdit:s=>called.push(s.sourceType),onCancelReservation:s=>called.push(s.sourceType)};
  render(h(SaleCard,props));fireEvent.click(screen.getByRole('button',{name:'Opciones de venta'}));
  for(const other of ['Finalizar atención','Editar','Cancelar reserva']) assert.equal(Boolean(screen.queryByRole('button',{name:other})),other===label);
  fireEvent.click(screen.getByRole('button',{name:label}));assert.deepEqual(called,['ORDER']);
});
test('current capabilities remove stale actions while the menu is open; cancelled archive stays explicit',()=>{
  const props={onComplete:()=>assert.fail('stale complete'),onDelete:()=>{},onCancelReservation:()=>assert.fail('stale cancel')};
  const view=render(h(SaleCard,{...props,sale:{...sale,allowedActions:['complete','cancel']}}));
  fireEvent.click(screen.getByRole('button',{name:'Opciones de venta'}));
  view.rerender(h(SaleCard,{...props,sale:{...sale,reservationStatus:'COMPLETED',allowedActions:[]}}));
  assert.equal(screen.queryByRole('button',{name:'Finalizar atención'}),null);assert.equal(screen.queryByRole('button',{name:'Cancelar reserva'}),null);
  view.rerender(h(SaleCard,{...props,sale:{...sale,reservationStatus:'CANCELLED',allowedActions:['delete']}}));
  assert.ok(screen.getByRole('button',{name:'Eliminar'}));
  view.rerender(h(SaleCard,{...props,sale:{...sale,allowedActions:undefined}}));
  assert.equal(screen.queryByRole('button',{name:'Eliminar'}),null);
});
test('portal escapes card overflow; keyboard, outside dismissal and immediate reopening work',()=>{
  render(h(SaleCard,{sale:{...sale,allowedActions:['complete']},onComplete:()=>{}}));
  const trigger=screen.getByRole('button',{name:'Opciones de venta'});
  fireEvent.click(trigger);
  const panel=screen.getByRole('dialog');assert.equal(panel.parentElement,document.body);
  assert.equal(document.activeElement.textContent,'Finalizar atención');
  fireEvent.keyDown(panel,{key:'End'});assert.equal(document.activeElement.textContent,'Ver detalles');
  fireEvent.keyDown(panel,{key:'Escape'});assert.equal(document.activeElement,trigger);assert.equal(screen.queryByRole('dialog'),null);
  fireEvent.click(trigger);fireEvent.pointerDown(document.body);assert.equal(screen.queryByRole('dialog'),null);
  fireEvent.click(trigger);assert.ok(screen.getByRole('dialog'));
});
for(const width of [320,375,390,430]) test(`menu positioning stays inside ${width}px viewport at scroll edges`,()=>{
  for(const top of [-20,10,650]) {
    const pos=menuPosition({left:width-40,right:width-8,top,bottom:top+44},256,300,width,700);
    assert.ok(pos.left>=8 && pos.left+256<=width-8);assert.ok(pos.top>=8 && pos.top+300<=692);
  }
});
test('fiscal state and actions remain separate alongside the operational badge',()=>{
  const calls=[];const invoice={id:'f',status:'VALIDATED',artifacts:[]};
  render(h(SaleCard,{sale:{...sale,sourceType:'ORDER',status:'CERRADO',allowedActions:['complete']},onComplete:()=>calls.push('complete'),fiscalDocument:invoice,onFiscalView:()=>{},onFiscalReceipt:()=>calls.push('invoice'),onFiscalDownload:()=>{},onFiscalDispatch:()=>{},onFiscalRetry:()=>{},onFiscalAnnul:()=>{},onCompleteAnnulment:()=>{}}));
  assert.ok(screen.getByText('Confirmado'));assert.ok(screen.getByText(/Factura:/));
  fireEvent.click(screen.getByRole('button',{name:'Opciones de venta'}));
  assert.ok(screen.getByRole('button',{name:'Finalizar atención'}));
  fireEvent.click(require('@testing-library/react').within(screen.getByRole('dialog')).getByRole('button',{name:'Ver factura'}));assert.deepEqual(calls,['invoice']);
});

for(const status of ['PENDING','PROCESSING','SUBMITTED_PENDING_DIAN','VALIDATED','REJECTED','RETRYABLE_FAILURE','LOCAL_PERSISTENCE_FAILURE','CREDITED']) test(`fiscal ${status} retains the same actions in the combined menu`,()=>{
 const FiscalMenu=require('./FiscalDocumentMenu.tsx').default;
 const props={document:{id:'f',status,artifacts:[]},onView:()=>{},onViewReceipt:()=>{},onDownload:()=>{},onDispatch:()=>{},onRetry:()=>{},onAnnul:()=>{},onCompleteAnnulment:()=>{}};
 render(h(FiscalMenu,props));fireEvent.click(screen.getByRole('button',{name:'Opciones de facturaci\u00f3n electr\u00f3nica'}));
 const original=screen.getAllByRole('button').slice(1).map(b=>[b.textContent,b.disabled]);cleanup();
 render(h(FiscalMenu,{...props,leadingActions:()=>h('span',null,'Turno')}));fireEvent.click(screen.getByRole('button',{name:'Opciones de venta'}));
 const combined=Array.from(screen.getByRole('dialog').querySelectorAll('button')).map(b=>[b.textContent,b.disabled]);
 assert.deepEqual(combined,original);
});

// Bloque 2.2: «No asistió» derives from CANCELLED + NO_SHOW; the action only follows the backend.
test('CANCELLED + NO_SHOW shows «No asistió»; ordinary cancellations stay «Cancelado»',()=>{
  for (const sourceType of ['RESERVATION','ORDER']) {
    assert.equal(getSaleBadge({...sale,sourceType,status:'CANCELADO',reservationStatus:'CANCELLED',cancelReason:'NO_SHOW'}).styles.label,'No asistió');
    assert.equal(getSaleBadge({...sale,sourceType,status:'CANCELADO',reservationStatus:'CANCELLED',cancelReason:'Pedido del cliente'}).styles.label,'Cancelado');
  }
  assert.equal(getSaleBadge({...sale,sourceType:'ORDER',type:'PRODUCTO',status:'CANCELADO',reservationStatus:null,cancelReason:'NO_SHOW'}).styles.label,'Cancelado');
});
test('«No asistió» is offered only when the backend allows noShow',()=>{
  const called=[];
  render(h(SaleCard,{sale:{...sale,allowedActions:['noShow']},onNoShow:s=>called.push(s.id),onCancelReservation:()=>assert.fail('not allowed')}));
  fireEvent.click(screen.getByRole('button',{name:'Opciones de venta'}));
  assert.equal(Boolean(screen.queryByRole('button',{name:'Cancelar reserva'})),false);
  fireEvent.click(screen.getByRole('button',{name:'No asistió'}));
  assert.deepEqual(called,['test']);
  cleanup();
  render(h(SaleCard,{sale:{...sale,allowedActions:['complete']},onNoShow:()=>assert.fail('not allowed'),onComplete:()=>{}}));
  fireEvent.click(screen.getByRole('button',{name:'Opciones de venta'}));
  assert.equal(Boolean(screen.queryByRole('button',{name:'No asistió'})),false);
});
// Footer shows only allowed reservation actions in one row; accessible names stay complete.
test('detail footer: Ausente/Finalizar follow allowedActions and keep full accessible names',()=>{
  const SaleDetailsModal=require('./SaleDetailsModal.tsx').default;
  const called=[];
  const props={open:true,onClose:()=>{},onNoShow:s=>called.push(['noShow',s.id]),onComplete:s=>called.push(['complete',s.id]),onConfirm:()=>called.push(['confirm'])};
  const footerButtons=()=>['No asistió','Finalizar atención','Confirmar'].filter(name=>screen.queryByRole('button',{name}));
  const view=render(h(SaleDetailsModal,{...props,sale:{...sale,allowedActions:['noShow','complete']}}));
  assert.deepEqual(footerButtons(),['No asistió','Finalizar atención']);
  assert.ok(screen.getByText('Ausente'));assert.ok(screen.getByText('Finalizar'));
  assert.equal(screen.queryByRole('button',{name:'Cerrar'}).textContent,'');
  fireEvent.click(screen.getByRole('button',{name:'No asistió'}));fireEvent.click(screen.getByRole('button',{name:'Finalizar atención'}));
  assert.deepEqual(called,[['noShow','test'],['complete','test']]);
  view.rerender(h(SaleDetailsModal,{...props,sale:{...sale,allowedActions:['complete']}}));
  assert.deepEqual(footerButtons(),['Finalizar atención']);
  view.rerender(h(SaleDetailsModal,{...props,sale:{...sale,reservationStatus:'COMPLETED',allowedActions:[]}}));
  assert.deepEqual(footerButtons(),[]);
  view.rerender(h(SaleDetailsModal,{...props,sale:{...sale,sourceType:'ORDER',type:'PRODUCTO',status:'PENDIENTE',reservationStatus:null,scheduledAt:null,allowedActions:['confirm','edit','delete']}}));
  assert.deepEqual(footerButtons(),['Confirmar']);
});
