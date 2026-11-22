# API and MCP: the plan

Status: **phase 1 implemented** (keys, REST `/api/v1`, MCP `/api/mcp`, Settings split).
This document is the contract the code is written against; when the two disagree, the
document is wrong.

---

## 1. Why

TaskTornado already has every fact a help desk needs, and only a browser can reach it.
Two callers are missing:

- **Scripts and other systems** — a monitoring check that raises a ticket, a nightly export of
  open queues, a chat bridge that reads the knowledge base.
- **Assistants** — an MCP client (Claude, an IDE agent, an internal copilot) that should be able
  to answer "what is open in service desk?" with the same facts a person sees.

Both needs the same three things: an identity that is not a browser session, a ceiling on what
that identity may read or write, and a way to take it back. Everything below is those three.

**The rule the whole design rests on:** the API is not a second permission system. It is a
second *door* into the one that already exists. `lib/access.ts` `can(role, module, action)` is
still the only definition of what a role may do; a key narrows it and can never widen it.

---

## 2. Identity: personal keys

A key belongs to a person. There is no organisation key in phase 1.

| Decision | Why |
| --- | --- |
| `api_keys.user_id → profiles.id` | Accountability: every API action has a human owner, and the audit question "who did this?" has an answer. |
| No org key | An org-wide credential has no role to narrow it and survives the person who created it. When the need is real (a long-lived integration), the answer is a **service profile** with its own role — a phase-2 item, listed below. |
| Revoking is an update | `revoked_at` keeps the row as the record that the key existed and that it was killed. |
| Max 10 active keys per person | Enough for a script, an assistant and a spare; small enough that "which key is this?" stays answerable. |

### The secret

```
tt_ + base64url(24 random bytes)         32 characters of entropy after the prefix
prefix = first 11 characters              tt_ + 8 — lookup handle, useless alone
secret_hash = HMAC-SHA-256(secret, AUTH_SECRET)
```

- The secret is **returned exactly once**, by the action that creates it. Nothing can return it
  again, because nothing stores it.
- HMAC rather than a bare hash: a stolen `api_keys` row is worthless on another deployment, and
  the pepper is `AUTH_SECRET`, which already exists and is already rotated with the sessions.
- Comparison uses `timingSafeEqual`. A near-miss prefix (same row, wrong remainder) fails on the
  hash — the prefix narrows the search, it does not authenticate.

### Scopes

A scope names a **capability and a module**, and maps to one `can()` check:

| Scope | Needs | Reads/writes |
| --- | --- | --- |
| `tickets:read` | `can(role, "tickets", "edit")` | ticket list, one ticket + thread, queues |
| `tickets:write` | `can(role, "tickets", "create")` | create a ticket as the key's owner |
| `kb:read` | `can(role, "kb", "view")` | knowledge base search |
| `tasks:read` | `can(role, "tasks", "view")` | task list |
| `clients:read` | `can(role, "clients", "view")` | client register |
| `servers:read` | `can(role, "servers", "view")` | Action1 endpoint inventory |
| `approvals:read` | `can(role, "approvals", "view")` | approvals |

A scope is checked **twice**:

1. **At issue time** — `resolveScopes(requested, role)` refuses any scope the role cannot already
   exercise. A refused scope is an error, not a silent omission: a key that quietly does less
   than asked is a debugging session nobody needs.
2. **On every request** — `effectiveScopes(key.scopes, role)` intersects the key's scopes with the
   role's capabilities *as of this request*. Demote the person and their old key narrows with
   them, without anyone remembering to edit the key.

`tickets:write` deliberately does **not** imply `tickets:read`. A key that can open a ticket but
not enumerate the desk is a legitimate shape (a form bridge), and implying one from the other
would hand out more than was asked for.

---

## 3. Transport

### REST — `/api/v1`

```
POST /api/v1/tickets                         tickets:write
GET  /api/v1/tickets?state=&queue=&priority=&limit=   tickets:read
GET  /api/v1/tickets/{id}                    tickets:read
GET  /api/v1/queues                          tickets:read
GET  /api/v1/kb?q=                           kb:read
GET  /api/v1/tasks                           tasks:read
GET  /api/v1/clients                         clients:read
GET  /api/v1/approvals                       approvals:read
GET  /api/v1/servers                         servers:read
GET  /api/v1                                 (index: what this key can call)
GET  /api/v1/me                              (who this key is)
```

Auth: `Authorization: Bearer tt_…`, or `X-Api-Key: tt_…` for clients that cannot set the former.

Envelope, always:

```json
{ "data": …, "meta": { "count": 5 } }
{ "error": { "code": "invalid_filter", "message": "…" } }
```

Codes: `missing_key`, `invalid_key`, `inactive_account`, `insufficient_scope`, `rate_limited`,
`not_found`, `invalid_filter`, `invalid_ticket`, `invalid_json`, `invalid_body`, `server_error`.
Statuses stay conventional (401 / 403 / 404 / 422 / 429 / 500) so ordinary HTTP clients and
proxies behave.

