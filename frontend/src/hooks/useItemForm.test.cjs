const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
global.window=dom.window;global.document=dom.window.document;
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
global.IS_REACT_ACT_ENVIRONMENT=true;
global.IntersectionObserver=class {observe(){} unobserve(){} disconnect(){}};
URL.createObjectURL=()=> 'blob:test';URL.revokeObjectURL=()=>{};
const originalLoad=Module._load,originalResolve=Module._resolveFilename;
let apiHandler;
let routeParams=new URLSearchParams();
const router={replace(){},push(){}};
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
dom.window.HTMLElement.prototype.scrollTo=function(){};
global.requestAnimationFrame=callback=>setTimeout(callback,0);
window.requestAnimationFrame=global.requestAnimationFrame;
Module._load=function(request,...args){
 if(request==='@/src/lib/api')return {api:(...args)=>apiHandler(...args)};
 if(request==='@/src/hooks/useTaxSettings')return {useTaxSettings:()=>({taxSettingsEnabled:true})};
 if(request==='@/src/lib/cache')return {invalidateCache(){},getInstantCache:()=>null,getCached:(_k,_ttl,loader)=>loader()};
 if(request==='next/navigation')return {useRouter:()=>router,useSearchParams:()=>routeParams};
 if(request==='@/src/lib/businessProfile')return {readBusinessProfile:()=>({name:'Test'})};
 if(request==='@/src/lib/businessLogo')return {getBusinessProfile:async()=>({name:'Test'})};
 if(request==='@/src/services/inventory')return {getRecipesBulk:async()=>({})};
 if(request==='@/src/components/layout/AppHeader')return {__esModule:true,default:()=>null};
 if(request==='@/src/components/mi-negocio/ItemDetailModal')return {__esModule:true,default:()=>null};
 if(request==='@/src/components/mi-negocio/ItemCard')return {ItemCard:({onEdit})=>React.createElement('button',{onClick:onEdit},'Editar tarjeta')};
 return originalLoad.call(this,request,...args);
};
Module._resolveFilename=function(request,...args){if(request.startsWith('@/'))request=path.join(__dirname,'../..',request.slice(2));return originalResolve.call(this,request,...args);};
require.extensions['.tsx']=require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {renderHook,render,screen,fireEvent,act,cleanup}=require('@testing-library/react');
const {useItemForm}=require('./useItemForm.ts');
const {catalogDraft,durationInMinutes,validateCatalog}=require('../lib/itemForm.ts');
const frontend=require('../lib/itemCategories.ts'),backend=require('../../../backend/src/items/item-categories.data.ts');
afterEach(cleanup);
const item={id:'item-1',name:'Mesa',type:'PRODUCT',price:2300,status:'ACTIVE',inventoryMode:'SIMPLE',badges:[{text:'Oferta',color:'#123456'}],saleConcept:'GOODS',appliesImpoconsumo:true,impoconsumoRate:0.08,images:[{id:'photo-1',url:'https://test/1',order:0},{id:'photo-2',url:'https://test/2',order:1}],...catalogDraft({barcode:'00001234',brand:'Marca',publishWithoutPrice:true,quotationDescription:'Texto independiente',includeInQuotation:true})};
function mount(){const notices=[],saved=[];const notify=x=>notices.push(x);return {...renderHook(()=>useItemForm(x=>saved.push(x),notify)),notices,saved};}
test('category mirror has identical IDs and labels: 28 categories / 203 subcategories',()=>{
 assert.deepEqual(frontend.ITEM_CATEGORIES,backend.ITEM_CATEGORIES);assert.equal(frontend.ITEM_CATEGORIES.length,28);
 assert.equal(frontend.ITEM_CATEGORIES.flatMap(c=>c.subcategories).length,203);assert.equal(frontend.OTHER_CATEGORY_ID,'otra');
});
test('duration and catalog validators enforce exact minutes and the F1.1 contract',()=>{
 for(const duration of [15,45,75,95])assert.equal(durationInMinutes(String(Math.floor(duration/60)),String(duration%60)),duration);
 for(const [h,m]of [['1.5','0'],['0','60'],['','0'],['0','0']])assert.equal(durationInMinutes(h,m),null);
 assert.equal(validateCatalog(catalogDraft({barcode:'000123'})),null);
 assert.ok(validateCatalog(catalogDraft({barcode:'12 34'})));
 assert.ok(validateCatalog(catalogDraft({categoryId:'otra'})));
 assert.equal(validateCatalog(catalogDraft({categoryId:'otra',customCategoryName:'Propia',customSubcategoryName:'Sub'})),null);
});
test('edit loads complete photos and preserves money, catalog, inventory, badges and taxes',async()=>{
 const calls=[];apiHandler=async(url,options)=>{calls.push({url,options});return structuredClone(item);};
 const {result,saved}=mount();
 await act(async()=>{await result.current.handleStartEdit({id:item.id});});
 assert.equal(result.current.existingImages.length,2);
 await act(async()=>{await result.current.handleSend();});
 const body=JSON.parse(calls.find(c=>c.options?.method==='PATCH').options.body);
 for(const key of ['price','inventoryMode','saleConcept','appliesImpoconsumo','impoconsumoRate','barcode','brand','publishWithoutPrice','quotationDescription'])assert.deepEqual(body[key],item[key],key);
 assert.deepEqual(body.badges,item.badges);assert.equal(body.status,undefined);assert.equal(saved.length,1);
});
test('service editing round trips exact duration and unchanged schedule',async()=>{
 for(const durationMinutes of [15,45,75,95]){
 const service={...item,type:'SERVICE',inventoryMode:'NONE',saleConcept:'SERVICES',appliesImpoconsumo:false,impoconsumoRate:null,durationMinutes,schedule:[{weekday:'MON',startMinute:480,endMinute:720}]};let body;
 apiHandler=async(url,options)=>{if(options?.method==='PATCH')body=JSON.parse(options.body);return structuredClone(service);};
 const {result,unmount}=mount();
 await act(async()=>{await result.current.handleStartEdit(service);});
 await act(async()=>{await result.current.handleSend();});
 assert.equal(body.durationMinutes,durationMinutes);assert.deepEqual(body.schedule,service.schedule);unmount();
 }
});
test('partial image failure retries only failed photos on the same item and blocks double submit',async()=>{
 const calls=[];let uploads=0,fail=true;const created={...item,images:[]};
 apiHandler=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/images/upload')){uploads++;if(uploads===2&&fail)throw Error('image unavailable');return {id:'photo-'+uploads};}
  if(options?.method==='POST')await new Promise(resolve=>setTimeout(resolve,10));
  return structuredClone(created);
 };
 const {result}=mount();
 await act(async()=>{await result.current.handleStartEdit(null);});
 act(()=>{result.current.setName('Nuevo');result.current.setPrice('2500');result.current.handleAddImages([new File(['a'],'a.png',{type:'image/png'}),new File(['b'],'b.png',{type:'image/png'})]);});
 await act(async()=>{await Promise.all([result.current.handleSend(),result.current.handleSend()]);});
 assert.equal(result.current.newImages.length,1);assert.equal(result.current.composerMode,'edit');
 fail=false;await act(async()=>{await result.current.handleSend();});
 assert.equal(calls.filter(c=>c.url==='/items'&&c.options?.method==='POST').length,1);
 assert.equal(uploads,3);assert.equal(result.current.composerMode,'closed');
});
test('late detail response cannot replace a newer edit or reopen a closed form',async()=>{
 let resolveFirst;apiHandler=async url=>url.endsWith('/first')?new Promise(resolve=>{resolveFirst=resolve;}):structuredClone({...item,id:'second'});
 const {result}=mount();let first;
 act(()=>{first=result.current.handleStartEdit({id:'first'});});
 await act(async()=>{await result.current.handleStartEdit({id:'second'});});
 await act(async()=>{resolveFirst({...item,id:'first'});await first;});
 assert.equal(result.current.editingItem.id,'second');
 act(()=>result.current.handleToggleComposer());assert.equal(result.current.composerMode,'closed');
});

