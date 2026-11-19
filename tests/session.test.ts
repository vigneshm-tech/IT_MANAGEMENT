import test from "node:test";
import assert from "node:assert/strict";
import { decodeSession, encodeSession } from "../lib/auth/token";

const baseUser = {
  id: "u-it-manager",
  email: "it.manager@tasktornado.dev",
  name: "Meera Raghavan",
  role: "it_manager" as const,
  title: "IT Manager",
  provider: "demo" as const,
};

test("a signed session round-trips", () => {
  const token = encodeSession(baseUser);
  const decoded = decodeSession(token);
  assert.ok(decoded);
  assert.equal(decoded.email, baseUser.email);
  assert.equal(decoded.role, "it_manager");
  assert.equal(decoded.provider, "demo");
  assert.ok(decoded.expiresAt > decoded.issuedAt);
});

test("tampered payloads are rejected", () => {
  const token = encodeSession(baseUser);
  const [body, signature] = token.split(".");
  const payload = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
  payload.role = "management";
  const forgedBody = Buffer.from(JSON.stringify(payload)).toString("base64url");

  assert.equal(decodeSession(`${forgedBody}.${signature}`), null);
});

test("garbage, empty and truncated tokens are rejected", () => {
  assert.equal(decodeSession(""), null);
  assert.equal(decodeSession("not-a-token"), null);
  assert.equal(decodeSession("a.b.c"), null);
  assert.equal(decodeSession(undefined), null);
});

test("expired sessions are rejected", () => {
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const token = encodeSession(baseUser, twoDaysAgo);
  assert.equal(decodeSession(token), null);
});

test("unknown roles are rejected even when correctly signed", () => {
  const token = encodeSession({ ...baseUser, role: "root" as never });
  assert.equal(decodeSession(token), null);
});
