const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizePublicTaxPreview } = require("./publicPreview.ts");

test("normalizes Decimal strings from the public tax preview response", () => {
  const preview = normalizePublicTaxPreview({
    subtotal: "100000",
    vatTotal: "19000",
    impoconsumoTotal: "0",
    reteFuenteTotal: "0",
    reteIvaTotal: "2850",
    reteIcaTotal: "0",
    autoRetencionTotal: "0",
    netReceived: "116150",
    taxLines: [],
    uvtValue: "52374",
  });

  assert.deepEqual(
    {
      vatTotal: preview?.vatTotal,
      reteFuenteTotal: preview?.reteFuenteTotal,
      reteIvaTotal: preview?.reteIvaTotal,
      reteIcaTotal: preview?.reteIcaTotal,
      netReceived: preview?.netReceived,
    },
    {
      vatTotal: 19000,
      reteFuenteTotal: 0,
      reteIvaTotal: 2850,
      reteIcaTotal: 0,
      netReceived: 116150,
    },
  );
});

test("rejects an incomplete public tax preview instead of rendering it as zero", () => {
  assert.equal(normalizePublicTaxPreview({ vatTotal: "19000" }), null);
});
