import assert from "node:assert/strict";
import { test } from "node:test";
import {
  consentScopes,
  createAuthorizationCode,
  consumeAuthorizationCode,
  getClient,
  hashOAuthSecret,
  issueTokens,
  liveScopes,
  pkceChallenge,
  redirectUriError,
  registerClient,
  revokeConnectedApp,
  rotateRefreshToken,
  verifyAccessToken,
  verifyPkce,
} from "../lib/mcp/oauth";
import { authenticateRequest } from "../lib/api/auth";
import { resetApiRateLimit } from "../lib/api/rate-limit";

const VERIFIER = "a".repeat(64);
const CHALLENGE = pkceChallenge(VERIFIER);

async function connect(clientName = "Test client") {
  const registered = await registerClient({
    clientName,
    redirectUris: ["https://client.example/callback"],
    confidential: false,
  });
  assert.ok("client" in registered);
  const client = registered.client;

  const code = await createAuthorizationCode({
    clientId: client.clientId,
    userId: "u-it-manager",
    redirectUri: "https://client.example/callback",
    codeChallenge: CHALLENGE,
    scopes: ["tickets:read", "kb:read"],
  });

  const consumed = await consumeAuthorizationCode(code);
  assert.ok(consumed);

  const grant = await issueTokens({
    userId: consumed.userId,
    clientId: client.clientId,
    clientName: client.name,
    scopes: consumed.scopes,
  });

  return { client, code, grant };
}

/* -------------------------------------------------------------------------- */
/*  Registration                                                              */
/* -------------------------------------------------------------------------- */

test("redirect URIs are https, or loopback for a desktop client", () => {
  assert.equal(redirectUriError("https://claude.ai/api/mcp/auth_callback"), null);
  assert.equal(redirectUriError("http://localhost:33418/callback"), null);
  assert.equal(redirectUriError("http://127.0.0.1:6274/callback"), null);

  assert.ok(redirectUriError("http://evil.example/callback"), "plain http is refused off loopback");
  assert.ok(redirectUriError("https://client.example/cb#frag"), "a fragment is refused");
  assert.ok(redirectUriError("not a url"));
});

test("registration refuses anything it could be tricked into redirecting to", async () => {
  const none = await registerClient({ clientName: "x", redirectUris: [], confidential: false });
  assert.ok("error" in none);

  const insecure = await registerClient({
    clientName: "x",
    redirectUris: ["http://evil.example/cb"],
    confidential: false,
  });
  assert.ok("error" in insecure);

  const ok = await registerClient({
    clientName: "Claude",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    confidential: false,
  });
  assert.ok("client" in ok);
  if ("client" in ok) {
    assert.equal(ok.client.confidential, false);
    assert.equal(ok.client.clientSecret, undefined, "a public client gets no secret");
    assert.notEqual(await getClient(ok.client.clientId), null);
  }

  const confidential = await registerClient({
    clientName: "Server-side app",
    redirectUris: ["https://app.example/cb"],
    confidential: true,
  });
  assert.ok("client" in confidential);
  if ("client" in confidential) {
    assert.ok(confidential.client.clientSecret?.startsWith("ttc_"));
    assert.equal(confidential.client.confidential, true);
  }
});

/* -------------------------------------------------------------------------- */
/*  PKCE                                                                      */
/* -------------------------------------------------------------------------- */

test("PKCE compares the verifier to the challenge it published", () => {
  assert.equal(verifyPkce(VERIFIER, CHALLENGE), true);
  assert.equal(verifyPkce("b".repeat(64), CHALLENGE), false);
  assert.equal(verifyPkce(VERIFIER, CHALLENGE.toUpperCase()), false);
});

/* -------------------------------------------------------------------------- */
/*  Scopes                                                                    */
/* -------------------------------------------------------------------------- */

test("consent defaults to everything the role holds, and never exceeds it", () => {
  const everything = consentScopes("", "l2_support_engineer");
  assert.ok("scopes" in everything);
  if ("scopes" in everything) {
    assert.ok(everything.scopes.includes("tickets:read"));
    assert.equal(everything.scopes.includes("servers:read"), false);
  }

  const narrowed = consentScopes("tickets:read servers:read", "l2_support_engineer");
  assert.ok("scopes" in narrowed);
  if ("scopes" in narrowed) {
    assert.deepEqual(narrowed.scopes, ["tickets:read"], "servers:read is beyond the role");
  }

  const unknown = consentScopes("tickets:everything", "super_admin");
  assert.ok("error" in unknown);
});

test("a token's scopes are re-checked against today's role", () => {
  assert.deepEqual(liveScopes(["tickets:read", "servers:read"], "l2_support_engineer"), [
    "tickets:read",
  ]);
  assert.deepEqual(liveScopes(["tickets:read", "servers:read"], "it_manager").sort(), [
    "servers:read",
    "tickets:read",
  ]);
});

