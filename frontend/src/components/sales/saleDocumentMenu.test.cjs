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
const {saleToDocumentData,canShowSaleDocument}=require('../../lib/sales/saleDocument.ts');
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

test('canShowSaleDocument: no hay documentos de ventas canceladas; la orden de entrega solo para productos',()=>{
  assert.equal(canShowSaleDocument(order,'quotation'),true);assert.equal(canShowSaleDocument(order,'delivery'),true);
  assert.equal(canShowSaleDocument({...order,type:'SERVICIO'},'quotation'),true);assert.equal(canShowSaleDocument({...order,type:'SERVICIO'},'delivery'),false);
  assert.equal(canShowSaleDocument({...order,status:'CANCELADO'},'quotation'),false);assert.equal(canShowSaleDocument({...order,items:[]},'quotation'),false);
});

test('el menú de la tarjeta ofrece los documentos y abre el elegido',()=>{
  const called=[];
  render(h(SaleCard,{sale:order,onViewDocument:(s,k)=>called.push([s.id,k])}));
  fireEvent.click(screen.getByRole('button',{name:'Opciones de venta'}));
  assert.deepEqual(Array.from(screen.getByRole('dialog').querySelectorAll('button')).map(b=>b.textContent),['Ver detalles','Cotización','Orden de entrega']);
  fireEvent.click(screen.getByRole('button',{name:'Orden de entrega'}));
  assert.deepEqual(called,[['abcdef123456','delivery']]);assert.equal(screen.queryByRole('dialog'),null);
});

test('sin onViewDocument o con venta cancelada el menú no cambia',()=>{
  render(h(SaleCard,{sale:order}));
  assert.equal(screen.queryByRole('button',{name:'Cotización'}),null);
  cleanup();
  render(h(SaleCard,{sale:{...order,status:'CANCELADO'},onViewDocument:()=>assert.fail('no debe llamarse')}));
  assert.equal(screen.queryByRole('dialog'),null);assert.ok(screen.getByRole('button',{name:'Ver detalles'}));
});
