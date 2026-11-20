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
const {saleToDocumentData,saleDocumentKinds}=require('../../lib/sales/saleDocument.ts');
const h=React.createElement;
afterEach(cleanup);
const order={id:'abcdef123456',sourceType:'ORDER',status:'PENDIENTE',type:'PRODUCTO',customerName:'Ana',customerWhatsapp:'3001112233',items:[{name:'Mouse',qty:2,unitPrice:50000,price:100000},{name:'Funda',qty:1,unitPrice:0,price:20000,options:[{optionName:'Azul',groupTitle:'Color',priceDelta:0}]}],total:142800,createdAt:'2026-11-12T15:00:00Z',origin:'MANUAL',fiscalSummary:{subtotal:120000,iva:22800,impoconsumo:0},fiscalContext:{buyerDocumentType:'CC',buyerDocumentNumber:'1020',buyerEmail:'ana@x.co',buyerIsRegimenSimple:false}};
const biz={name:'Tecno',fiscalId:'900.1',phoneWhatsapp:'3000000'};

test('saleToDocumentData arma número, cliente, líneas e IVA reales de la venta',()=>{
  const d=saleToDocumentData(order,'quotation',biz);
  assert.equal(d.number,'COT-123456');assert.equal(d.validityDays,15);assert.equal(d.reference,undefined);
  assert.deepEqual(d.customer,{name:'Ana',document:'CC 1020',phone:'3001112233',email:'ana@x.co'});
  assert.deepEqual(d.lines,[{description:'Mouse',detail:undefined,quantity:2,unitPrice:50000},{description:'Funda',detail:'Azul',quantity:1,unitPrice:20000}]);
  assert.equal(d.vatAmount,22800);assert.equal(d.business.nit,'900.1');
  const e=saleToDocumentData({...order,fiscalSummary:null,customerName:null,fiscalContext:null},'delivery',null);
  assert.equal(e.number,'OE-123456');assert.equal(e.reference,'VTA-123456');assert.equal(e.vatAmount,0);
  assert.equal(saleToDocumentData({...order,fiscalContext:{buyerDocumentType:'CC',buyerDocumentNumber:null,buyerIsRegimenSimple:false}},'quotation',biz).customer.document,undefined);
  assert.equal(e.customer.name,'Consumidor final');assert.equal(e.business.name,'Mi Negocio');assert.equal(e.business.nit,undefined);
});

test('saleDocumentKinds: documentos según el estado de la venta (prototipo del menú)',()=>{
  // Pendiente: solo Cotización (productos y servicios)
  assert.deepEqual(saleDocumentKinds(order),['quotation']);
  assert.deepEqual(saleDocumentKinds({...order,type:'SERVICIO'}),['quotation']);
  assert.deepEqual(saleDocumentKinds({...order,status:'PENDIENTE DE CIERRE'}),['quotation']);
  // Cerrada sin factura: orden de entrega solo para productos
  assert.deepEqual(saleDocumentKinds({...order,status:'CERRADO'}),['delivery']);
  assert.deepEqual(saleDocumentKinds({...order,status:'CERRADO',type:'SERVICIO'}),[]);
  // Facturada o validada: documentos relacionados; la orden de entrega solo para productos
  for (const st of ['PENDING','PROCESSING','SUBMITTED_PENDING_DIAN','VALIDATED']) {
    assert.deepEqual(saleDocumentKinds({...order,status:'CERRADO'},st),['delivery','quotation'],st);
    assert.deepEqual(saleDocumentKinds({...order,status:'CERRADO',type:'SERVICIO'},st),['quotation'],st);
  }
  // Factura rechazada, con error o acreditada, cancelada o sin líneas: ninguno
  for (const st of ['REJECTED','RETRYABLE_FAILURE','LOCAL_PERSISTENCE_FAILURE','CREDITED']) assert.deepEqual(saleDocumentKinds({...order,status:'CERRADO'},st),[],st);
  assert.deepEqual(saleDocumentKinds({...order,status:'CANCELADO'}),[]);
  assert.deepEqual(saleDocumentKinds({...order,items:[]}),[]);
});

test('venta pendiente: el menú ofrece la cotización y el botón principal es «Ver cotización»',()=>{
  const called=[];
  render(h(SaleCard,{sale:order,onViewDocument:(s,k)=>called.push([s.id,k])}));
  assert.ok(screen.getByRole('button',{name:'Ver cotización'}));assert.equal(screen.queryByRole('button',{name:'Ver factura'}),null);
  fireEvent.click(screen.getByRole('button',{name:'Opciones de venta'}));
  assert.deepEqual(Array.from(screen.getByRole('dialog').querySelectorAll('button')).map(b=>b.textContent),['Ver detalles','Cotización']);
  fireEvent.click(screen.getByRole('button',{name:'Cotización'}));
  assert.deepEqual(called,[['abcdef123456','quotation']]);assert.equal(screen.queryByRole('dialog'),null);
  fireEvent.click(screen.getByRole('button',{name:'Ver cotización'}));
  assert.deepEqual(called[1],['abcdef123456','quotation']);
});

test('venta cerrada sin factura: «Ver comprobante», «Comprobante de pago» y «Orden de entrega»',()=>{
  const receipts=[],docs=[];
  render(h(SaleCard,{sale:{...order,status:'CERRADO'},onReceipt:s=>receipts.push(s.id),onViewDocument:(s,k)=>docs.push([s.id,k])}));
  assert.ok(screen.getByRole('button',{name:'Ver comprobante'}));
  fireEvent.click(screen.getByRole('button',{name:'Ver comprobante'}));
  fireEvent.click(screen.getByRole('button',{name:'Opciones de venta'}));
  assert.deepEqual(Array.from(screen.getByRole('dialog').querySelectorAll('button')).map(b=>b.textContent),['Ver detalles','Comprobante de pago','Orden de entrega']);
  fireEvent.click(screen.getByRole('button',{name:'Comprobante de pago'}));
  assert.deepEqual(receipts,['abcdef123456','abcdef123456']);
  fireEvent.click(screen.getByRole('button',{name:'Opciones de venta'}));
  fireEvent.click(screen.getByRole('button',{name:'Orden de entrega'}));
  assert.deepEqual(docs,[['abcdef123456','delivery']]);
});

test('sin onViewDocument o con venta cancelada el menú y el botón no cambian',()=>{
  render(h(SaleCard,{sale:order}));
  assert.equal(screen.queryByRole('button',{name:'Cotización'}),null);assert.ok(screen.getByRole('button',{name:'Ver factura'}));
  cleanup();
  render(h(SaleCard,{sale:{...order,status:'CANCELADO'},onViewDocument:()=>assert.fail('no debe llamarse')}));
  assert.equal(screen.queryByRole('dialog'),null);assert.ok(screen.getByRole('button',{name:'Ver detalles'}));assert.ok(screen.getByRole('button',{name:'Ver factura'}));
});