`GET /api/v1` is authenticated on purpose: the endpoint list is a permission report, and a public
copy would describe the surface to nobody who can use it.

### MCP — `POST /api/mcp`

JSON-RPC 2.0 over streamable HTTP, protocol `2025-06-18`, single response per POST, `202` and no
body for notifications. `GET` answers `405` with `Allow` — every tool answers in the POST that
asked, so no server-initiated stream is needed, and saying so is better than a socket that hangs.
`DELETE` is accepted and ignored (there is no session to end), `OPTIONS` answers CORS.

**Two ways in, one identity.** Either a personal key (`Authorization: Bearer tt_…`) or an OAuth
access token (`ttm_…`). Both resolve to the same `ApiCaller`; neither can exceed the person's role.

Tools, one per REST capability:

| Tool | Scope | Calls |
| --- | --- | --- |
| `tickets_list` | `tickets:read` | `listTicketsForApi` |
| `tickets_get` | `tickets:read` | `getTicketForApi` |
| `tickets_create` | `tickets:write` | `createTicketForApi` |
| `queues_list` | `tickets:read` | `listQueuesForApi` |
| `kb_search` | `kb:read` | `searchKbForApi` |
| `tasks_list` | `tasks:read` | `listTasksForApi` |
| `approvals_list` | `approvals:read` | `listApprovalsForApi` |

- **Filtered, not gated.** `tools/list` omits tools the key cannot call, so an assistant is never
  told a capability exists and then refused. `tools/call` still refuses it, because a model can
  invent a tool name.
- **Same readers.** Every tool body is the function a REST route calls, so the two surfaces cannot
  drift into different answers.
- **Tool errors are tool results.** A refusal comes back as `{ isError: true, content: [...] }`
  rather than a protocol error, which is what MCP clients render usefully.

No tool writes anything except `tickets_create`. Read-only is a property of the catalogue, not a
promise in the docs.

### OAuth 2.1 — why a key was not enough

A connector screen cannot be given a header. It is handed a `401`, looks for an authorisation
server, finds none, and reports **"no tools loaded"**. That is the failure this document exists to
fix, so the endpoint is also a small authorisation server:

| Endpoint | Purpose |
| --- | --- |
| `/.well-known/oauth-authorization-server` | RFC 8414 metadata: where to register, ask, exchange |
| `/.well-known/oauth-protected-resource[/api/mcp]` | RFC 9728: which authorisation server protects `/api/mcp` |
| `POST /api/oauth/register` | RFC 7591 dynamic client registration; `redirect_uris` must be https or loopback |
| `GET /oauth/authorize` | consent screen, on the ordinary signed-in session |
| `POST /oauth/authorize/decide` | plain form post — works with no JavaScript at all |
| `POST /api/oauth/token` | `authorization_code` + PKCE **S256 only**, and `refresh_token` |

Rules that keep it honest:

- **Registration grants nothing.** No scopes, no data, no identity — only the right to *ask*. Every
  authority comes from a person pressing Allow.
- **PKCE is mandatory.** A client that cannot do S256 cannot connect.
- **Access tokens live one hour; refresh tokens thirty days and rotate** — the old refresh token is
  revoked in the same step that mints its replacement, so a replay is detectable and useless.
- **Consent uses the session cookie**, so the app never sees a password and there is no second
  login form to phish.
- **Revoking an app kills both tokens**, otherwise "revoke" would mean "wait an hour".
- **A 401 advertises the server**: `WWW-Authenticate: Bearer resource_metadata="…"` is what lets a
  client discover the flow in the first place.

Connected apps appear in Settings → Developers with their scopes and last use, revocable in place.

---

## 4. The layer under RLS

An API request carries no session cookie, so row-level security would answer "no rows" to
everything. `apiRoute` therefore runs the handler inside `runWithServiceRole`, and the narrowing
that policies would have done is done in `lib/api/resources.ts` instead:

- authenticate the key → check the scope → **then** borrow the service role, in that order.
- each resource function narrows by the caller's role where the module does (`servers:read` only
  returns endpoints when the caller may view servers; internal KB articles are excluded by
  `searchKbArticles(..., { includeInternal: false })`).
- `api_keys` itself keeps RLS + **column grants**: the owner may `select` everything except
  `secret_hash`, may `insert` the hash once, and may only ever `update` name/scopes/expiry/
  revocation/last-used. A stolen session cannot read a hash or rewrite a key's identity.

---

## 5. Limits and audit

- **Rate limit:** 120 requests/minute per key id, in-memory sliding window. Headers
  `x-ratelimit-limit`, `x-ratelimit-remaining`, and `retry-after` on 429. Per instance, and stated
  as such — a shared store is phase 2.