const React=require("react");
const {ItemFormContent}=require("../components/mi-negocio/ItemFormContent.tsx");
const noop=()=>{};
function FormHarness(){
 const form=useItemForm(noop,noop);
 return React.createElement(React.Fragment,null,
   React.createElement("button",{onClick:()=>form.handleStartEdit(item)},"Abrir edición"),
   React.createElement(ItemFormContent,{...form.contentProps}),
   React.createElement("button",{onClick:form.handleSend},"Guardar prueba"));
}
test("tabs preserve catalog and quotation state, preview is local, visibility never clears internal price",async()=>{
 const calls=[];apiHandler=async(url,options)=>{calls.push({url,options});return structuredClone(item);};
 render(React.createElement(FormHarness));
 assert.equal(screen.getByRole("tab",{name:"Datos"}).getAttribute("aria-selected"),"true");
 assert.deepEqual(screen.getAllByRole("tab").map(t=>t.textContent),["IVA","Datos","Código/QR"]);
 assert.equal(screen.queryByText(/CATÁLOGO DE MI NEGOCIO/i),null);
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Abrir edición"})));
 assert.ok(screen.getByLabelText("Precio"));
 for(const hiddenLabel of [/Marca/,/Código de barras/])assert.equal(screen.queryByLabelText(hiddenLabel),null);
 assert.ok(screen.getByText("Visible para tus clientes en el catálogo"));
 fireEvent.click(screen.getByRole("switch",{name:"No mostrar en catálogo"}));
 assert.ok(screen.getByText("Oculto: Solo tú lo ves en tu panel"));
 assert.ok(screen.getByText('Los clientes verán "Consultar precio"'));
 assert.ok(screen.getByText("Consultar precio"));
 assert.ok(screen.getByText("Esta descripción aparecerá en las cotizaciones"));
 fireEvent.change(screen.getByLabelText("Descripción para cotización"),{target:{value:"A medida"}});
 assert.equal(screen.getByRole("progressbar").getAttribute("aria-valuenow"),"8");
 fireEvent.click(screen.getByRole("switch",{name:"Incluir en cotización"}));
 assert.ok(screen.getByText("Activa para escribir la descripción que verá el cliente"));
 const arrowTab=screen.getByRole("tab",{name:"Datos"});fireEvent.keyDown(arrowTab,{key:"ArrowRight"});
 assert.equal(screen.getByRole("tab",{name:"Código/QR"}).getAttribute("aria-selected"),"true");
 fireEvent.click(screen.getByRole("tab",{name:"IVA"}));
 fireEvent.click(screen.getByRole("tab",{name:"Código/QR"}));
 assert.equal(calls.filter(c=>c.options?.method).length,0);
 assert.equal(screen.queryByRole("button",{name:"Generar QR"}),null);
 fireEvent.click(screen.getByRole("tab",{name:"Datos"}));
 fireEvent.click(screen.getByLabelText("Incluir en cotización"));
 assert.equal(screen.getByLabelText("Descripción para cotización").value,"A medida");
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Guardar prueba"})));
 const body=JSON.parse(calls.find(c=>c.options?.method==='PATCH').options.body);
 assert.equal(body.price,2300);assert.equal(body.visibleInCatalog,false);assert.equal(body.publishWithoutPrice,true);
 assert.equal(body.barcode,"00001234");assert.equal(body.brand,"Marca");assert.equal(body.quotationDescription,"A medida");assert.equal(body.status,undefined);
});
test("quotation clear and use-name only touch the quotation text and keep the counter in sync",async()=>{
 apiHandler=async()=>structuredClone(item);
 render(React.createElement(FormHarness));
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Abrir edición"})));
 const quote=()=>screen.getByLabelText("Descripción para cotización"),bar=()=>screen.getByRole("progressbar");
 fireEvent.click(screen.getByRole("button",{name:"Limpiar"}));
 assert.equal(quote().value,"");assert.equal(bar().getAttribute("aria-valuenow"),"0");assert.ok(screen.getByText("0 / 400"));
 assert.ok(screen.getByText("Aquí aparecerá la descripción que escribas…"));
 assert.equal(screen.getByLabelText("Nombre").value,"Mesa");
 fireEvent.change(screen.getByLabelText("Nombre"),{target:{value:"x".repeat(450)}});
 fireEvent.click(screen.getByRole("button",{name:"Usar nombre"}));
 assert.equal(quote().value.length,400);assert.equal(bar().getAttribute("aria-valuenow"),"400");
 assert.equal(screen.getByLabelText("Nombre").value.length,450);
 assert.ok(screen.getByText("Producto",{selector:"span"}));
});
test("an invalid saved barcode is shown for correction and stays visible while editing",async()=>{
 let body;apiHandler=async(url,options)=>{if(options?.method==='PATCH')body=JSON.parse(options.body);return structuredClone({...item,barcode:"con espacio"});};
 render(React.createElement(FormHarness));
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Abrir edición"})));
 const field=screen.getByLabelText(/Código de barras guardado/);
 assert.equal(field.value,"con espacio");
 fireEvent.change(field,{target:{value:"7701234"}});
 assert.ok(screen.getByLabelText(/Código de barras guardado/));
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Guardar prueba"})));
 assert.equal(body.barcode,"7701234");
});
test("category picker allows fixed category without subcategory and custom names only under otra",async()=>{
 let body;apiHandler=async(url,options)=>{if(options?.method==='PATCH')body=JSON.parse(options.body);return structuredClone(item);};
 render(React.createElement(FormHarness));
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Abrir edición"})));
 const trigger=screen.getByRole("button",{name:/Elegir categoría/});
 fireEvent.click(trigger);
 assert.ok(screen.getByRole("dialog",{name:"Elegir una categoría"}));
 assert.match(screen.getAllByRole("button",{name:/Sin categoría/})[0].textContent,/Sin categoría/);
 fireEvent.click(screen.getByRole("button",{name:/Alimentos y Bebidas/}));
 assert.ok(screen.getByRole("dialog",{name:"Elegir una subcategoría"}));
 assert.ok(screen.getByLabelText("Completado"));
 fireEvent.click(screen.getByRole("button",{name:"Usar solo «Alimentos y Bebidas», sin subcategoría"}));
 assert.equal(screen.queryByRole("dialog"),null);assert.equal(document.activeElement,trigger);
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Guardar prueba"})));
 assert.equal(body.categoryId,"alimentos-y-bebidas");assert.equal(body.subcategoryId,null);
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Abrir edición"})));
 fireEvent.click(screen.getByRole("button",{name:/Elegir categoría/}));
 fireEvent.click(screen.getByRole("button",{name:/^Otra categoría/}));
 fireEvent.change(screen.getByLabelText("Nombre de categoría"),{target:{value:"Mi categoría"}});
 fireEvent.change(screen.getByLabelText("Subcategoría personalizada (opcional)"),{target:{value:"Mi subcategoría"}});
 fireEvent.click(screen.getByRole("button",{name:"Listo"}));
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Guardar prueba"})));
 assert.deepEqual([body.categoryId,body.subcategoryId,body.customCategoryName,body.customSubcategoryName],["otra",null,"Mi categoría","Mi subcategoría"]);
});
test("category modal searches per step, picks a subcategory, clears with Sin categoría and Escape closes only the selector",async()=>{
 let body;apiHandler=async(url,options)=>{if(options?.method==='PATCH')body=JSON.parse(options.body);return structuredClone(item);};
 render(React.createElement(FormHarness));
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Abrir edición"})));
 const trigger=screen.getByRole("button",{name:/Elegir categoría/});
 fireEvent.click(trigger);
 fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});
 assert.equal(screen.queryByRole("dialog"),null);assert.equal(document.activeElement,trigger);
 assert.equal(screen.getByLabelText("Nombre").value,"Mesa");
 fireEvent.click(trigger);
 fireEvent.change(screen.getByLabelText("Buscar categoría"),{target:{value:"electro"}});
 assert.deepEqual(screen.getAllByRole("button",{name:/opciones/}).map(b=>b.textContent.replace(/\d+ opciones/,"")),["Electrónica y Tecnología","Electrodomésticos"]);
 fireEvent.click(screen.getByRole("button",{name:/Electrodomésticos/}));
 assert.equal(screen.getByLabelText("Buscar subcategoría").value,"");
 const options=()=>screen.getByRole("dialog").querySelectorAll("button[aria-pressed]").length;
 const allSubs=options();assert.ok(allSubs>1);
 fireEvent.change(screen.getByLabelText("Buscar subcategoría"),{target:{value:"lavado"}});
 assert.equal(options(),1);
 fireEvent.click(screen.getByRole("button",{name:/Lavado/}));
 assert.equal(document.activeElement,trigger);
 assert.match(trigger.textContent,/Electrodomésticos/);
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Guardar prueba"})));
 assert.equal(body.categoryId,"electrodomesticos");assert.match(body.subcategoryId,/^electrodomesticos\//);
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Abrir edición"})));
 fireEvent.click(screen.getByRole("button",{name:/Elegir categoría/}));
 fireEvent.click(screen.getByRole("button",{name:/^Otra categoría/}));
 fireEvent.change(screen.getByLabelText("Nombre de categoría"),{target:{value:"Propia"}});
 fireEvent.change(screen.getByLabelText("Subcategoría personalizada (opcional)"),{target:{value:"Sub"}});
 fireEvent.click(screen.getByRole("button",{name:"Listo"}));
 fireEvent.click(screen.getByRole("button",{name:/Propia/}));
 fireEvent.click(screen.getByRole("button",{name:/^Sin categoría/}));
 assert.match(screen.getByRole("button",{name:/Elegir categoría/}).textContent,/Elegir categoría/);
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Guardar prueba"})));
 assert.deepEqual([body.categoryId,body.subcategoryId,body.customCategoryName,body.customSubcategoryName],[null,null,null,null]);
});

