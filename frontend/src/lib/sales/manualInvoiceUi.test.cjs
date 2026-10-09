const assert = require("node:assert/strict");
const test = require("node:test");
const { canGenerateElectronicInvoice, firstInvoiceConfirmationStep, continueInvoiceConfirmation, canSubmitInvoiceStep, cancelInvoiceConfirmation } = require("./manualInvoiceUi.ts");

const sale = {
  id: "sale-1", sourceType: "ORDER", status: "CERRADO",
  accountingPostedAt: "2026-09-30T00:00:00Z", inventoryPostedAt: "2026-09-30T00:00:00Z",
  requiresLegacyInvoiceWarning: false,
};
const capability = {
  documentsLoaded: true, factusEnabled: true, factusConfigured: true,
  taxSettingsEnabled: true, responsibility52: true,
};

test("a finalized real order can offer manual invoice only after documents loaded", () => {
  assert.equal(canGenerateElectronicInvoice(sale, false, capability, false), true);
  assert.equal(canGenerateElectronicInvoice(sale, true, capability, false), false);
  assert.equal(canGenerateElectronicInvoice(sale, false, { ...capability, documentsLoaded: false }, false), false);
  assert.equal(canGenerateElectronicInvoice(sale, false, capability, true), false);
  assert.equal(canGenerateElectronicInvoice({ ...sale, sourceType: "RESERVATION" }, false, capability, false), false);
  assert.equal(canGenerateElectronicInvoice({ ...sale, accountingPostedAt: null }, false, capability, false), false);
  assert.equal(canGenerateElectronicInvoice(sale, false, { ...capability, factusEnabled: false }, false), false);
  assert.equal(canGenerateElectronicInvoice(sale, false, { ...capability, responsibility52: false }, false), false);
});

test("legacy requires warning then a separate confirmation; versioned sale starts at confirmation", () => {
  assert.equal(firstInvoiceConfirmationStep({ ...sale, requiresLegacyInvoiceWarning: true }), "warning");
  assert.equal(continueInvoiceConfirmation("warning"), "confirm");
  assert.equal(firstInvoiceConfirmationStep(sale), "confirm");
  assert.equal(canSubmitInvoiceStep("warning"), false);
  assert.equal(canSubmitInvoiceStep("confirm"), true);
  assert.equal(canSubmitInvoiceStep("sending"), false);
  assert.equal(cancelInvoiceConfirmation(), null);
  assert.equal(canSubmitInvoiceStep(cancelInvoiceConfirmation()), false);
});