- **Last used:** stamped best-effort on every authenticated request; a failed stamp never fails
  the request. It is how the Settings page tells you a key is alive.
- **Audit:** phase 1 records *that* a key was used and when. It does not yet write an
  `api_key_events` log of what was called. That is the next audit step (phase 2), together with
  surfacing the same rows in the ticket activity feed.

---

## 6. Settings: one page became five

`/modules/settings` used to stack Profile, Connections and Session. Splitting it is the second
half of this work, because API keys had nowhere honest to live on a page like that.

```
/modules/settings                 hub — four rows, each with live status
/modules/settings/profile         identity, role, what the role opens
/modules/settings/security        sign-in method, session window, sign out, key summary
/modules/settings/integrations    Redmine (per person), Action1 (per organisation)
/modules/settings/developers       keys, REST docs, MCP config
```

- The strip at the top of every page is `components/modules/settings-tabs.tsx`, the same shape as
  the ticket configuration tabs.
- The hub is not a menu of names: each row says what state it is in — which integration is
  connected, how many keys are live, when the session ends.
- Guards live in each page (`canAccessModule(role, "settings")`), plus the actions that change
  anything: `createApiKeyAction`, `revokeApiKeyAction`, `saveIntegrationAction` each re-check the
  role, because a page guard protects a render and an action protects a write.
- Old deep links now go to the section they meant: Redmine/Action1 "connect" links point at the
  integrations page, the top-nav Profile entry at the profile page. `/modules/settings` still
  works — it is the hub.

---

## 7. What is deliberately not built yet

| Item | Why not now | Shape of it |
| --- | --- | --- |
| Organisation / service keys | Needs a non-person profile with its own role | `profiles.kind = 'service'`, key owned by it |
| Write scopes beyond tickets | Each one needs a narrowing + tests; a half-checked writer is worse than none | `kb:write`, `tasks:write`, `clients:write` |
| Webhooks / outbound events | The outbox already exists for email; a signed webhook is its own design | `POST` to a subscriber, HMAC-signed, retried |
| Shared rate-limit store | One instance today; the demo runs in memory | Redis/Upstash or a Postgres counter |
| Per-call audit trail | Needs a retention decision | `api_key_events(id, key_id, method, path, status, at)` |
| Multi-user SaaS clients | One deployment, one employee per consent | tenant-aware consent, client allowlists |

---

## 8. File map

```
supabase/migrations/0030_api_keys.sql   table, RLS, column grants
lib/api/scopes.ts                       scope catalogue, issue-time and per-request checks
lib/api/keys.ts                         issue / list / revoke / authenticate (HMAC)
lib/api/auth.ts                         bearer header → ApiCaller → rate limit
lib/api/rate-limit.ts                   120/min per key
lib/api/resources.ts                    the readers and writers, narrowed by role
lib/api/http.ts                         ok/fail envelope, query parsing
lib/api/endpoints.ts                    one list, shared by the index route and the docs page
lib/api/handler.ts                      apiRoute: authenticate → scope → service role
lib/mcp/server.ts                       tool catalogue + JSON-RPC dispatch
lib/mcp/oauth.ts                        clients, codes, tokens, PKCE, metadata
lib/mcp/origin.ts                       absolute URLs from the request's own host
app/api/mcp/route.ts                    POST (batch, 202 for notifications), GET → 405, CORS
app/api/oauth/{register,token}/route.ts dynamic client registration, code + refresh exchange
app/oauth/authorize/                    consent screen and its form handler
app/.well-known/**                      authorisation-server and protected-resource metadata
app/api/v1/**                           the REST surface
app/(app)/modules/settings/**           hub + four sections
components/modules/settings-tabs.tsx    the strip
components/modules/api-key-form.tsx     issue a key, reveal the secret once
tests/api-mcp.test.ts                   scopes, keys, auth, MCP dispatch
tests/mcp-oauth.test.ts                 registration, PKCE, codes, tokens, revocation
```

---

## 9. Verification

- `npm test` — 338 tests, including 25 for this layer: key generation, prefix/hash separation,
  scope refusal at issue time, narrowing by role, authentication, revocation, expiry, and MCP
  `initialize` / `tools/list` filtering / `tools/call` refusal, plus the OAuth flow: registration,
  PKCE, single-use codes, refresh rotation, revocation.
- Manual, over HTTP: register a client → consent → exchange the code → `tools/list` returns only
  the scopes granted → replay the code (fails) → refresh (rotates).
- `npm run build` — the routes compile; `force-dynamic` everywhere, because a cached API answer is
  a lie told confidently.
- Manual: issue a key in `/modules/settings/developers`, `curl` `/api/v1/me` and `/api/v1/tickets`,
  then `POST /api/mcp` with `initialize` → `tools/list` → `tools/call`, revoke, and watch the same
  calls answer 401.
