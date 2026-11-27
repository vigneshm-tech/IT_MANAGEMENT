import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authenticateApiKey,
  createApiKey,
  generateKeySecret,
  hashApiKey,
  keyPrefixOf,
  listApiKeys,
  looksLikeApiKey,
  revokeApiKey,
} from "../lib/api/keys";
import {
  authenticateRequest,
  callerScopes,
  credentialFrom,
  requireScope,
  type ApiCaller,
} from "../lib/api/auth";
import {
  API_SCOPES,
  apiKeyNameError,
  effectiveScopes,
  grantableScopes,
  resolveScopes,
  scopeLabel,
} from "../lib/api/scopes";
import { API_ENDPOINTS } from "../lib/api/endpoints";
import { resetApiRateLimit } from "../lib/api/rate-limit";
import { handleMcpMessage, MCP_PROTOCOL_VERSION, MCP_TOOLS } from "../lib/mcp/server";

/* -------------------------------------------------------------------------- */
/*  A key is a credential, not a string                                       */
/* -------------------------------------------------------------------------- */

test("a generated key is prefixed, long enough, and different every time", () => {
  const seen = new Set<string>();
  for (let index = 0; index < 50; index += 1) {
    const secret = generateKeySecret();
    assert.ok(secret.startsWith("tt_"), "every key carries the tt_ prefix");
    assert.match(secret.slice(3), /^[A-Za-z0-9_-]{32}$/);
    assert.ok(looksLikeApiKey(secret));
    assert.equal(seen.has(secret), false, "no two generated keys collide");
    seen.add(secret);
  }
});

test("the prefix identifies the row and is not the credential", () => {
  const secret = generateKeySecret();
  const prefix = keyPrefixOf(secret);
  assert.equal(prefix.length, 11);
  assert.notEqual(prefix, secret);
  assert.ok(secret.startsWith(prefix));
  // A truncated prefix must not be accepted where a key is expected.
  assert.equal(looksLikeApiKey(prefix), false);
});

test("the stored hash is keyed, stable, and never the secret", () => {
  const secret = generateKeySecret();
  const first = hashApiKey(secret, "pepper-one");
  assert.equal(first, hashApiKey(secret, "pepper-one"));
  assert.notEqual(first, hashApiKey(secret, "pepper-two"), "a different pepper yields a different hash");
  assert.notEqual(first, secret);
  assert.match(first, /^[0-9a-f]{64}$/);
});

/* -------------------------------------------------------------------------- */
/*  Scopes: a ceiling, never a promotion                                      */
/* -------------------------------------------------------------------------- */

test("only scopes the role can already exercise are offered", () => {
  const engineer = grantableScopes("l2_support_engineer");
  assert.ok(engineer.includes("tickets:read"));
  assert.ok(engineer.includes("kb:read"));
  assert.equal(engineer.includes("servers:read"), false, "an L2 engineer cannot read the inventory");

  const manager = grantableScopes("it_manager");
  assert.ok(manager.includes("servers:read"));
  assert.ok(manager.includes("approvals:read"));
});

test("requesting a scope the role cannot grant is refused, not silently dropped", () => {
  const refused = resolveScopes(["tickets:read", "servers:read"], "l2_support_engineer");
  assert.ok("error" in refused);
  if ("error" in refused) assert.ok(refused.error.includes("servers:read"));

  const unknown = resolveScopes(["tickets:everything"], "super_admin");
  assert.ok("error" in unknown);

  const empty = resolveScopes([], "super_admin");
  assert.ok("error" in empty, "a key with no scopes can do nothing; refuse it up front");

  const granted = resolveScopes(["kb:read", "tickets:read", "kb:read"], "l2_support_engineer");
  assert.deepEqual(
    "scopes" in granted ? granted.scopes : [],
    ["tickets:read", "kb:read"],
    "deduped, in the catalogue's order",
  );
});

test("effective scopes are the intersection of the key and today's role", () => {
  const issued = ["tickets:read", "servers:read"] as const;
  assert.deepEqual(
    effectiveScopes([...issued], "it_manager").sort(),
    ["servers:read", "tickets:read"],
  );
  assert.deepEqual(
    effectiveScopes([...issued], "l2_support_engineer"),
    ["tickets:read"],
    "a demotion narrows the key with the person",
  );
});

