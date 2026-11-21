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
const { bookingAttemptKey } = require("./bookingAttempt.ts");

test("a retry of the same booking attempt reuses its key; a changed payload gets a new one", () => {
  const ref = { current: null };
  const payload = { itemId: "s", date: "2026-11-20", startMinute: 600 };
  const first = bookingAttemptKey(ref, payload);
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.equal(bookingAttemptKey(ref, { ...payload }), first);
  const changed = bookingAttemptKey(ref, { ...payload, startMinute: 660 });
  assert.notEqual(changed, first);
  ref.current = null; // discarded after success or a decided 409
  assert.notEqual(bookingAttemptKey(ref, payload), first);
});
