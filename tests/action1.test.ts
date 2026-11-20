import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import {
  Action1Error,
  action1ConsoleUrl,
  action1EndpointUrl,
  describeAction1Failure,
  fetchAccessToken,
  fetchEndpoint,
  fetchEndpoints,
  mapEndpoint,
  mapEndpointPage,
  mapOrganizations,
  normaliseAction1BaseUrl,
  parseAction1Date,
  resolveOrganizationId,
} from "../lib/integrations/action1";
import {
  describeLastSeen,
  describeMissingUpdates,
  describePatchHeadline,
  isRebootRequired,
  missingAction1Settings,
  rebootLabel,
  summariseEndpoints,
} from "../lib/servers/endpoint";

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                              */
/* -------------------------------------------------------------------------- */

test("the Action1 API address is normalised to .../api/3.0", () => {
  assert.equal(normaliseAction1BaseUrl(""), "https://app.action1.com/api/3.0");
  assert.equal(normaliseAction1BaseUrl("app.na-2.action1.com"), "https://app.na-2.action1.com/api/3.0");
  assert.equal(
    normaliseAction1BaseUrl("  https://app.na-2.action1.com/  "),
    "https://app.na-2.action1.com/api/3.0",
  );
  // A fully qualified API base is left alone.
  assert.equal(
    normaliseAction1BaseUrl("https://eu.action1.com/api/3.0"),
    "https://eu.action1.com/api/3.0",
  );
});

test("console and endpoint links drop the API prefix", () => {
  const base = "https://app.na-2.action1.com/api/3.0";
  assert.equal(action1ConsoleUrl(base), "https://app.na-2.action1.com");
  assert.equal(
    action1EndpointUrl(base, "e-1"),
    "https://app.na-2.action1.com/console/endpoints?endpoint=e-1",
  );
});

test("Action1's underscore timestamps become ISO UTC", () => {
  assert.equal(parseAction1Date("2026-11-03_09-15-22"), "2026-11-03T09:15:22Z");
  assert.equal(parseAction1Date("2026-11-03T09:15:22Z"), "2026-11-03T09:15:22.000Z");
  assert.equal(parseAction1Date(""), "");
  assert.equal(parseAction1Date(undefined), "");
  assert.equal(parseAction1Date("not a date"), "");
});

test("a managed endpoint is mapped with safe defaults", () => {
  const endpoint = mapEndpoint(
    {
      id: "e-1",
      name: "ACME-FS01",
      status: "Connected",
      OS: "Windows Server 2022",
      platform: "x64",
      last_seen: "2026-11-03_09-15-22",
      address: "10.10.0.14",
      external_address: "49.207.1.9",
      agent_version: "5.2.1",
      agent_install_date: "2026-09-01_04-00-00",
      subscription_status: "Active",
      user: "AD\\meera",
      missing_critical_updates: "2",
      missing_other_updates: 5,
      reboot_required: true,
      update_status: "Pending",
      CPU_name: "Xeon E5-2630",
      CPU_size: "2.2 GHz",
      RAM: "32 GB",
      disk: "480 GB SSD",
      MAC: "00-15-5D-01-02-03",
      serial: "SN-4471",
      device_name: "PowerEdge R450",
      last_boot_time: "2026-11-01_22-30-00",
    },
    "https://app.na-2.action1.com/api/3.0",
  );

  assert.equal(endpoint.id, "e-1");
  assert.equal(endpoint.name, "ACME-FS01");
  assert.equal(endpoint.status, "Connected");
  assert.equal(endpoint.lastSeen, "2026-11-03T09:15:22Z");
  assert.equal(endpoint.ipAddress, "10.10.0.14");
  assert.equal(endpoint.externalAddress, "49.207.1.9");
  assert.equal(endpoint.agentInstallDate, "2026-09-01T04:00:00Z");
  assert.equal(endpoint.missingCritical, 2);
  assert.equal(endpoint.missingOther, 5);
  assert.equal(endpoint.cpu, "Xeon E5-2630 · 2.2 GHz");
  assert.equal(endpoint.ram, "32 GB");
  assert.equal(endpoint.serial, "SN-4471");
  assert.equal(endpoint.lastBootTime, "2026-11-01T22:30:00Z");
  assert.equal(
    endpoint.url,
    "https://app.na-2.action1.com/console/endpoints?endpoint=e-1",
  );
});

