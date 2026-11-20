const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<html><body></body></html>", {url:"http://localhost"});
global.window=dom.window; global.document=dom.window.document;
for(const key of ["HTMLElement","Element","Node","MutationObserver"]) global[key]=dom.window[key];
Object.defineProperty(global,"navigator",{value:dom.window.navigator,configurable:true});
global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require("react");
const {render,screen,fireEvent,cleanup}=require("@testing-library/react");
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,...args){
 if(request.startsWith("@/"))request=path.join(__dirname,"../../..",request.slice(2));
 return resolve.call(this,request,...args);
};
require.extensions[".tsx"]=require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const CartSummary=require("./CartSummary.tsx").default;
const h=React.createElement;
afterEach(cleanup);
function props(overrides={}){return {items:[{id:"a",name:"Visible",price:1000,quantity:2}],onIncreaseQty(){},onDecreaseQty(){},customerName:"Cliente",documentNumber:"",countryCode:"57",phoneNumber:"3001112233",paymentMethod:"CASH",onPaymentMethodChange(){},onConfirm(){},onClose(){},...overrides};}
test("normal cart preserves purchase and fiscal total",()=>{
 let confirmed=0;render(h(CartSummary,props({payableTotal:2380,onConfirm(){confirmed++;}})));
 assert.ok(screen.getByText("$2.380"));fireEvent.click(screen.getByRole("button",{name:"Confirmar Pedido"}));assert.equal(confirmed,1);
 assert.equal(screen.queryByText("Consultar por WhatsApp"),null);
});
for(const mixed of [false,true])test(`hidden cart (mixed=${mixed}) consults without invoking order confirmation`,()=>{
 let confirmed=0,consulted=0;
 const hidden={id:"h",name:"Mueble",price:null,quantity:2,selectedOptionNames:["Roble"]};
 render(h(CartSummary,props({items:mixed?[hidden,{id:"v",name:"Visible",price:1000,quantity:1}]:[hidden],customerName:"",phoneNumber:"",payableTotal:999999,taxPreviewContent:h("div",null,"STALE TAX"),fiscalContent:h("div",null,"BUYER"),consultationAvailable:true,onConfirm(){confirmed++;},onConsult(){consulted++;}})));
 assert.ok(screen.getByText("Consultar precio"));assert.ok(screen.getByText("Total a consultar"));
 assert.equal(screen.queryByText("STALE TAX"),null);assert.equal(screen.queryByText("BUYER"),null);
 assert.equal(screen.queryByText("$999.999"),null);assert.equal(screen.queryByText("Confirmar Pedido"),null);
 fireEvent.click(screen.getByRole("button",{name:"Consultar por WhatsApp"}));assert.equal(consulted,1);assert.equal(confirmed,0);
});
test("unavailable or unverified lines cannot confirm or consult",()=>{
 const view=render(h(CartSummary,props({isCatalogChecking:true})));
 assert.ok(screen.getByRole("button",{name:"Confirmar Pedido"}).disabled);assert.ok(screen.getByText("Por verificar"));
 view.rerender(h(CartSummary,props({items:[{id:"h",name:"Mueble",price:null,quantity:1,unavailable:true}],consultationAvailable:true,onConsult(){throw Error("must not consult");}})));
 assert.ok(screen.getByRole("button",{name:"Consultar por WhatsApp"}).disabled);
});
test("line controls retain the customization key and missing phone disables consultation",()=>{
 const calls=[];render(h(CartSummary,props({items:[{id:"h",cartKey:"h:roble",name:"Mueble",price:null,quantity:2}],onEdit:key=>calls.push(["edit",key]),onRemove:key=>calls.push(["remove",key]),onConsult(){}})));
 fireEvent.click(screen.getByRole("button",{name:"Editar producto"}));fireEvent.click(screen.getByRole("button",{name:"Eliminar producto"}));
 assert.deepEqual(calls,[["edit","h:roble"],["remove","h:roble"]]);assert.ok(screen.getByRole("button",{name:"Consultar por WhatsApp"}).disabled);
});