const Page=require("../../app/(app)/mi-negocio/page.tsx").default;
test("Mi Negocio card, Mi Tienda edit and inventory itemId aliases load full detail",async()=>{
 for(const query of ["", "edit=item-1", "editItem=item-1", "itemId=item-1"]){
  routeParams=new URLSearchParams(query);const calls=[];
  apiHandler=async(url,options)=>{calls.push({url,options});return url.startsWith("/items?")?[{...item,images:item.images.slice(0,1)}]:structuredClone(item);};
  await act(async()=>{render(React.createElement(Page));await new Promise(resolve=>setTimeout(resolve,5));});
  if(!query) await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Editar tarjeta"})));
  assert.ok(calls.some(c=>c.url==="/items/item-1"));
  assert.equal(screen.getByLabelText("Nombre").value,"Mesa");
  assert.equal(document.querySelectorAll('img[src^="https://test/"]').length,2);
  cleanup();
 }
});
test("creates a service with exact duration and only existing API fields",async()=>{
 let body;apiHandler=async(url,options)=>{if(url==="/items"&&options?.method==="POST")body=JSON.parse(options.body);return {...item,...body,id:"service-created"};};
 const {result}=mount();
 await act(async()=>result.current.handleStartEdit(null));
 act(()=>{result.current.setType("SERVICE");result.current.setName("Tratamiento");result.current.setPrice("55000");result.current.setSaleConcept("SERVICES");result.current.setDurationInput("1");result.current.setDurationMinutesInput("35");});
 await act(async()=>result.current.handleSend());
 assert.equal(body.type,"SERVICE");assert.equal(body.durationMinutes,95);assert.equal(body.inventoryMode,"NONE");assert.ok(body.schedule.length>0);
 for(const key of ["requiresAppointment","allowWalkIn","sharedSchedule","holidays","status"])assert.equal(body[key],undefined);
});
test("quotation text remains persisted when inclusion is turned off",async()=>{
 let body;apiHandler=async(url,options)=>{if(options?.method==="PATCH")body=JSON.parse(options.body);return structuredClone(item);};
 const {result}=mount();
 await act(async()=>result.current.handleStartEdit(item));
 act(()=>result.current.setCatalog({...result.current.catalog,includeInQuotation:false}));
 await act(async()=>result.current.handleSend());
 assert.equal(body.includeInQuotation,false);assert.equal(body.quotationDescription,item.quotationDescription);
});

