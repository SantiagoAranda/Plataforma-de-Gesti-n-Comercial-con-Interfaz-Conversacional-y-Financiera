/* eslint-disable @typescript-eslint/no-require-imports -- Node test harness using the existing CommonJS test convention. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const token = (id, business = id) =>
  `header.${Buffer.from(JSON.stringify({ sub: id, businessId: business, role: "BUSINESS" })).toString("base64url")}.fixture`;

function sandboxWith(extra = {}) {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  return {
    memory,
    sandbox: {
      console, Headers, Response, FormData, Date, atob, URL, AbortController, DOMException,
      setTimeout, clearTimeout,
      process: { env: {} },
      localStorage: storage,
      sessionStorage: { ...storage },
      window: { location: { pathname: "/home", href: "" }, addEventListener() {} },
      fetch: async () => { throw new Error("Unexpected fetch"); },
      ...extra,
    },
  };
}

function loader(sandbox) {
  const modules = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (!path.extname(filename)) filename += ".ts";
    if (modules.has(filename)) return modules.get(filename).exports;
    const mod = { exports: {} };
    modules.set(filename, mod);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${source}\n})`, sandbox)(
      (name) => load(path.resolve(path.dirname(filename), name)), mod, mod.exports);
    return mod.exports;
  }
  return load;
}

function logoutHarness({ fetchImpl, unsubscribe } = {}) {
  const order = [];
  const { memory, sandbox } = sandboxWith({
    navigator: {
      serviceWorker: {
        getRegistration: async () => ({
          pushManager: {
            getSubscription: async () => ({
              unsubscribe: async () => {
                order.push("unsubscribe");
                return unsubscribe ? unsubscribe() : true;
              },
            }),
          },
        }),
      },
    },
  });
  sandbox.fetch = fetchImpl ?? (async () => {
    order.push("unregister");
    return new Response(JSON.stringify({ configured: false, enabled: false }), { status: 200 });
  });
  const load = loader(sandbox);
  const session = load(path.join(__dirname, "../auth/session.ts"));
  const lifecycle = load(path.join(__dirname, "lifecycle.ts"));
  return { order, memory, session, lifecycle };
}

test("owner write: a late write or clear from session A never overwrites B", () => {
  const { shouldWriteOwner } = loader(sandboxWith().sandbox)(path.join(__dirname, "owner.ts"));
  const b = { userId: "B", businessId: "B", at: 200 };
  assert.equal(shouldWriteOwner(undefined, b), true);
  assert.equal(shouldWriteOwner(b, { userId: "A", businessId: "A", at: 100 }), false);
  assert.equal(shouldWriteOwner(b, { userId: null, businessId: null, at: 150 }), false); // clear tardío de A
  assert.equal(shouldWriteOwner(b, { userId: null, businessId: null, at: 300 }), true); // clear vigente
});

test("logout unregisters in backend, then unsubscribes the browser, before the caller clears the session", async () => {
  const h = logoutHarness();
  h.session.establishSession({ accessToken: token("A") });
  h.memory.set("push-device-id:v1:A", "device-a");
  const ctx = h.session.getSessionContext();
  await h.lifecycle.pushLogoutCleanup(ctx);
  assert.deepEqual(h.order, ["unregister", "unsubscribe"]);
  assert.equal(h.session.getSessionContext().userId, "A"); // el contexto sigue vigente hasta que el llamador lo limpie
  assert.equal(h.memory.get("push-unregister-pending:v1:A"), undefined);
});

test("logout with network failure completes, still unsubscribes and keeps the unregister pending", async () => {
  const h = logoutHarness({ fetchImpl: async () => { throw new Error("offline"); } });
  h.session.establishSession({ accessToken: token("A") });
  h.memory.set("push-device-id:v1:A", "device-a");
  await h.lifecycle.pushLogoutCleanup(h.session.getSessionContext());
  assert.deepEqual(h.order, ["unsubscribe"]);
  assert.equal(h.memory.get("push-unregister-pending:v1:A"), "true");
});

test("logout keeps the unregister pending when the browser refuses to unsubscribe", async () => {
  const h = logoutHarness({ unsubscribe: () => false });
  h.session.establishSession({ accessToken: token("A") });
  h.memory.set("push-device-id:v1:A", "device-a");
  await h.lifecycle.pushLogoutCleanup(h.session.getSessionContext());
  assert.equal(h.memory.get("push-unregister-pending:v1:A"), "true");
});

test("logout cleanup of a stale session A does not touch the browser subscription of B", async () => {
  const h = logoutHarness();
  h.session.establishSession({ accessToken: token("A") });
  h.memory.set("push-device-id:v1:A", "device-a");
  const stale = h.session.getSessionContext();
  h.session.clearSession();
  h.session.establishSession({ accessToken: token("B") });
  await h.lifecycle.pushLogoutCleanup(stale);
  assert.deepEqual(h.order, []);
  assert.equal(h.memory.get("push-unregister-pending:v1:A"), "true");
  assert.equal(h.memory.get("push-unregister-pending:v1:B"), undefined);
});

test("logout without a registered device or without business does nothing", async () => {
  const h = logoutHarness();
  h.session.establishSession({ accessToken: token("A") });
  await h.lifecycle.pushLogoutCleanup(h.session.getSessionContext());
  assert.deepEqual(h.order, []);
  const admin = logoutHarness();
  admin.session.establishSession({ accessToken: `h.${Buffer.from(JSON.stringify({ sub: "X", role: "ADMIN" })).toString("base64url")}.f` });
  admin.memory.set("push-device-id:v1:X", "d");
  await admin.lifecycle.pushLogoutCleanup(admin.session.getSessionContext());
  assert.deepEqual(admin.order, []);
});

test("a slow backend cannot block logout beyond the step timeout", async () => {
  const h = logoutHarness({ fetchImpl: () => new Promise(() => {}) });
  h.session.establishSession({ accessToken: token("A") });
  h.memory.set("push-device-id:v1:A", "device-a");
  const started = Date.now();
  await h.lifecycle.pushLogoutCleanup(h.session.getSessionContext());
  assert.ok(Date.now() - started < 4000);
  assert.deepEqual(h.order, ["unsubscribe"]);
  assert.equal(h.memory.get("push-unregister-pending:v1:A"), "true");
});

test("without Web Locks the lifecycle runs but never allows rotation", async () => {
  const { sandbox } = sandboxWith({ navigator: {} });
  const { withPushLock } = loader(sandbox)(path.join(__dirname, "lifecycle.ts"));
  assert.equal(await withPushLock(async (canRotate) => canRotate), false);
});

test("with Web Locks the lifecycle may rotate; a busy lock times out recoverably", async () => {
  const held = { request: async (_n, _o, cb) => cb() };
  let { sandbox } = sandboxWith({ navigator: { locks: held } });
  let lifecycle = loader(sandbox)(path.join(__dirname, "lifecycle.ts"));
  assert.equal(await lifecycle.withPushLock(async (canRotate) => canRotate), true);

  const busy = {
    request: (_n, opts) =>
      new Promise((_, reject) =>
        opts.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      ),
  };
  ({ sandbox } = sandboxWith({ navigator: { locks: busy } }));
  lifecycle = loader(sandbox)(path.join(__dirname, "lifecycle.ts"));
  await assert.rejects(lifecycle.withPushLock(async () => 1, 20), { name: "PushLockTimeoutError" });
});

// ---- service worker
function swHarness({ owner, idb = "ok" } = {}) {
  const handlers = {};
  const shown = [];
  const posted = [];
  const fakeIdb = {
    open() {
      const request = {};
      setTimeout(() => {
        if (idb === "error") return request.onerror?.();
        if (idb === "hang") return;
        request.result = {
          createObjectStore() {},
          close() {},
          transaction: () => ({
            objectStore: () => ({
              get() {
                const read = {};
                setTimeout(() => { read.result = owner; read.onsuccess?.(); }, 0);
                return read;
              },
            }),
          }),
        };
        request.onsuccess?.();
      }, 0);
      return request;
    },
  };
  const self = {
    location: { origin: "https://app.example.test" },
    addEventListener: (name, cb) => { handlers[name] = cb; },
    clients: { matchAll: async () => [{ visibilityState: "visible", postMessage: (m) => posted.push(m) }] },
    registration: { showNotification: async (title, options) => shown.push({ title, options }) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../../public/push-sw.js"), "utf8"), {
    self, URL, setTimeout, clearTimeout, indexedDB: fakeIdb,
  });
  async function push(payload) {
    const waits = [];
    handlers.push({ data: { json: () => payload }, waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  }
  return { push, shown, posted };
}

const sale = (recipientBusinessId) => ({
  title: "Nueva venta recibida",
  body: "Pedido de Juan por $ 125.000",
  recipientBusinessId,
  tag: "sale-1",
  data: { type: "SALE_CREATED", saleId: "sale-1", url: "/venta?saleId=sale-1" },
});

test("service worker forwards a verified recipient with the current content", async () => {
  const sw = swHarness({ owner: { userId: "B", businessId: "biz-b", at: 1 } });
  await sw.push(sale("biz-b"));
  assert.equal(sw.shown.length, 0);
  assert.equal(sw.posted[0].body, "Pedido de Juan por $ 125.000");
  assert.equal(sw.posted[0].recipientBusinessId, "biz-b");
});

test("service worker shows no private data for another business (stale owner)", async () => {
  const sw = swHarness({ owner: { userId: "B", businessId: "biz-b", at: 1 } });
  await sw.push(sale("biz-a"));
  assert.equal(sw.posted.length, 0);
  assert.equal(sw.shown.length, 1);
  assert.ok(!JSON.stringify(sw.shown[0]).match(/Juan|125|sale-1/));
});

test("service worker treats legacy payloads without recipient as unverified", async () => {
  const sw = swHarness({ owner: { userId: "A", businessId: "biz-a", at: 1 } });
  const legacy = sale("biz-a");
  delete legacy.recipientBusinessId;
  await sw.push(legacy);
  assert.equal(sw.posted.length, 0);
  assert.ok(!JSON.stringify(sw.shown[0]).match(/Juan|125/));
});

test("service worker fails closed after logout, with unreadable or missing IndexedDB", async () => {
  for (const options of [
    { owner: { userId: null, businessId: null, at: 5 } },
    { owner: undefined },
    { owner: { businessId: "biz-a" }, idb: "error" },
    { owner: { businessId: "biz-a" }, idb: "hang" },
  ]) {
    const sw = swHarness(options);
    await sw.push(sale("biz-a"));
    assert.equal(sw.posted.length, 0);
    assert.equal(sw.shown.length, 1);
    assert.ok(!JSON.stringify(sw.shown[0]).match(/Juan|125|sale-1/));
  }
});