test("a sparse endpoint falls back instead of showing undefined", () => {
  const endpoint = mapEndpoint({ id: "e-9" }, "https://app.action1.com/api/3.0");
  assert.equal(endpoint.name, "e-9");
  assert.equal(endpoint.status, "Unknown");
  assert.equal(endpoint.os, "");
  assert.equal(endpoint.lastSeen, "");
  assert.equal(endpoint.missingCritical, null);
  assert.equal(endpoint.missingOther, null);
  const anonymous = mapEndpoint({ name: "Agentless" }, "https://app.action1.com/api/3.0");
  assert.equal(anonymous.id, "");
  // Without an id the link goes to the console rather than an empty query.
  assert.equal(anonymous.url, "https://app.action1.com/console/endpoints");
});

test("a result page keeps the total and the next-page link", () => {
  const page = mapEndpointPage(
    {
      id: "page-1",
      type: "ResultPage",
      items: [{ id: "e-1", name: "A" }, { id: "e-2", name: "B" }],
      total_items: 120,
      limit: 2,
      next_page: "https://app.na-2.action1.com/api/3.0/endpoints/managed/org?from=2",
    },
    "https://app.na-2.action1.com/api/3.0",
  );

  assert.equal(page.items.length, 2);
  assert.equal(page.totalCount, 120);
  assert.equal(page.limit, 2);
  assert.match(String(page.nextPage), /from=2$/);

  const empty = mapEndpointPage({}, "https://app.action1.com/api/3.0");
  assert.deepEqual(empty.items, []);
  assert.equal(empty.totalCount, 0);
  assert.equal(empty.nextPage, null);
});

test("organizations are read from a result page or a bare array", () => {
  assert.deepEqual(mapOrganizations({ items: [{ id: "org-1", name: "Acme" }] }), [
    { id: "org-1", name: "Acme" },
  ]);
  assert.deepEqual(mapOrganizations([{ id: "org-2" }]), [{ id: "org-2", name: "Organization" }]);
  // Rows without an id are dropped instead of producing broken links.
  assert.deepEqual(mapOrganizations({ items: [{ name: "No id" }] }), []);
});

test("failures are described in the operator's language", () => {
  assert.match(describeAction1Failure(401, ""), /client id and secret/);
  assert.match(describeAction1Failure(403, ""), /do not have permission/);
  assert.match(describeAction1Failure(404, ""), /organization or endpoint/);
  assert.match(describeAction1Failure(429, ""), /rate limiting/);
  assert.match(describeAction1Failure(400, "field 'limit' is invalid"), /invalid/);
  assert.match(describeAction1Failure(503, ""), /server error/);
});

/* -------------------------------------------------------------------------- */
/*  Inventory presentation                                                    */
/* -------------------------------------------------------------------------- */

const BASE = "https://app.na-2.action1.com/api/3.0";

function endpointFor(overrides: Record<string, unknown>) {
  return mapEndpoint(overrides, BASE);
}

test("the inventory summary counts connection state, reboots and patches", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const summary = summariseEndpoints(
    [
      endpointFor({
        id: "a",
        status: "Connected",
        last_seen: "2026-11-03_11-58-00",
        missing_critical_updates: 2,
        missing_other_updates: 3,
        reboot_required: true,
      }),
      endpointFor({
        id: "b",
        status: "Disconnected",
        last_seen: "2026-10-30_08-00-00",
        missing_critical_updates: "1",
        reboot_required: "false",
      }),
      endpointFor({ id: "c", status: "Pending Uninstall" }),
    ],
    now,
  );

  assert.equal(summary.total, 3);
  assert.equal(summary.connected, 1);
  assert.equal(summary.disconnected, 1);
  assert.equal(summary.offline, 1, "an endpoint without last_seen counts as offline");
  assert.equal(summary.stale, 1, "the disconnected host last checked in four days ago");
  assert.equal(summary.rebootRequired, 1);
  assert.equal(summary.missingCritical, 3);
  assert.equal(summary.missingOther, 3);
});

test("check-in times read like the Action1 console", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  assert.equal(describeLastSeen("", now), "Never checked in");
  assert.equal(describeLastSeen("2026-11-03T11:59:40Z", now), "Just now");
  assert.equal(describeLastSeen("2026-11-03T11:45:00Z", now), "15 min ago");
  assert.equal(describeLastSeen("2026-11-03T09:00:00Z", now), "3 hours ago");
  assert.equal(describeLastSeen("2026-11-02T12:00:00Z", now), "1 day ago");
  assert.equal(describeLastSeen("2026-09-01T12:00:00Z", now), "2 months ago");
  assert.equal(describeLastSeen("2024-01-01T12:00:00Z", now), "2 years ago");
});