// ---- F1.3: recent categories and name suggestions ----
const {recentCategories,suggestCategory,CATEGORY_RULES}=require('../lib/itemCategorySuggestions.ts');
const A='alimentos-y-bebidas';
const saved=(categoryId,subcategoryId,updatedAt,extra={})=>({id:updatedAt,categoryId,subcategoryId,updatedAt,...extra});
test("recent categories: newest updatedAt first, distinct, at most four, invalid and Otra skipped, list untouched",()=>{
 const items=[
  saved(A,`${A}/lacteos-y-huevos`,"2026-11-01T00:00:00Z"),
  saved(A,`${A}/licores-y-cervezas`,"2026-11-05T00:00:00Z"),
  saved(A,`${A}/lacteos-y-huevos`,"2026-11-06T00:00:00Z"),
  saved("otra",null,"2026-11-09T00:00:00Z",{customCategoryName:"Propia"}),
  saved("borrada",null,"2026-11-08T00:00:00Z"),
  saved(A,"mascotas/alimento-para-perros","2026-11-07T00:00:00Z"),
  saved(null,null,"2026-11-10T00:00:00Z"),
  saved("mascotas",null,"2026-11-04T00:00:00Z"),
  saved("aseo-y-limpieza","aseo-y-limpieza/ambientadores","2026-11-03T00:00:00Z"),
  saved("calzado",null,"2026-11-02T00:00:00Z"),
 ];
 const before=items.map(i=>i.id);
 assert.deepEqual(recentCategories(items),[
  {categoryId:A,subcategoryId:`${A}/lacteos-y-huevos`},
  {categoryId:A,subcategoryId:`${A}/licores-y-cervezas`},
  {categoryId:"mascotas",subcategoryId:null},
  {categoryId:"aseo-y-limpieza",subcategoryId:"aseo-y-limpieza/ambientadores"},
 ]);
 assert.deepEqual(items.map(i=>i.id),before);
 assert.deepEqual(recentCategories([]),[]);
});
test("the 18 prototype rules point only to existing category and subcategory ids",()=>{
 assert.equal(CATEGORY_RULES.length,18);
 for(const rule of CATEGORY_RULES){
  const category=frontend.ITEM_CATEGORIES.find(c=>c.id===rule.categoryId);
  assert.ok(category,rule.categoryId);
  if(rule.subcategoryId)assert.ok(category.subcategories.some(s=>s.id===rule.subcategoryId),rule.subcategoryId);
 }
});
test("name suggestions: whole normalized words, ambiguity yields nothing or category only, short names ignored",()=>{
 const sub=s=>({categoryId:A,subcategoryId:`${A}/${s}`});
 assert.deepEqual(suggestCategory("Cerveza Club Colombia"),sub("licores-y-cervezas"));
 assert.deepEqual(suggestCategory("JAMÓN de cerdo"),sub("carnes-pescados-y-embutidos"));
 assert.deepEqual(suggestCategory("Pan tajado"),sub("panaderia-y-galletas"));
 assert.deepEqual(suggestCategory("Panes artesanales"),sub("panaderia-y-galletas"));
 assert.deepEqual(suggestCategory("Panadería del barrio"),sub("panaderia-y-galletas"));
 assert.deepEqual(suggestCategory("Comida congelada"),sub("congelados-y-helados"));
 assert.deepEqual(suggestCategory("Corte de cabello"),{categoryId:"belleza-y-cuidado-personal",subcategoryId:"belleza-y-cuidado-personal/cuidado-del-cabello"});
 assert.deepEqual(suggestCategory("Collar para perro"),{categoryId:"mascotas",subcategoryId:null});
 for(const name of ["Aguacate hass","Pantalón jean","Teclado","Mesa","Ronda","Petaca"])assert.equal(suggestCategory(name),null,name);
 assert.equal(suggestCategory("Crema de leche"),null);
 assert.equal(suggestCategory("Alimento para perro"),null);
 assert.deepEqual(suggestCategory("Café con leche"),{categoryId:A,subcategoryId:null});
 for(const name of ["","té","  ab  "])assert.equal(suggestCategory(name),null,name);
 assert.equal(suggestCategory("Alcohol antiséptico"),null);
});
test("known false positives are excluded without hiding the real matches",()=>{
 for(const name of ["Pasta dental","Pasta de dientes","Clases de salsa","Clase de salsa caleña","Gato hidráulico","Gato hidráulico 2 toneladas","Gato mecánico"])assert.equal(suggestCategory(name),null,name);
 assert.deepEqual(suggestCategory("Pasta corta"),{categoryId:A,subcategoryId:`${A}/despensa-y-granos`});
 assert.deepEqual(suggestCategory("Salsa de tomate"),{categoryId:A,subcategoryId:`${A}/aceites-salsas-y-condimentos`});
 assert.deepEqual(suggestCategory("Arena para gato"),{categoryId:"mascotas",subcategoryId:null});
 for(const rule of CATEGORY_RULES)for(const term of rule.unless??[])assert.ok(!rule.terms.includes(term),term);
});
function CategoryHarness({start,recentItems}){
 const form=useItemForm(noop,noop);
 return React.createElement(React.Fragment,null,
   React.createElement("button",{onClick:()=>form.handleStartEdit(start)},"Abrir edición"),
   React.createElement(ItemFormContent,{...form.contentProps,recentItems}),
   React.createElement("button",{onClick:form.handleSend},"Guardar prueba"));
}
const storageWrites=()=>{const calls=[];const original=window.localStorage.setItem;window.localStorage.setItem=function(...a){calls.push(a);return original.apply(this,a);};return {calls,restore:()=>{window.localStorage.setItem=original;}};};
test("suggestion is offered in the modal, never applied by itself, and works for products and services",async()=>{
 for(const start of [item,{...item,type:'SERVICE',inventoryMode:'NONE',saleConcept:'SERVICES',appliesImpoconsumo:false,impoconsumoRate:null,durationMinutes:30,schedule:[{weekday:'MON',startMinute:480,endMinute:720}]}]){
  const isService=start.type==='SERVICE';const name=isService?"Corte de cabello":"Cerveza artesanal";
  let body;const calls=[];apiHandler=async(url,options)=>{calls.push({url,method:options?.method});if(options?.method==='PATCH')body=JSON.parse(options.body);return structuredClone(start);};
  const storage=storageWrites();
  render(React.createElement(CategoryHarness,{start}));
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Abrir edición"})));
  fireEvent.change(screen.getByLabelText("Nombre"),{target:{value:name}});
  const trigger=screen.getByRole("button",{name:/Elegir categoría/});
  fireEvent.click(trigger);
  const use=screen.getByRole("button",{name:/^Usar sugerencia:/});
  assert.match(use.textContent,new RegExp(`Sugerida para «${name}»`));
  assert.match(trigger.textContent,/Elegir categoría/);
  assert.equal(screen.getAllByRole("button",{name:/Sin categoría/})[0].textContent,"Sin categoría");
  fireEvent.click(use);
  assert.equal(screen.queryByRole("dialog"),null);assert.equal(document.activeElement,trigger);
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Guardar prueba"})));
  assert.deepEqual([body.categoryId,body.subcategoryId,body.customCategoryName,body.customSubcategoryName],isService
   ?["belleza-y-cuidado-personal","belleza-y-cuidado-personal/cuidado-del-cabello",null,null]
   :[A,`${A}/licores-y-cervezas`,null,null]);
  assert.equal(body.type,start.type);
  assert.deepEqual(calls.map(c=>c.method??"GET").filter(m=>m!=="GET"),["PATCH"]);
  assert.equal(storage.calls.length,0);storage.restore();
  cleanup();
 }
});
test("a saved or manual selection is never replaced: no suggestion while a category is chosen",async()=>{
 let body;const start={...item,name:"Cerveza",categoryId:"calzado",subcategoryId:null};
 apiHandler=async(url,options)=>{if(options?.method==='PATCH')body=JSON.parse(options.body);return structuredClone(start);};
 render(React.createElement(CategoryHarness,{start,recentItems:[]}));
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Abrir edición"})));
 fireEvent.change(screen.getByLabelText("Nombre"),{target:{value:"Cerveza negra"}});
 fireEvent.click(screen.getByRole("button",{name:/Calzado/}));
 assert.equal(screen.queryByRole("button",{name:/^Usar sugerencia:/}),null);
 assert.equal(screen.queryByText("Usadas recientemente"),null);
 fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Guardar prueba"})));
 assert.deepEqual([body.categoryId,body.subcategoryId],["calzado",null]);
});
test("recent chips pick the full pair in one click, clear custom names, allow no subcategory and keep keyboard behaviour",async()=>{
 let body;apiHandler=async(url,options)=>{if(options?.method==='PATCH')body=JSON.parse(options.body);return structuredClone(item);};
 const recentItems=[saved(A,`${A}/lacteos-y-huevos`,"2026-11-06T00:00:00Z"),saved("mascotas",null,"2026-11-05T00:00:00Z"),saved("otra",null,"2026-11-09T00:00:00Z",{customCategoryName:"Propia"})];
 const storage=storageWrites();
 render(React.createElement(CategoryHarness,{start:item,recentItems}));
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Abrir edición"})));
 // Start from a custom selection so the quick pick has to clear the custom names.
 fireEvent.click(screen.getByRole("button",{name:/Elegir categoría/}));
 fireEvent.click(screen.getByRole("button",{name:/^Otra categoría/}));
 fireEvent.change(screen.getByLabelText("Nombre de categoría"),{target:{value:"Propia"}});
 fireEvent.change(screen.getByLabelText("Subcategoría personalizada (opcional)"),{target:{value:"Sub"}});
 fireEvent.click(screen.getByRole("button",{name:"Listo"}));
 const trigger=screen.getByRole("button",{name:/Propia/});
 fireEvent.click(trigger);
 assert.ok(screen.getByText("Usadas recientemente"));
 assert.deepEqual([...screen.getByRole("dialog").querySelectorAll("button[aria-label^='Usar ']")].map(c=>c.getAttribute("aria-label")),["Usar Alimentos y Bebidas › Lácteos y Huevos","Usar Mascotas, sin subcategoría"]);
 const dialog=screen.getByRole("dialog");const focusable=dialog.querySelectorAll("button:not([disabled]), input:not([disabled])");
 focusable[focusable.length-1].focus();fireEvent.keyDown(dialog,{key:"Tab"});assert.equal(document.activeElement,focusable[0]);
 fireEvent.change(screen.getByLabelText("Buscar categoría"),{target:{value:"masc"}});
 assert.equal(screen.queryByText("Usadas recientemente"),null);
 fireEvent.change(screen.getByLabelText("Buscar categoría"),{target:{value:""}});
 fireEvent.click(screen.getByRole("button",{name:"Usar Alimentos y Bebidas › Lácteos y Huevos"}));
 assert.equal(screen.queryByRole("dialog"),null);assert.equal(document.activeElement,trigger);
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Guardar prueba"})));
 assert.deepEqual([body.categoryId,body.subcategoryId,body.customCategoryName,body.customSubcategoryName],[A,`${A}/lacteos-y-huevos`,null,null]);
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Abrir edición"})));
 fireEvent.click(screen.getByRole("button",{name:/Elegir categoría/}));
 fireEvent.click(screen.getByRole("button",{name:"Usar Mascotas, sin subcategoría"}));
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Guardar prueba"})));
 assert.deepEqual([body.categoryId,body.subcategoryId],["mascotas",null]);
 assert.equal(storage.calls.length,0);storage.restore();
});
test("Mi Negocio passes its saved items to the picker as recent categories",async()=>{
 routeParams=new URLSearchParams("");
 const listed={...item,categoryId:"calzado",subcategoryId:null,updatedAt:"2026-11-10T00:00:00Z",images:item.images.slice(0,1)};
 apiHandler=async(url)=>url.startsWith("/items?")?[listed]:structuredClone(item);
 await act(async()=>{render(React.createElement(Page));await new Promise(resolve=>setTimeout(resolve,5));});
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Editar tarjeta"})));
 fireEvent.click(screen.getByRole("button",{name:/Elegir categoría/}));
 assert.ok(screen.getByRole("button",{name:"Usar Calzado, sin subcategoría"}));
});
