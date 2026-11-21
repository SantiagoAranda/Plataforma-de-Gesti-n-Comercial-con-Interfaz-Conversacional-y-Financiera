const assert = require("node:assert/strict");
const test = require("node:test");
const {
  canCancelReservation,
  reservationCancelPrompt,
  canCancelPublicReservation,
  reservationLink,
  cancelErrorMessage,
} = require("./reservationCancelUi.ts");

test("Ventas offers cancel only for active standalone reservations", () => {
  assert.equal(canCancelReservation({ sourceType: "RESERVATION", status: "PENDIENTE", allowedActions: ["cancel"] }), true);
  assert.equal(canCancelReservation({ sourceType: "RESERVATION", status: "CERRADO", allowedActions: ["cancel"] }), true);
  assert.equal(canCancelReservation({ sourceType: "RESERVATION", status: "CANCELADO" }), false);
  // Mirrors are listed as ORDER: they are cancelled through the sale, never here.
  assert.equal(canCancelReservation({ sourceType: "ORDER", status: "PENDIENTE", allowedActions: ["cancel"] }), false);
});

test("confirmed reservation prompt warns about inventory and accounting reversal", () => {
  assert.match(reservationCancelPrompt({ sourceType: "RESERVATION", status: "CERRADO", allowedActions: ["cancel"] }), /inventario y los registros contables/);
  assert.doesNotMatch(reservationCancelPrompt({ sourceType: "RESERVATION", status: "PENDIENTE", allowedActions: ["cancel"] }), /contables/);
});

test("public page shows cancel only for PENDING with the booking token", () => {
  assert.equal(canCancelPublicReservation("PENDING", "tok"), true);
  assert.equal(canCancelPublicReservation("PENDING", null), false);
  assert.equal(canCancelPublicReservation("CONFIRMED", "tok"), false);
  assert.equal(canCancelPublicReservation("CANCELLED", "tok"), false);
});

test("links carry the token only when known (legacy links stay view-only)", () => {
  assert.equal(reservationLink("https://x.co", "r1", "a b"), "https://x.co/reserva/r1?t=a%20b");
  assert.equal(reservationLink("https://x.co", "r1", null), "https://x.co/reserva/r1");
});

test("backend Spanish messages are shown; generic fallback otherwise", () => {
  assert.equal(cancelErrorMessage({ message: "Esta reserva ya está confirmada." }, "x"), "Esta reserva ya está confirmada.");
  assert.equal(cancelErrorMessage({ message: ["primero"] }, "x"), "primero");
  assert.equal(cancelErrorMessage(null, "fallback"), "fallback");
  assert.equal(cancelErrorMessage({ message: "  " }, "fallback"), "fallback");
});

test("completed and missing capabilities do not allow cancellation", () => {
 assert.equal(canCancelReservation({sourceType:"RESERVATION", status:"FINALIZADA", allowedActions:[]}),false);
 assert.equal(canCancelReservation({sourceType:"RESERVATION", status:"PENDIENTE"}),false);
});

test("public page follows the server's canCancel (policy 2) and still needs the token", () => {
  assert.equal(canCancelPublicReservation("CONFIRMED", "tok", true), true);
  assert.equal(canCancelPublicReservation("CONFIRMED", null, true), false);
  assert.equal(canCancelPublicReservation("PENDING", "tok", false), false);
});

test("policy 2 confirmed bookings have nothing to reverse", () => {
  assert.doesNotMatch(reservationCancelPrompt({ sourceType: "RESERVATION", status: "CONFIRMADO", commercialPolicyVersion: 2 }), /contables/);
  assert.match(reservationCancelPrompt({ sourceType: "RESERVATION", status: "CONFIRMADO", commercialPolicyVersion: 1 }), /contables/);
});