test("every scope has a label and every REST endpoint names a real scope", () => {
  const known = new Set(API_SCOPES.map((scope) => scope.id));
  for (const scope of API_SCOPES) {
    assert.ok(scopeLabel(scope.id).length > 0);
    assert.ok(scope.summary.length > 0);
  }
  for (const endpoint of API_ENDPOINTS) {
    if (endpoint.scope) assert.ok(known.has(endpoint.scope), `${endpoint.path} → ${endpoint.scope}`);
  }
});

test("key names are checked before anything is written", () => {
  assert.ok(apiKeyNameError(""));
  assert.ok(apiKeyNameError("a"));
  assert.ok(apiKeyNameError("x".repeat(61)));
  assert.equal(apiKeyNameError("Helpdesk chat bridge"), null);
});

/* -------------------------------------------------------------------------- */
/*  Issue, authenticate, revoke                                               */
/* -------------------------------------------------------------------------- */

test("a key authenticates as its owner, and stops when revoked", async () => {
  resetApiRateLimit();
  const userId = "u-it-manager";
  const issued = await createApiKey(userId, {
    name: "token test",
    scopes: ["tickets:read"],
    expiresAt: null,
  });

  const ok = await authenticateApiKey(issued.secret);
  assert.equal(ok.ok, true);
  assert.equal(ok.ok ? ok.key.id : "", issued.key.id);
  assert.equal(ok.ok ? ok.key.userId : "", userId);

  // The secret is not recoverable from the listing.
  const listed = await listApiKeys(userId);
  const listedKey = listed.find((key) => key.id === issued.key.id);
  assert.ok(listedKey);
  assert.equal(listedKey.prefix, issued.key.prefix);
  assert.equal("secret" in (listedKey as Record<string, unknown>), false);

  // A sibling secret sharing the prefix is still rejected: the hash decides.
  const forged = `${issued.key.prefix}${"A".repeat(32)}`;
  const forgedResult = await authenticateApiKey(forged);
  assert.equal(forgedResult.ok, false);

  const wrong = await authenticateApiKey(generateKeySecret());
  assert.deepEqual(wrong, { ok: false, reason: "unknown" });

  assert.equal(
    await revokeApiKey("u-dev-manager", issued.key.id),
    false,
    "another user cannot revoke it",
  );
  assert.equal(await revokeApiKey(userId, issued.key.id), true);
  assert.deepEqual(await authenticateApiKey(issued.secret), { ok: false, reason: "revoked" });
});

test("an expired key is refused with its own reason", async () => {
  const issued = await createApiKey("u-l2-engineer", {
    name: "expired by design",
    scopes: ["kb:read"],
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  assert.deepEqual(await authenticateApiKey(issued.secret), { ok: false, reason: "expired" });
});

/* -------------------------------------------------------------------------- */
/*  The HTTP door                                                             */
/* -------------------------------------------------------------------------- */

test("a request without a key is refused before any work happens", async () => {
  resetApiRateLimit();
  const result = await authenticateRequest(new Request("https://example.test/api/v1/tickets"));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 401);
    const body = (await result.response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "missing_key");
  }
});

test("the credential is read however the client wrote the header", () => {
  const key = "tt_ABCDEFGH1234567890abcdefghijklmn";

  const cases: [Record<string, string>, string | null][] = [
    [{ authorization: `Bearer ${key}` }, key],
    [{ authorization: key }, key],
    [{ authorization: `bearer ${key}` }, key],
    [{ authorization: `Bearer  ${key}` }, key],
    [{ authorization: `Bearer Bearer ${key}` }, key],
    [{ authorization: `"${key}"` }, key],
    [{ "x-api-key": key }, key],
    [{ "x-auth-token": key }, key],
    // The app's own header names: what a connector dialog should be given when
    // it hides or overwrites `Authorization`.
    [{ "x-tasktornado-key": key }, key],
    [{ "x-tasktornado-api-key": key }, key],
    [{ "x-tasktornado-token": `Bearer ${key}` }, key],
    [{ authorization: "Basic dXNlcjpwYXNz" }, null],
    [{ authorization: "Bearer not-a-tasktornado-key" }, null],
    [{}, null],
  ];

  for (const [headers, expected] of cases) {
    const request = new Request("https://tasktornado.test/api/mcp", { headers });
    assert.equal(credentialFrom(request), expected, `${JSON.stringify(headers)}`);
  }
});

