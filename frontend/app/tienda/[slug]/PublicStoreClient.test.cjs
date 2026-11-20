const {test,afterEach}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"), path=require("node:path"), Module=require("node:module"), ts=require("typescript");
const {JSDOM}=require("jsdom");
const dom=new JSDOM("<html><body></body></html>",{url:"http://localhost/tienda/demo"});
global.window=dom.window;global.document=dom.window.document;global.localStorage=dom.window.localStorage;
for(const key of ["HTMLElement","Element","Node","MutationObserver","Event"])global[key]=dom.window[key];
Object.defineProperty(global,"navigator",{value:dom.window.navigator,configurable:true});
global.ResizeObserver=class {observe(){} disconnect(){}};
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require("react"),h=React.createElement;
const {render,screen,fireEvent,cleanup,act}=require("@testing-library/react");
const originalResolve=Module._resolveFilename,originalLoad=Module._load;
const router={push(){},replace(){}};const params=new URLSearchParams();
const messages=[];
const toast=Object.assign(message=>messages.push(message),{success:message=>messages.push(message),error:message=>messages.push(message)});
Module._load=function(request,...args){
 if(request==="next/navigation")return {useParams:()=>({slug:"demo"}),useSearchParams:()=>params,useRouter:()=>router};
 if(request==="next/image")return {__esModule:true,default:({fill,priority,unoptimized,...props})=>h("img",props)};
 if(request==="react-hot-toast")return {__esModule:true,default:toast};
 if(request==="@/src/lib/businessProfile")return {readBusinessProfile:()=>({name:"Demo",phone:"",subtitle:""})};
 if(request==="@/src/hooks/useInteractiveHorizontalNavigation")return {useInteractiveHorizontalNavigation:()=>({})};
 if(request==="@/src/components/layout/Footer")return {Footer:()=>null,formatFooterPhone:()=>""};
 if(["@/src/components/reservations/ReservationDrawer","@/src/components/reservations/AppointmentLookupModal","@/src/components/shared/PhoneSelector","@/src/components/shared/MunicipalitySelect","@/src/components/store/LoginReturnHint","@/src/components/shared/NavigationTransitionBackdrop"].includes(request))return {__esModule:true,default:()=>null};
 return originalLoad.call(this,request,...args);
};
Module._resolveFilename=function(request,...args){if(request.startsWith("@/"))request=path.join(__dirname,"../../..",request.slice(2));return originalResolve.call(this,request,...args);};
require.extensions[".tsx"]=require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const Store=require("./PublicStoreClient.tsx").default;
let catalog,requests,taxResponder,opened;
const visible={id:"v",name:"Visible",type:"PRODUCT",price:1000,images:[],optionGroups:[]};
const hidden={id:"h",name:"A medida",type:"PRODUCT",price:null,publishWithoutPrice:true,images:[],optionGroups:[]};
function setup(items=[visible,hidden],fiscal=false){
 catalog={business:{name:"Demo",slug:"demo",phoneWhatsapp:"573001112233"},data:structuredClone(items)};requests=[];opened=[];taxResponder=null;messages.length=0;
 global.fetch=async(url,options={})=>{requests.push({url,options});if(url.endsWith("/items"))return {ok:true,json:async()=>structuredClone(catalog)};if(url.endsWith("/fiscal-settings"))return {ok:true,json:async()=>({fiscalContextEnabled:fiscal})};if(url.endsWith("/tax-preview")&&taxResponder)return taxResponder();throw Error("Unexpected request "+url);};
 window.open=()=>({opener:null,close(){},location:{replace(url){opened.push(url);}}});
}
async function flush(fn=()=>{}){await act(async()=>{fn();await new Promise(resolve=>setTimeout(resolve,10));});}
afterEach(()=>{cleanup();});
test("mixed cart survives service filter and WhatsApp creates no commercial requests",async()=>{
 setup();await flush(()=>render(h(Store,{initialData:structuredClone(catalog)})));
 await flush(()=>{for(const button of screen.getAllByRole("button",{name:"Agregar al carrito"}))fireEvent.click(button);});
 await flush(()=>fireEvent.click(screen.getByRole("button",{name:"Servicios",exact:true})));
 await flush(()=>fireEvent.click(screen.getByRole("button",{name:"Carrito"})));
 assert.ok(screen.getByText("Total a consultar"));assert.ok(screen.getByText("A medida"));assert.ok(screen.getByText("Visible"));
 await flush(()=>fireEvent.click(screen.getByRole("button",{name:"Consultar por WhatsApp"})));
 assert.equal(opened.length,1);const text=new URL(opened[0]).searchParams.get("text");
 assert.ok(text.includes("Demo")&&text.includes("A medida")&&text.includes("Visible"));
 assert.equal(requests.filter(r=>r.options.method==="POST").length,0);
 assert.ok(requests.filter(r=>r.url.endsWith("/items")).every(r=>r.options.cache==="no-store"));
});
test("hiding a selected item retains its line but prevents consultation",async()=>{
 setup([hidden]);await flush(()=>render(h(Store,{initialData:structuredClone(catalog)})));
 await flush(()=>fireEvent.click(screen.getByRole("button",{name:"Agregar al carrito"})));
 await flush(()=>fireEvent.click(screen.getByRole("button",{name:"Carrito"})));
 catalog.data=[];await flush(()=>window.dispatchEvent(new Event("focus")));
 assert.ok(screen.getByText("A medida"));assert.ok(screen.getByText("No disponible"));
 assert.ok(screen.getByRole("button",{name:"Consultar por WhatsApp"}).disabled);
 await flush(()=>fireEvent.click(screen.getByRole("button",{name:"Eliminar producto"})));
 assert.ok(screen.getByText("Tu carrito está vacío"));
});
test("late fiscal response cannot restore totals after the merchant hides the price",async()=>{
 setup([visible],true);let resolveTax;
 taxResponder=()=>new Promise(resolve=>{resolveTax=resolve;});
 await flush(()=>render(h(Store,{initialData:structuredClone(catalog)})));
 await flush(()=>fireEvent.click(screen.getByRole("button",{name:"Agregar al carrito"})));
 await flush(()=>fireEvent.click(screen.getByRole("button",{name:"Carrito"})));
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,400));});assert.ok(resolveTax);
 catalog.data=[{...visible,price:null,publishWithoutPrice:true}];await flush(()=>window.dispatchEvent(new Event("focus")));
 await flush(()=>resolveTax({ok:true,json:async()=>({subtotal:1000,vatTotal:190,impoconsumoTotal:0,reteFuenteTotal:0,reteIvaTotal:0,reteIcaTotal:0,autoRetencionTotal:0,netReceived:1190,taxLines:[],uvtValue:52374})}));
 assert.ok(screen.getByText("Total a consultar"));assert.equal(screen.queryByText("$1.190"),null);
 assert.equal(screen.queryByRole("button",{name:"Confirmar Pedido"}),null);
 const count=requests.filter(r=>r.url.endsWith("tax-preview")).length;
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,400));});
 assert.equal(requests.filter(r=>r.url.endsWith("tax-preview")).length,count);
});