test("patch counts and reboot flags are phrased for the table", () => {
  assert.equal(
    describeMissingUpdates(endpointFor({ missing_critical_updates: 2, missing_other_updates: 5 })),
    "2 critical · 5 other",
  );
  assert.equal(
    describeMissingUpdates(endpointFor({ missing_critical_updates: 0, missing_other_updates: 4 })),
    "4 other",
  );
  assert.equal(
    describeMissingUpdates(endpointFor({ missing_critical_updates: 0, missing_other_updates: 0 })),
    "Up to date",
  );
  assert.equal(describeMissingUpdates(endpointFor({})), "—");

  assert.equal(
    describePatchHeadline(endpointFor({ missing_critical_updates: 2, missing_other_updates: 5 })),
    "2 critical · 5 other updates missing",
  );
  assert.equal(
    describePatchHeadline(endpointFor({ missing_critical_updates: 0, missing_other_updates: 0 })),
    "Fully patched",
  );
  assert.equal(describePatchHeadline(endpointFor({})), "Patch data unavailable");

  assert.equal(rebootLabel(endpointFor({ reboot_required: true })), "Required");
  assert.equal(rebootLabel(endpointFor({ reboot_required: "Yes" })), "Required");
  assert.equal(rebootLabel(endpointFor({ reboot_required: "false" })), "No");
  assert.equal(rebootLabel(endpointFor({})), "—");
  assert.equal(isRebootRequired({ rebootRequired: "required" }), true);
  assert.equal(isRebootRequired({ rebootRequired: "" }), false);
});

test("the connection is only called complete with a client id and secret", () => {
  assert.deepEqual(missingAction1Settings({ secret: "s3cret-value-123" }), ["Client ID"]);
  assert.deepEqual(missingAction1Settings({ secret: "", config: { clientId: "cid" } }), [
    "Client Secret",
  ]);
  assert.deepEqual(missingAction1Settings({ secret: "", config: {} }), [
    "Client ID",
    "Client Secret",
  ]);
  assert.deepEqual(missingAction1Settings({ secret: "s3cret", config: { clientId: " cid " } }), []);
});

/* -------------------------------------------------------------------------- */
/*  HTTP contract                                                             */
/* -------------------------------------------------------------------------- */

type Seen = { method: string; url: string; authorization: string; body: string };

const seen: Seen[] = [];
let tokenRequests = 0;
let rejectToken = false;
let server: http.Server | undefined;
let baseUrl = "";

const ENDPOINTS = Array.from({ length: 3 }, (_, index) => ({
  id: `e-${index + 1}`,
  name: `ACME-SRV0${index + 1}`,
  status: index === 2 ? "Disconnected" : "Connected",
  OS: "Windows Server 2022",
  last_seen: `2026-11-0${index + 1}_09-15-22`,
  address: `10.10.0.1${index + 1}`,
  agent_version: "5.2.1",
  missing_critical_updates: index,
  missing_other_updates: index * 2,
  reboot_required: index === 1,
}));