test("a bearer key becomes a caller, narrowed by the person's role", async () => {
  resetApiRateLimit();
  const issued = await createApiKey("u-l2-engineer", {
    name: "bearer test",
    // Asking for servers:read here would be refused at issue time — the point.
    scopes: ["tickets:read"],
    expiresAt: null,
  });

  const request = new Request("https://example.test/api/v1/me", {
    headers: { authorization: `Bearer ${issued.secret}` },
  });
  const result = await authenticateRequest(request);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.caller.role, "l2_support_engineer");
  assert.equal(result.caller.email, "l2.engineer@tasktornado.dev");
  assert.deepEqual(result.caller.scopes, ["tickets:read"]);
  assert.ok(result.remaining < 120);

  // x-api-key is the fallback for clients that cannot set Authorization.
  const fallback = await authenticateRequest(
    new Request("https://example.test/api/v1/me", { headers: { "x-api-key": issued.secret } }),
  );
  assert.equal(fallback.ok, true);

  const denied = requireScope(result.caller, "servers:read");
  assert.equal(denied?.status, 403);
  assert.equal(requireScope(result.caller, "tickets:read"), null);
});

test("a key narrowed by issue time cannot be widened by the role behind it", () => {
  const caller: ApiCaller = {
    keyId: "k1",
    keyName: "narrow",
    userId: "u-it-manager",
    name: "Meera Raghavan",
    email: "it.manager@tasktornado.dev",
    role: "it_manager",
    scopes: ["tickets:read"],
  };
  assert.equal(requireScope(caller, "tickets:write")?.status, 403);
  assert.equal(requireScope(caller, "tickets:read"), null);

  assert.deepEqual(
    callerScopes(
      {
        id: "k2",
        userId: "u-it-manager",
        name: "wide",
        prefix: "tt_12345678",
        scopes: ["tickets:read", "servers:read", "approvals:read"],
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
      },
      "l2_support_engineer",
    ),
    ["tickets:read", "approvals:read"],
    "an L2 engineer may view approvals, so that scope survives the demotion too",
  );
});

/* -------------------------------------------------------------------------- */
/*  MCP: the same identity, a second shape                                    */
/* -------------------------------------------------------------------------- */

const caller: ApiCaller = {
  keyId: "k-test",
  keyName: "mcp test",
  userId: "u-it-manager",
  name: "Meera Raghavan",
  email: "it.manager@tasktornado.dev",
  role: "it_manager",
  scopes: ["tickets:read", "kb:read"],
};

test("initialize answers with the protocol version, capabilities and server name", async () => {
  const response = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize" }, caller);
  assert.ok(response && "result" in response);
  const result = response.result as {
    protocolVersion: string;
    capabilities: { tools: { listChanged: boolean } };
    serverInfo: { name: string };
  };
  assert.equal(result.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.equal(result.capabilities.tools.listChanged, false);
  assert.equal(result.serverInfo.name, "tasktornado");
});

test("notifications get no reply, and ping gets an empty result", async () => {
  assert.equal(
    await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, caller),
    null,
  );
  const ping = await handleMcpMessage({ jsonrpc: "2.0", id: 7, method: "ping" }, caller);
  assert.deepEqual(ping, { jsonrpc: "2.0", id: 7, result: {} });
});

test("tools/list only offers what the key can actually call", async () => {
  const response = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, caller);
  const tools = (response?.result as { tools: { name: string }[] }).tools;
  const names = tools.map((tool) => tool.name);

  assert.ok(names.includes("tickets_list"));
  assert.ok(names.includes("kb_search"));
  assert.equal(names.includes("tickets_create"), false, "the key has no tickets:write");
  assert.equal(names.includes("approvals_list"), false, "the key has no approvals:read");

  // Every offered tool is backed by a real scope.
  for (const tool of MCP_TOOLS) {
    if (names.includes(tool.name)) assert.ok(caller.scopes.includes(tool.scope));
  }
});

test("tools/call refuses a tool the key cannot use, in the tool's own envelope", async () => {
  const response = await handleMcpMessage(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "tickets_create", arguments: {} } },
    caller,
  );
  const result = response?.result as { isError: boolean; content: { type: string; text: string }[] };
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /tickets:write/);
});

test("unknown methods and unknown tools are protocol errors, not crashes", async () => {
  const method = await handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "resources/list" }, caller);
  assert.equal(method && "error" in method ? method.error?.code : 0, -32601);

  const tool = await handleMcpMessage(
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "rm_rf" } },
    caller,
  );
  assert.equal(tool && "error" in tool ? tool.error?.code : 0, -32602);

  const malformed = await handleMcpMessage(
    { jsonrpc: "1.0", id: 6, method: "ping" } as unknown as Parameters<typeof handleMcpMessage>[0],
    caller,
  );
  assert.equal(malformed && "error" in malformed ? malformed.error?.code : 0, -32600);
});
