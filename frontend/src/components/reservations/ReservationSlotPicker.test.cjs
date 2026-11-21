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
const { render, screen, fireEvent, cleanup, act } = require('@testing-library/react');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request,...args) {
  if(request.startsWith('@/')) request=path.join(__dirname,'../../..',request.slice(2));
  return originalResolve.call(this,request,...args);
};
const requests=[];
const originalLoad=Module._load;
Module._load=function(request,...args){
  if(request==='@/src/lib/api')return {api:async path=>{requests.push(path);return path.includes('manual-service-times')?(path.includes('2099-12-01')?[{time:'10:00',kind:'AVAILABLE'}]:[{time:'03:00',kind:'HISTORICAL'}]):path.includes('calendar')?['2099-12-01']:['10:00'];}};
  return originalLoad.call(this,request,...args);
};
require.extensions['.tsx']=require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const Picker=require('./ReservationSlotPicker.tsx').default;
const h=React.createElement;
afterEach(()=>{cleanup();requests.length=0;});
test('manual history enables days independently of availability; navigation crosses years and exact entry stays hidden',async()=>{
  const changes=[];
  await act(async()=>render(h(Picker,{mode:'private',manualSale:true,itemId:'svc',durationMin:60,selectedDate:'2020-01-01',onChange:x=>changes.push(x)})));
  assert.equal(screen.getByRole('button',{name:'15',exact:true}).disabled,false);
  assert.ok(screen.getByRole('button',{name:/03:00 AM/}));
  assert.ok(requests.some(x=>x.startsWith('/sales/manual-service-times')));
  assert.equal(screen.queryByLabelText('Hora histórica exacta'),null);
  assert.equal(screen.queryByText('Pasado'),null);
  assert.equal(screen.queryByText(/no representan disponibilidad histórica/),null);
  const slot=screen.getByRole('button',{name:'03:00 AM',exact:true});
  assert.ok(slot.className.includes('border-dashed'));
  fireEvent.click(slot);
  assert.equal(changes.at(-1).startMinute,180);
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Mes anterior'})));
  assert.ok(screen.getByText('Diciembre 2019'));
});
test('future manual dates retain availability and only available future slots',async()=>{
  await act(async()=>render(h(Picker,{mode:'private',manualSale:true,itemId:'svc',selectedDate:'2099-12-01',onChange(){}})));
  assert.equal(screen.getAllByRole('button',{name:'1',exact:true}).some(b=>!b.disabled),true);
  assert.equal(screen.getByRole('button',{name:'15',exact:true}).disabled,true);
  assert.ok(screen.getByRole('button',{name:'10:00 AM',exact:true}));
  assert.equal(screen.queryByLabelText('Hora histórica exacta'),null);
});
test('public mode cannot enable history even if manualSale is passed',async()=>{
  const paths=[];global.fetch=async path=>{paths.push(path);return {ok:true,json:async()=>[]};};
  await act(async()=>render(h(Picker,{mode:'public',manualSale:true,businessSlug:'qa',itemId:'svc',selectedDate:'2020-01-01',onChange(){}})));
  assert.equal(screen.getByRole('button',{name:'15',exact:true}).disabled,true);
  assert.equal(screen.queryByLabelText('Hora histórica exacta'),null);
  assert.ok(paths.every(x=>x.includes('/public/qa/')));
});

test('changing service, date or duration refreshes suggestions and clears unavailable history',async()=>{
  const changes=[];
  const props={mode:'private',manualSale:true,itemId:'svc',durationMin:60,selectedDate:'2020-01-01',selectedStartMinute:197,onChange:x=>changes.push(x)};
  let view;
  await act(async()=>{view=render(h(Picker,props));});
  assert.equal(changes.at(-1).startMinute,null);
  assert.equal(screen.queryByRole('button',{name:'03:17 AM'}),null);
  for(const change of [{itemId:'other'},{selectedDate:'2020-01-02'},{durationMin:90}]){
    requests.length=0;
    Object.assign(props,change);
    await act(async()=>view.rerender(h(Picker,props)));
    const request=requests.find(x=>x.includes('manual-service-times'));
    assert.ok(request.includes(`itemId=${props.itemId}`));
    assert.ok(request.includes(`date=${props.selectedDate}`));
    assert.ok(request.includes(`durationMinutes=${props.durationMin}`));
    assert.equal(changes.at(-1).startMinute,null);
  }
});
