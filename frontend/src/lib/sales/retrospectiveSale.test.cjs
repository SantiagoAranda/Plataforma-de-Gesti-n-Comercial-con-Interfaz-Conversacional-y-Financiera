const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith("@/")) request = path.join(__dirname, "../../..", request.slice(2));
  return originalResolve.call(this, request, ...args);
};
require.extensions[".ts"] = (module, filename) =>
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const {serviceHasEnded, saveManualService} = require('./retrospectiveSale.ts');
const now = Date.parse('2030-06-18T17:00:00Z');
const data = {type:'SERVICIO', scheduledAt:'2030-06-18T10:00:00',durationMinutes:60,items:[{itemId:'svc',quantity:1,unitPrice:123}],paymentMethod:'CASH'};
test('end boundary and business time, never browser timezone',()=>{
  assert.equal(serviceHasEnded(data.scheduledAt,60,now),true);
  assert.equal(serviceHasEnded('2030-06-18T11:30:00',60,now),false);
  assert.equal(serviceHasEnded('2030-06-18T11:00:00',60,now),true);
  assert.equal(serviceHasEnded('2030-06-19T10:00:00',60,now),false);
  assert.equal(serviceHasEnded('2030-06-17T10:00:00',60,now),true);
});
test('VOLVER does not send a create',async()=>{
  let calls=0; const ref={current:null};
  assert.equal(await saveManualService(ref,data,async()=>{calls++;},async()=>false,now),null);
  assert.equal(calls,0); assert.equal(ref.current,null);
});
test('confirmed past service declares provision; uncertain retry retains exact request and key',async()=>{
  const ref={current:null}; const requests=[]; let prompts=0;
  const create=async payload=>{requests.push(payload);if(requests.length===1)throw Error('lost response');return {id:'same'};};
  await assert.rejects(saveManualService(ref,data,create,async()=>{prompts++;return true;},now));
  assert.deepEqual(await saveManualService(ref,data,create,async()=>{prompts++;return true;},now),{id:'same'});
  assert.equal(prompts,1); assert.equal(requests[0],requests[1]); assert.equal(requests[0].serviceProvided,true);
  assert.match(requests[0].idempotencyKey,/^[0-9a-f-]{36}$/);
});
test('changed data starts a new operation; original future retry is recovered before asking after time elapsed',async()=>{
  const ref={current:null}; const future={...data, scheduledAt:'2030-06-18T13:00:00'};
  await assert.rejects(saveManualService(ref,future,async()=>{throw Error('lost');},async()=>{throw Error('unexpected prompt');},now));
  const oldKey=ref.current.payload.idempotencyKey;
  await saveManualService(ref,future,async p=>{assert.equal(p.idempotencyKey,oldKey);assert.equal(p.serviceProvided,undefined);return {id:'same'};},async()=>{throw Error('unexpected prompt');},now+86400000);
  await saveManualService(ref,{...future,paymentMethod:'BANK_TRANSFER'},async p=>{assert.notEqual(p.idempotencyKey,oldKey);return {};},async()=>true,now);
});
test('server says service ended during entry: confirmation precedes second request; cancel sends nothing further',async()=>{
  for(const yes of [false,true]) {
    const ref={current:null}; const sequence=[];
    const result=await saveManualService(ref,{...data,scheduledAt:'2030-06-18T11:30:00'},async p=>{
      sequence.push(p.serviceProvided?'create-confirmed':'create');
      if(!p.serviceProvided)throw {details:{code:'SERVICE_PROVIDED_CONFIRMATION_REQUIRED'}};
      return {id:'done'};
    },async()=>{sequence.push('prompt');return yes;},now);
    assert.deepEqual(sequence,yes?['create','prompt','create-confirmed']:['create','prompt']);
    assert.deepEqual(result,yes?{id:'done'}:null);
  }
});
