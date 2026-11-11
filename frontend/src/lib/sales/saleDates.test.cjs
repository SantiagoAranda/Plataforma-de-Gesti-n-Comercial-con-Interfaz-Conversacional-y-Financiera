/* eslint-disable @typescript-eslint/no-require-imports -- Node-based unit test. */
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) request = path.join(ROOT, request.slice(2));
  return originalResolve.call(this, request, ...rest);
};
require.extensions[".ts"] = (module, filename) => {
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  module._compile(source, filename);
};
const { saleDayKey } = require("./saleDates.ts");

// Sale recorded 09/11 at 20:30 Bogotá (01:30 UTC on the 10th) for a service on 11/11.
const sale = { createdAt: "2026-11-10T01:30:00.000Z", scheduledAt: "2026-11-11T09:00:00" };

test("REGISTRO uses the Bogotá business day of createdAt, not the UTC day", () => {
  assert.equal(saleDayKey(sale, "REGISTRO"), "2026-11-09");
});

test("TURNO uses the service day, so 09/11 sales for 11/11 appear on 11/11", () => {
  assert.equal(saleDayKey(sale, "TURNO"), "2026-11-11");
});

test("sales without an appointment have no TURNO day; bad dates never throw", () => {
  assert.equal(saleDayKey({ createdAt: sale.createdAt }, "TURNO"), null);
  assert.equal(saleDayKey({ createdAt: "no-date" }, "REGISTRO"), null);
});

test("agenda shows a confirmed (CERRADO) appointment as CONFIRMADO, never COMPLETADO", () => {
  const { getAgendaEventsForDate } = require("../agenda/events.ts");
  const base = { customerName: "Ana", items: [{ name: "Corte" }], total: 1000, createdAt: sale.createdAt };
  const events = getAgendaEventsForDate([
    { ...base, id: "a", status: "CERRADO", scheduledAt: "2026-11-11T09:00:00" },
    { ...base, id: "b", status: "PENDIENTE", scheduledAt: "2026-11-11T10:00:00" },
    { ...base, id: "c", status: "CERRADO", scheduledAt: "2026-11-12T09:00:00" },
  ], new Date(2026, 10, 11));
  assert.deepEqual(events.map((e) => [e.id, e.status]), [["a", "CONFIRMADO"], ["b", "PENDIENTE"]]);
});
