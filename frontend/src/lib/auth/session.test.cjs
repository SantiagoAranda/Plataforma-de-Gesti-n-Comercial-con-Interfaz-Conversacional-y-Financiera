/* eslint-disable @typescript-eslint/no-require-imports -- Node test harness using the existing CommonJS test convention. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function harness(memory = new Map()) {
  const events = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  const sandbox = {
    console,
    Headers,
    Response,
    FormData,
    Date,
    atob,
    process: { env: {} },
    localStorage: storage,
    sessionStorage: { ...storage },
    window: {
      location: { pathname: "/home", href: "" },
      addEventListener: (event, callback) => events.set(event, callback),
    },
    fetch: async () => {
      throw new Error("Unexpected fetch");
    },
  };
  const modules = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (!path.extname(filename)) filename += ".ts";
    if (modules.has(filename)) return modules.get(filename).exports;
    const loadedModule = { exports: {} };
    modules.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    vm.runInNewContext(
      `(function(require,module,exports){${source}\n})`,
      sandbox,
    )(
      (name) => load(path.resolve(path.dirname(filename), name)),
      loadedModule,
      loadedModule.exports,
    );
    return loadedModule.exports;
  }
  const session = load(path.join(__dirname, "session.ts"));
  const cache = load(path.join(__dirname, "../cache.ts"));
  const api = load(path.join(__dirname, "../api.ts"));
  const registration = load(path.join(__dirname, "registration.ts"));
  const token = (id, business = id) =>
    `header.${Buffer.from(JSON.stringify({ sub: id, businessId: business, role: "BUSINESS" })).toString("base64url")}.fixture`;
  return { sandbox, storage, events, session, cache, api, registration, token };
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("independent tab contexts discard A caches and late 401 after another tab signs in B", async () => {
  const sharedStorage = new Map();
  const first = harness(sharedStorage);
  const second = harness(sharedStorage);
  first.session.establishSession({ accessToken: first.token("A"), businessName: "A" });
  second.session.getSessionContext();
  const keys = ["home:sales", "home:movements", "home:businessActivity", "mi-negocio:items:ACTIVE", "consumption-history:recipe:item-a"];
  for (const key of keys) await second.cache.getCached(key, 60000, async () => ({ owner: "A" }));
  const delayed = deferred();
  second.sandbox.fetch = () => delayed.promise;
  const pending = second.api.api("/sales");
  const rejected = assert.rejects(pending, { name: "StaleSessionError" });
  first.session.clearSession();
  first.session.establishSession({ accessToken: first.token("B"), businessName: "B" });
  second.events.get("storage")({ key: "accessToken" });
  assert.equal(second.session.getSessionContext().userId, "B");
  assert.equal(second.storage.getItem("businessName"), "B");
  for (const key of keys) assert.equal(second.cache.getInstantCache(key, 60000), null);
  delayed.resolve(new Response("{}", { status: 401 }));
  await rejected;
  assert.equal(first.session.getSessionContext().userId, "B");
  assert.equal(second.session.getSessionContext().userId, "B");
  assert.equal(second.sandbox.window.location.href, "");
});

test("historical token survives initialization; unowned profile is discarded", () => {
  const h = harness();
  const token = h.token("historical");
  h.storage.setItem("accessToken", token);
  h.storage.setItem("businessName", "unknown owner");
  assert.equal(h.session.getSessionContext().token, token);
  assert.equal(h.storage.getItem("accessToken"), token);
  assert.equal(h.storage.getItem("businessName"), null);
  assert.equal(JSON.parse(h.storage.getItem("user")).businessId, "historical");
});

test("A logout B cannot reuse data, pending requests or profile from A", async () => {
  const h = harness();
  h.session.establishSession({ accessToken: h.token("A"), businessName: "A" });
  await h.cache.getCached("sales", 60000, async () => ["A"]);
  const late = deferred();
  const old = h.cache.getCached("items", 60000, () => late.promise);
  const rejection = assert.rejects(old, { name: "StaleSessionError" });
  await Promise.resolve();
  h.session.clearSession();
  h.session.establishSession({ accessToken: h.token("B"), businessName: "B" });
  assert.equal(h.cache.getInstantCache("sales", 60000), null);
  await h.cache.getCached("items", 60000, async () => ["B"]);
  late.resolve(["A"]);
  await rejection;
  assert.equal(h.cache.getInstantCache("items", 60000)[0], "B");
  assert.equal(h.storage.getItem("businessName"), "B");
});

test("deduplicates same-session requests and invalidated work cannot overwrite replacements", async () => {
  const h = harness();
  h.session.establishSession({ accessToken: h.token("A") });
  const first = deferred();
  let calls = 0;
  const a = h.cache.getCached("sales", 60000, () => {
    calls++;
    return first.promise;
  });
  const b = h.cache.getCached("sales", 60000, () => {
    calls++;
    return first.promise;
  });
  const rejected = [
    assert.rejects(a, { name: "StaleSessionError" }),
    assert.rejects(b, { name: "StaleSessionError" }),
  ];
  await Promise.resolve();
  assert.equal(calls, 1);
  h.cache.invalidateCache("sales");
  const replacement = deferred();
  const c = h.cache.getCached("sales", 60000, () => replacement.promise);
  first.resolve("old");
  await Promise.all(rejected);
  const d = h.cache.getCached("sales", 60000, () => {
    throw new Error("old promise removed new inflight");
  });
  replacement.resolve("new");
  assert.equal(await c, "new");
  assert.equal(await d, "new");
  assert.equal(
    await h.cache.getCached("sales", 60000, () => {
      throw new Error("TTL lost");
    }),
    "new",
  );
});

test("late 401 does not sign out the new user and storage event changes scope", async () => {
  const h = harness();
  h.session.establishSession({ accessToken: h.token("A") });
  const response = deferred();
  h.sandbox.fetch = () => response.promise;
  const request = h.api.api("/sales");
  const rejected = assert.rejects(request, { name: "StaleSessionError" });
  h.storage.setItem("accessToken", h.token("B"));
  h.events.get("storage")({ key: "accessToken" });
  response.resolve(new Response("{}", { status: 401 }));
  await rejected;
  assert.equal(h.session.getSessionContext().userId, "B");
  assert.equal(h.sandbox.window.location.href, "");
});

test("same business different user and same user new session get isolated scopes", () => {
  const h = harness();
  const a = h.session.establishSession({ accessToken: h.token("A", "shared") });
  const b = h.session.establishSession({ accessToken: h.token("B", "shared") });
  const next = h.session.establishSession({
    accessToken: h.token("B", "shared"),
  });
  assert.notEqual(a.key, b.key);
  assert.notEqual(b.key, next.key);
});

const input = {
  name: "Fixture",
  email: "fixture@example.test",
  password: "fictitious",
  phoneWhatsapp: "000",
};
test("registration handles committed account without JWT and does not retry uncertain requests", async () => {
  const h = harness();
  let calls = 0;
  h.sandbox.fetch = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        accountCreated: true,
        code: "ACCOUNT_CREATED_LOGIN_REQUIRED",
      }),
      { status: 201 },
    );
  };
  assert.equal(await h.registration.registerAccount(input), "login-required");
  assert.equal(h.storage.getItem("accessToken"), null);
  h.sandbox.fetch = async () => {
    calls++;
    throw new Error("connection lost");
  };
  assert.equal(await h.registration.registerAccount(input), "unconfirmed");
  assert.equal(calls, 2);
});

test("registration recognizes success even when browser storage fails", async () => {
  const h = harness();
  h.session.getSessionContext();
  h.sandbox.fetch = async () =>
    new Response(JSON.stringify({ accessToken: h.token("created") }), {
      status: 201,
    });
  h.storage.setItem = () => {
    throw new Error("quota");
  };
  assert.equal(await h.registration.registerAccount(input), "login-required");
});

test("registration keeps 429 separate from unknown outcomes and stores no password", async () => {
  const h = harness();
  h.sandbox.fetch = async () =>
    new Response(
      JSON.stringify({
        code: "AUTH_RATE_LIMITED",
        message: "Esperá",
        retryAfterSeconds: 60,
      }),
      { status: 429 },
    );
  await assert.rejects(
    h.registration.registerAccount(input),
    (error) => error.status === 429 && error.details.retryAfterSeconds === 60,
  );
  h.sandbox.fetch = async () =>
    new Response(JSON.stringify({ accessToken: h.token("new") }), {
      status: 201,
    });
  assert.equal(await h.registration.registerAccount(input), "signed-in");
  assert.equal(h.session.getSessionContext().userId, "new");
  assert.equal(h.storage.getItem("password"), null);
});


test('historical access survives metadata storage quota errors', () => {
  const h = harness();
  const token = h.token('historical');
  h.storage.setItem('accessToken', token);
  h.storage.setItem = () => { throw new Error('quota'); };
  assert.equal(h.session.getSessionContext().token, token);
  assert.equal(h.storage.getItem('accessToken'), token);
});

test('expired cache refetches while a fresh entry preserves the TTL', async () => {
  const h = harness();
  h.session.establishSession({ accessToken: h.token('A') });
  await h.cache.getCached('sales', 60000, async () => 'fresh');
  assert.equal(await h.cache.getCached('sales', 60000, async () => 'unexpected'), 'fresh');
  assert.equal(await h.cache.getCached('sales', -1, async () => 'reloaded'), 'reloaded');
});

test('malformed successful response and server error leave registration outcome unconfirmed', async () => {
  const h = harness();
  h.sandbox.fetch = async () => new Response('broken response', { status: 201 });
  assert.equal(await h.registration.registerAccount(input), 'unconfirmed');
  h.sandbox.fetch = async () => new Response('{}', { status: 500 });
  assert.equal(await h.registration.registerAccount(input), 'unconfirmed');
});

test('late registration response cannot replace a newer session', async () => {
  const h = harness();
  const response = deferred(); h.sandbox.fetch = () => response.promise;
  const pending = h.registration.registerAccount(input);
  const rejected = assert.rejects(pending, { name: 'StaleSessionError' });
  h.session.establishSession({ accessToken: h.token('newer') });
  response.resolve(new Response(JSON.stringify({ accessToken: h.token('old') }), { status: 201 }));
  await rejected;
  assert.equal(h.session.getSessionContext().userId, 'newer');
});
