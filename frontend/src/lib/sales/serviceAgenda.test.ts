const assert = require("node:assert/strict");
const test = require("node:test");
const {
  agendaPayloadForLine,
  buildLocalScheduledAt,
  requiresServiceAgenda,
  resolveAgendaLineType,
} = require("./serviceAgenda.ts");

const catalog = [
  { id: "product-1", type: "PRODUCT" },
  { id: "service-1", type: "SERVICE" },
];

test("agenda is controlled by the operational item type, not a fiscal concept", () => {
  assert.equal(requiresServiceAgenda({ itemId: "product-1" }, catalog), false);
  assert.equal(requiresServiceAgenda({ itemId: "service-1" }, catalog), true);
  assert.equal(
    resolveAgendaLineType({ itemId: "service-1", itemType: "PRODUCT" }, catalog),
    "PRODUCT",
  );
});

test("agenda payload uses local datetime and omits schedule fields for products", () => {
  assert.equal(buildLocalScheduledAt("2026-08-15", 570), "2026-08-15T09:30:00");
  assert.deepEqual(
    agendaPayloadForLine({
      requiresAgenda: false,
      date: "2026-08-15",
      startMinute: 570,
      durationMinutes: 60,
    }),
    {},
  );
  assert.deepEqual(
    agendaPayloadForLine({
      requiresAgenda: true,
      date: "2026-08-15",
      startMinute: 570,
      durationMinutes: 60,
    }),
    { scheduledAt: "2026-08-15T09:30:00", durationMinutes: 60 },
  );
});