function startServer(): Promise<void> {
  server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const url = request.url ?? "";
      seen.push({
        method: request.method ?? "GET",
        url,
        authorization: String(request.headers.authorization ?? ""),
        body,
      });

      const json = (status: number, payload: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
      };

      if (url === "/oauth2/token") {
        tokenRequests += 1;
        if (rejectToken) return json(401, { error: "invalid_client" });
        return json(200, {
          access_token: "token-abc",
          token_type: "Bearer",
          expires_in: 3600,
        });
      }

      if (String(request.headers.authorization) !== "Bearer token-abc") {
        return json(401, { message: "Unauthorized" });
      }

      if (url.startsWith("/organizations")) {
        return json(200, {
          type: "ResultPage",
          items: [{ id: "org-1", name: "Acme" }, { id: "org-2", name: "Globex" }],
          total_items: 2,
        });
      }

      if (url.startsWith("/endpoints/managed/org-1/")) {
        const id = url.split("?")[0].split("/").pop();
        const endpoint = ENDPOINTS.find((item) => item.id === id);
        return endpoint ? json(200, endpoint) : json(404, { message: "Not found" });
      }

      if (url.startsWith("/endpoints/managed/org-1")) {
        const params = new URL(url, "http://localhost").searchParams;
        const from = Number(params.get("from") ?? 0);
        const limit = Number(params.get("limit") ?? 25);
        const slice = ENDPOINTS.slice(from, from + limit);
        const next = from + limit < ENDPOINTS.length;
        return json(200, {
          type: "ResultPage",
          items: slice,
          total_items: ENDPOINTS.length,
          limit,
          next_page: next ? `${baseUrl}/endpoints/managed/org-1?from=${from + limit}` : null,
        });
      }

      return json(404, { message: "Unknown route" });
    });
  });

  return new Promise((resolve) => {
    server!.listen(0, "127.0.0.1", () => {
      const address = server!.address();
      const port = typeof address === "object" && address ? address.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

const serverReady = startServer();

after(() => {
  server?.close();
});

const config = () => ({
  baseUrl,
  clientId: "client-id-1",
  clientSecret: "client-secret-123456",
});

test("the token endpoint is called with the client-credentials grant", async () => {
  await serverReady;
  seen.length = 0;

  const token = await fetchAccessToken(config());

  assert.equal(token.accessToken, "token-abc");
  assert.equal(token.tokenType, "Bearer");
  assert.equal(token.expiresIn, 3600);

  const request = seen[0];
  assert.equal(request.method, "POST");
  assert.equal(request.url, "/oauth2/token");
  const form = new URLSearchParams(request.body);
  assert.equal(form.get("grant_type"), "client_credentials");
  assert.equal(form.get("client_id"), "client-id-1");
  assert.equal(form.get("client_secret"), "client-secret-123456");
  // The token call must not pretend to be authenticated.
  assert.equal(request.authorization, "");
});

test("bad credentials surface as an Action1Error with the HTTP status", async () => {
  await serverReady;
  rejectToken = true;
  try {
    await assert.rejects(
      () => fetchAccessToken(config()),
      (error: unknown) =>
        error instanceof Action1Error &&
        error.status === 401 &&
        /client id and secret/.test(error.message),
    );
  } finally {
    rejectToken = false;
  }
});

test("endpoints are paged with from, limit and fields=*", async () => {
  await serverReady;
  seen.length = 0;

  const first = await fetchEndpoints(config(), { orgId: "org-1", limit: 2 }, { token: "token-abc" });
  assert.equal(first.items.length, 2);
  assert.equal(first.totalCount, 3);
  assert.match(String(first.nextPage), /from=2$/);

  const second = await fetchEndpoints(
    config(),
    { orgId: "org-1", from: 2, limit: 2 },
    { token: "token-abc" },
  );
  assert.equal(second.items.length, 1);
  assert.equal(second.nextPage, null);

  const listRequest = new URL(seen[0].url, "http://localhost");
  assert.equal(listRequest.pathname, "/endpoints/managed/org-1");
  assert.equal(listRequest.searchParams.get("from"), "0");
  assert.equal(listRequest.searchParams.get("limit"), "2");
  assert.equal(listRequest.searchParams.get("fields"), "*");
  assert.equal(seen[0].authorization, "Bearer token-abc");
});

test("limits are clamped to the documented 1..50 range", async () => {
  await serverReady;
  seen.length = 0;

  await fetchEndpoints(config(), { orgId: "org-1", limit: 500 }, { token: "token-abc" });
  await fetchEndpoints(config(), { orgId: "org-1", limit: 0 }, { token: "token-abc" });

  const first = new URL(seen[0].url, "http://localhost").searchParams.get("limit");
  const second = new URL(seen[1].url, "http://localhost").searchParams.get("limit");
  assert.equal(first, "50");
  assert.equal(second, "1");
});

test("the token is fetched once when the inventory loads", async () => {
  await serverReady;
  tokenRequests = 0;

  const token = await fetchAccessToken(config());
  const organizations = await resolveOrganizationId(config(), { token: token.accessToken });
  assert.equal(organizations, "org-1");
  assert.equal(tokenRequests, 1);
});

test("a configured organization id skips /organizations", async () => {
  await serverReady;
  seen.length = 0;

  const orgId = await resolveOrganizationId({ ...config(), orgId: " org-2 " }, { token: "token-abc" });
  assert.equal(orgId, "org-2");
  assert.equal(seen.length, 0);
});

test("one endpoint is read from its detail route", async () => {
  await serverReady;
  seen.length = 0;

  const endpoint = await fetchEndpoint(
    config(),
    { orgId: "org-1", endpointId: "e-2" },
    { token: "token-abc" },
  );

  assert.equal(endpoint.name, "ACME-SRV02");
  assert.equal(endpoint.missingOther, 2);
  assert.equal(new URL(seen[0].url, "http://localhost").pathname, "/endpoints/managed/org-1/e-2");
  assert.equal(new URL(seen[0].url, "http://localhost").searchParams.get("fields"), "*");

  await assert.rejects(
    () => fetchEndpoint(config(), { orgId: "org-1", endpointId: "missing" }, { token: "token-abc" }),
    (error: unknown) => error instanceof Action1Error && error.status === 404,
  );
});
