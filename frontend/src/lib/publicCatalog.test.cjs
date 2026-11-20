const { test } = require("node:test");
const assert = require("node:assert/strict");
const { publicPrice, publicPriceLabel, publicLinePrice, publicCartTotal, consultationUrl } = require("./publicCatalog.ts");

test("null is a consultation, while a real zero remains numeric", () => {
  assert.equal(publicPrice(null), null);
  assert.equal(publicPrice(undefined), null);
  assert.equal(publicPrice(""), null);
  assert.equal(publicPrice("invalid"), null);
  assert.equal(publicPrice(950000, true), null);
  assert.equal(publicPrice("0"), 0);
  assert.equal(publicPrice("12.50"), 12.5);
  assert.equal(publicPriceLabel(null), "Consultar precio");
  assert.equal(publicPriceLabel(0), "$0");
});
test("mixed and hidden carts never produce a definitive total", () => {
  assert.equal(publicLinePrice(null, [500]), null);
  assert.equal(publicLinePrice(1000, [null]), null);
  assert.equal(publicLinePrice(1000, [500, 0]), 1500);
  assert.equal(publicCartTotal([{price:1000,quantity:2}]), 2000);
  assert.equal(publicCartTotal([{price:null,quantity:2}]), null);
  assert.equal(publicCartTotal([{price:1000,quantity:2},{price:null,quantity:1}]), null);
});
test("WhatsApp includes the business and selection, never amounts or a total", () => {
  const url = consultationUrl("+57 300 111 2233", "Mi negocio", [{name:"Mueble",quantity:2,price:950000,selectedOptionNames:["Roble"],excludedOptionalIngredientNames:["Barniz"]}]);
  assert.ok(url.startsWith("https://wa.me/573001112233?text="));
  const message = new URL(url).searchParams.get("text");
  for (const expected of ["Mi negocio", "2 × Mueble", "Roble", "Barniz", "precios pendientes"]) assert.ok(message.includes(expected));
  assert.ok(!message.includes("950000"));
  assert.ok(!message.includes("Total"));
  assert.equal(consultationUrl("123", "Demo", [{name:"A",quantity:1}]), null);
  assert.equal(consultationUrl("573001112233", "Demo", []), null);
});