/* -------------------------------------------------------------------------- */
/*  Codes and tokens                                                          */
/* -------------------------------------------------------------------------- */

test("an authorisation code is single use and expires on its own", async () => {
  const registered = await registerClient({
    clientName: "single use",
    redirectUris: ["https://client.example/cb"],
    confidential: false,
  });
  assert.ok("client" in registered);
  if (!("client" in registered)) return;

  const code = await createAuthorizationCode({
    clientId: registered.client.clientId,
    userId: "u-it-manager",
    redirectUri: "https://client.example/cb",
    codeChallenge: CHALLENGE,
    scopes: ["tickets:read"],
  });

  const first = await consumeAuthorizationCode(code);
  assert.equal(first?.userId, "u-it-manager");
  assert.equal(first?.redirectUri, "https://client.example/cb");

  assert.equal(await consumeAuthorizationCode(code), null, "the second exchange fails");
  assert.equal(await consumeAuthorizationCode("tta_" + "z".repeat(32)), null);
});

test("an access token authenticates as the person who consented", async () => {
  resetApiRateLimit();
  const { grant, client } = await connect("Claude");

  const verified = await verifyAccessToken(grant.accessToken);
  assert.equal(verified.ok, true);
  if (!verified.ok) return;
  assert.equal(verified.token.userId, "u-it-manager");
  assert.equal(verified.token.clientName, client.name);

  const result = await authenticateRequest(
    new Request("https://tasktornado.test/api/v1/me", {
      headers: { authorization: `Bearer ${grant.accessToken}` },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.caller.userId, "u-it-manager");
  assert.equal(result.caller.keyName, "Claude", "the caller is named after the app, not a key");
  assert.deepEqual(result.caller.scopes.sort(), ["kb:read", "tickets:read"]);
});

test("a revoked connection is refused, and the refresh token with it", async () => {
  const { grant } = await connect("Revoked app");
  const verified = await verifyAccessToken(grant.accessToken);
  assert.ok(verified.ok);
  if (!verified.ok) return;

  assert.equal(await revokeConnectedApp("u-dev-manager", verified.token.tokenId), false);
  assert.equal(await revokeConnectedApp("u-it-manager", verified.token.tokenId), true);

  assert.deepEqual(await verifyAccessToken(grant.accessToken), { ok: false, reason: "revoked" });

  const rotated = await rotateRefreshToken(grant.refreshToken);
  assert.deepEqual(rotated, { ok: false, reason: "revoked" });
});

test("refreshing rotates the pair rather than reusing it", async () => {
  const { grant } = await connect("Refreshing app");

  const rotated = await rotateRefreshToken(grant.refreshToken);
  assert.equal(rotated.ok, true);
  if (!rotated.ok) return;

  assert.notEqual(rotated.grant.refreshToken, grant.refreshToken);
  assert.notEqual(rotated.grant.accessToken, grant.accessToken);

  const reused = await rotateRefreshToken(grant.refreshToken);
  assert.deepEqual(reused, { ok: false, reason: "revoked" }, "an old refresh token cannot be replayed");

  const fresh = await verifyAccessToken(rotated.grant.accessToken);
  assert.equal(fresh.ok, true);
});

test("a refresh token is not an access token", async () => {
  const { grant } = await connect("Kinds");
  assert.deepEqual(await verifyAccessToken(grant.refreshToken), { ok: false, reason: "wrong_kind" });
  assert.deepEqual(await rotateRefreshToken(grant.accessToken), { ok: false, reason: "wrong_kind" });
  assert.deepEqual(await verifyAccessToken("ttm_not-a-real-token"), { ok: false, reason: "unknown" });
});

test("the 401 tells an MCP client where the authorisation server is", async () => {
  const result = await authenticateRequest(new Request("https://tasktornado.test/api/mcp"));
  assert.equal(result.ok, false);
  if (result.ok) return;

  const header = result.response.headers.get("www-authenticate") ?? "";
  assert.match(header, /^Bearer /);
  assert.match(header, /resource_metadata="https:\/\/tasktornado\.test\/\.well-known\/oauth-protected-resource\/api\/mcp"/);

  const body = (await result.response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "missing_key");
});

test("stored tokens are hashed, never kept in the clear", async () => {
  const { grant } = await connect("Hashed");
  assert.ok(grant.accessToken.startsWith("ttm_"));
  assert.ok(grant.refreshToken.startsWith("ttr_"));
  assert.equal(grant.expiresIn, 3600);
  assert.match(hashOAuthSecret(grant.accessToken), /^[0-9a-f]{64}$/);
  assert.notEqual(hashOAuthSecret(grant.accessToken), grant.accessToken);
});
