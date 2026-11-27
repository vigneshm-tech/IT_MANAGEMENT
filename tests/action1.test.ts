import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import {
  ACTION1_PATCH_FIELDS,
  Action1Error,
  action1ConsoleUrl,
  fetchEndpointMissingUpdates,
  mapMissingUpdate,
  mapMissingUpdatePage,
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
import { canManageAction1, integrationSlot } from "../lib/integrations/access";
import {
  describeLastSeen,
  describeMissingUpdates,
  describePatchHeadline,
  describeVersionMove,
  severityBucket,
  summariseUpdates,
  updateCategory,
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
  assert.equal(page.extended, false, "no patch fields in this payload");
  assert.equal(page.totalCount, 120);
  assert.equal(page.limit, 2);
  assert.match(String(page.nextPage), /from=2$/);

  const empty = mapEndpointPage({}, "https://app.action1.com/api/3.0");
  assert.deepEqual(empty.items, []);
  assert.equal(empty.totalCount, 0);
  assert.equal(empty.nextPage, null);
  assert.equal(empty.extended, false);
});

test("patch fields are detected, and a nested missing_updates object is accepted", () => {
  const withFields = mapEndpointPage(
    {
      items: [
        {
          id: "e-1",
          name: "A",
          missing_critical_updates: "4",
          missing_other_updates: "9",
        },
      ],
    },
    "https://app.action1.com/api/3.0",
  );
  assert.equal(withFields.extended, true);
  assert.equal(withFields.items[0].missingCritical, 4);
  assert.equal(withFields.items[0].missingOther, 9);

  // Action1 answers "" when nothing is missing; an absent field means "not
  // reported" and must not be mistaken for zero.
  const reportedZero = mapEndpoint(
    { id: "e-2", missing_critical_updates: "", missing_other_updates: "" },
    "https://app.action1.com/api/3.0",
  );
  assert.equal(reportedZero.missingCritical, 0);
  assert.equal(reportedZero.missingOther, 0);

  const notReported = mapEndpoint({ id: "e-4" }, "https://app.action1.com/api/3.0");
  assert.equal(notReported.missingCritical, null);

  // Some payloads nest the counts instead of flattening them.
  const nested = mapEndpoint(
    { id: "e-3", missing_updates: { critical: 2, other: 7 } },
    "https://app.action1.com/api/3.0",
  );
  assert.equal(nested.missingCritical, 2);
  assert.equal(nested.missingOther, 7);
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

test("only super admin, IT manager and IT engineer may write the Action1 key", () => {
  assert.equal(canManageAction1("super_admin"), true);
  assert.equal(canManageAction1("it_manager"), true);
  assert.equal(canManageAction1("it_engineer"), true);

  for (const role of [
    "l2_support_manager",
    "l2_support_lead",
    "implementation_manager",
    "implementation_lead",
    "development_manager",
    "development_lead",
    "testing_manager",
    "testing_lead",
    "management",
  ] as const) {
    assert.equal(canManageAction1(role), false, `${role} must not write the Action1 key`);
  }
});

test("the Action1 credential is one organisation slot, Redmine stays per user", () => {
  // Two different people saving Action1 write the same slot, so the last save is
  // the organisation's connection.
  assert.equal(
    integrationSlot("u-it-manager", "action1"),
    integrationSlot("u-it-engineer", "action1"),
  );
  assert.equal(integrationSlot("u-super-admin", "action1"), "organisation:action1");

  // Redmine keys never leak across profiles.
  assert.equal(integrationSlot("u-1", "redmine"), "u-1:redmine");
  assert.notEqual(integrationSlot("u-1", "redmine"), integrationSlot("u-2", "redmine"));
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
/*  Missing updates                                                           */
/* -------------------------------------------------------------------------- */

const UPDATE_ROW = {
  id: "u-1",
  name: "2026-10 Cumulative Update for Windows Server 2022 (KB5061234)",
  vendor: "Microsoft",
  security_severity: "Critical",
  update_type: "Windows update",
  kb: 5061234,
  security_CVE: ["CVE-2026-1111", "CVE-2026-2222"],
  installed_version: "10.0.20348.1",
  release_date: "2026-10-14",
  approval_status: "Approved",
  size: "742 MB",
  optional_or_recommended: "Recommended",
  reboot_required: true,
};

test("a missing update is mapped with its KB, CVE, severity and versions", () => {
  const update = mapMissingUpdate(UPDATE_ROW);

  assert.equal(update.name, UPDATE_ROW.name);
  assert.equal(update.vendor, "Microsoft");
  assert.equal(update.severity, "Critical");
  assert.equal(update.kb, "KB5061234");
  assert.equal(update.cve, "CVE-2026-1111, CVE-2026-2222");
  assert.equal(update.currentVersion, "10.0.20348.1");
  assert.equal(update.releaseDate, "2026-10-14T00:00:00.000Z");
  assert.equal(update.approval, "Approved");
  assert.equal(update.size, "742 MB");
  assert.equal(update.optional, false);
  assert.equal(update.rebootRequired, "true");
});

test("package/version shaped update rows and versions[] are read too", () => {
  const nested = mapMissingUpdate({
    id: "u-2",
    package: { id: "pkg-1", name: "Mozilla Firefox", vendor: "Mozilla" },
    versions: [
      {
        id: "v-2",
        version: "141.0",
        security_severity: "Important",
        release_date: "2026-09-30",
        approval_status: "New",
        kb_number: "KB9001",
        security_CVE: "CVE-2026-3333",
      },
    ],
  });

  assert.equal(nested.name, "Mozilla Firefox");
  assert.equal(nested.vendor, "Mozilla");
  assert.equal(nested.availableVersion, "141.0");
  assert.equal(nested.severity, "Important");
  assert.equal(nested.releaseDate, "2026-09-30T00:00:00.000Z");
  assert.equal(nested.kb, "KB9001");
  assert.equal(nested.cve, "CVE-2026-3333");
  assert.equal(nested.approval, "New");
  assert.equal(nested.optional, null);
});

test("the update page keeps the total so the table can say what it is showing", () => {
  const page = mapMissingUpdatePage({ items: [UPDATE_ROW], total_items: "12" });
  assert.equal(page.items.length, 1);
  assert.equal(page.totalCount, 12);

  const empty = mapMissingUpdatePage({ items: [] });
  assert.deepEqual(empty.items, []);
  assert.equal(empty.totalCount, 0);
});

test("severities fold into the five console buckets and are counted", () => {
  assert.equal(severityBucket("Critical"), "critical");
  assert.equal(severityBucket(" important "), "important");
  assert.equal(severityBucket("Moderate"), "moderate");
  assert.equal(severityBucket("Low"), "low");
  assert.equal(severityBucket("Unspecified"), "other");
  assert.equal(severityBucket(""), "other");

  const summary = summariseUpdates([
    mapMissingUpdate({ id: "a", security_severity: "Critical" }),
    mapMissingUpdate({ id: "b", security_severity: "Critical" }),
    mapMissingUpdate({ id: "c", security_severity: "Important" }),
    mapMissingUpdate({ id: "d" }),
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.critical, 2);
  assert.equal(summary.important, 1);
  assert.equal(summary.other, 1);

  const windows = mapMissingUpdate({ id: "w", update_type: "Windows update", name: "KB5061234" });
  const app = mapMissingUpdate({ id: "p", update_type: "App", name: "7-Zip", vendor: "Igor Pavlov" });
  const bare = mapMissingUpdate({ id: "x", name: "Something" });
  assert.equal(updateCategory(windows), "Windows");
  assert.equal(updateCategory(app), "Application");
  assert.equal(updateCategory(bare), "Other");

  assert.equal(
    describeVersionMove(mapMissingUpdate({ installed_version: "1.0", available_version: "2.0" })),
    "1.0 → 2.0",
  );
  assert.equal(
    describeVersionMove(mapMissingUpdate({ installed_version: "1.0" })),
    "1.0",
    "a Windows cumulative update only reports the installed build",
  );
  assert.equal(describeVersionMove(mapMissingUpdate({ available_version: "141.0" })), "→ 141.0");
  assert.equal(describeVersionMove(mapMissingUpdate({})), "—");
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

/**
 * The test server mimics a tenant that ignores `fields=*` but answers when the
 * two patch fields are named explicitly — the case that used to leave the
 * Critical/Other patch figures stuck at 0.
 */
function namesPatchFields(url: string): boolean {
  const fields = new URL(url, "http://localhost").searchParams.get("fields") ?? "";
  return fields !== "*" && (fields.includes("missing_critical_updates") || fields.includes("missing_other_updates"));
}

function endpointPayload(url: string) {
  if (namesPatchFields(url)) return ENDPOINTS;
  return ENDPOINTS.map(({ missing_critical_updates: _critical, missing_other_updates: _other, ...rest }) => rest);
}

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

      if (url.includes("/missing-updates")) {
        const endpointId = url.split("?")[0].split("/")[4];
        if (endpointId !== "e-1" && endpointId !== "e-2") {
          return json(404, { message: "No update list for that endpoint" });
        }
        return json(200, { type: "ResultPage", items: [UPDATE_ROW], total_items: 1, limit: 100 });
      }

      if (url.startsWith("/updates/org-1")) {
        const params = new URL(url, "http://localhost").searchParams;
        if (!["e-1", "e-fallback"].includes(String(params.get("endpoint_id")))) {
          return json(404, { message: "Unknown endpoint" });
        }
        return json(200, { type: "ResultPage", items: [UPDATE_ROW], total_items: 1 });
      }

      if (url.startsWith("/endpoints/managed/org-1/")) {
        const id = url.split("?")[0].split("/").pop();
        const endpoint = endpointPayload(url).find((item) => item.id === id);
        return endpoint ? json(200, endpoint) : json(404, { message: "Not found" });
      }

      if (url.startsWith("/endpoints/managed/org-1")) {
        const params = new URL(url, "http://localhost").searchParams;
        const from = Number(params.get("from") ?? 0);
        const limit = Number(params.get("limit") ?? 25);
        const all = endpointPayload(url);
        const slice = all.slice(from, from + limit);
        const next = from + limit < ENDPOINTS.length;
        return json(200, {
          type: "ResultPage",
          items: slice,
          total_items: all.length,
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

test("patch fields come back when they are named explicitly", async () => {
  await serverReady;

  const starred = await fetchEndpoints(
    config(),
    { orgId: "org-1", limit: 3 },
    { token: "token-abc" },
  );
  assert.equal(starred.extended, false, "this tenant ignores fields=*");

  const explicit = await fetchEndpoints(
    config(),
    { orgId: "org-1", limit: 3, fields: ACTION1_PATCH_FIELDS },
    { token: "token-abc" },
  );
  assert.equal(explicit.extended, true);
  assert.equal(explicit.items[0].missingCritical, 0);
  assert.equal(explicit.items[1].missingCritical, 1);
  assert.equal(explicit.items[1].missingOther, 2);
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

test("missing updates are read from the endpoint route", async () => {
  await serverReady;
  seen.length = 0;

  const page = await fetchEndpointMissingUpdates(
    config(),
    { orgId: "org-1", endpointId: "e-1" },
    { token: "token-abc" },
  );

  assert.equal(page.totalCount, 1);
  assert.equal(page.items[0].kb, "KB5061234");
  assert.equal(page.items[0].severity, "Critical");

  const request = new URL(seen[0].url, "http://localhost");
  assert.equal(request.pathname, "/endpoints/managed/org-1/e-1/missing-updates");
  assert.equal(request.searchParams.get("limit"), "100");
  assert.equal(request.searchParams.get("fields"), "*");
  assert.equal(seen[0].authorization, "Bearer token-abc");
});

test("an older tenant falls back to the org update listing for one endpoint", async () => {
  await serverReady;
  seen.length = 0;

  // This endpoint does not exist on the per-endpoint route, but does on /updates.
  const page = await fetchEndpointMissingUpdates(
    config(),
    { orgId: "org-1", endpointId: "e-fallback" },
    { token: "token-abc" },
  );

  assert.equal(page.items.length, 1);
  assert.equal(seen.length, 2, "endpoint route first, then the org listing");
  assert.match(seen[0].url, /\/missing-updates/);
  const fallback = new URL(seen[1].url, "http://localhost");
  assert.equal(fallback.pathname, "/updates/org-1");
  assert.equal(fallback.searchParams.get("endpoint_id"), "e-fallback");

  await assert.rejects(
    () =>
      fetchEndpointMissingUpdates(
        config(),
        { orgId: "org-1", endpointId: "e-404" },
        { token: "token-abc" },
      ),
    (error: unknown) => error instanceof Action1Error && error.status === 404,
  );
});

test("a configured organization id skips /organizations", async () => {
  await serverReady;
  seen.length = 0;

  const orgId = await resolveOrganizationId({ ...config(), orgId: " org-2 " }, { token: "token-abc" });
  assert.equal(orgId, "org-2");
  assert.equal(seen.length, 0);
});

test("one endpoint is read from its detail route, retrying for patch fields", async () => {
  await serverReady;
  seen.length = 0;

  const endpoint = await fetchEndpoint(
    config(),
    { orgId: "org-1", endpointId: "e-2" },
    { token: "token-abc" },
  );

  assert.equal(endpoint.name, "ACME-SRV02");
  assert.equal(endpoint.missingOther, 2);
  assert.equal(seen.length, 2, "the star response carried no patch fields, so it is re-read");
  assert.match(decodeURIComponent(seen[1].url), /fields=missing_critical_updates/);
  assert.equal(new URL(seen[0].url, "http://localhost").pathname, "/endpoints/managed/org-1/e-2");
  assert.equal(new URL(seen[0].url, "http://localhost").searchParams.get("fields"), "*");

  await assert.rejects(
    () => fetchEndpoint(config(), { orgId: "org-1", endpointId: "missing" }, { token: "token-abc" }),
    (error: unknown) => error instanceof Action1Error && error.status === 404,
  );
});
