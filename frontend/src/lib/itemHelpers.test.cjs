const assert = require("node:assert/strict");
const test = require("node:test");
const { generateCreationId } = require("./itemHelpers.ts");

function withCrypto(cryptoValue, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: cryptoValue,
  });

  try {
    callback();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "crypto", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "crypto");
    }
  }
}

test("generateCreationId uses crypto.randomUUID when available", () => {
  withCrypto(
    { randomUUID: () => "11111111-2222-4333-8444-555555555555" },
    () => {
      assert.equal(
        generateCreationId(),
        "11111111-2222-4333-8444-555555555555",
      );
    },
  );
});

test("generateCreationId creates an RFC 4122 v4 UUID with getRandomValues", () => {
  withCrypto(
    {
      getRandomValues: (bytes) => {
        bytes.fill(0);
        return bytes;
      },
    },
    () => {
      const id = generateCreationId();
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.equal(id, "00000000-0000-4000-8000-000000000000");
    },
  );
});
