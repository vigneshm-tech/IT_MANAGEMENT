import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptSecret, encryptSecret, secretHint } from "../lib/integrations/vault";

test("a secret survives the round trip and never appears in the ciphertext", () => {
  const secret = "b5f1c0de9a7e4d2f8c3b6a1d0e5f4c2b9d8a7e6f";
  const payload = encryptSecret(secret);

  assert.match(payload, /^v1\./);
  assert.ok(!payload.includes(secret));
  assert.equal(decryptSecret(payload), secret);
});

test("the same secret encrypts differently every time", () => {
  const first = encryptSecret("same-key-value");
  const second = encryptSecret("same-key-value");
  assert.notEqual(first, second);
  assert.equal(decryptSecret(first), decryptSecret(second));
});

test("a tampered payload is rejected rather than trusted", () => {
  const payload = encryptSecret("another-key");
  const parts = payload.split(".");
  parts[3] = Buffer.from("tampered-ciphertext").toString("base64url");

  assert.equal(decryptSecret(parts.join(".")), null);
  assert.equal(decryptSecret("not-a-payload"), null);
});

test("the mask keeps only the last four characters", () => {
  assert.equal(secretHint("abcdef123456"), "3456");
  assert.equal(secretHint("abc"), "");
});
