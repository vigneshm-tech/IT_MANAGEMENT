import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import {
  CLIENT_FIELD_ID,
  accumulateClients,
  buildClientScanPath,
  customFieldValues,
  describeSyncAge,
  isSyncStale,
  matchRegisterClient,
  parseClientValue,
  scanClients,
  sortClients,
  type RedmineClientFound,
} from "../lib/integrations/redmine-clients";
import { RedmineError } from "../lib/integrations/redmine";

/* -------------------------------------------------------------------------- */
/*  Parsing a captured value                                                  */
/* -------------------------------------------------------------------------- */

test("a client value splits into its name and short codes", () => {
  assert.deepEqual(parseClientValue("Skin | SK | SKIN"), {
    value: "Skin | SK | SKIN",
    name: "Skin",
    codes: ["SK", "SKIN"],
  });

  // No pipes: the whole value is the name and there are no codes.
  assert.deepEqual(parseClientValue("Acme Corp"), {
    value: "Acme Corp",
    name: "Acme Corp",
    codes: [],
  });

  // Empty segments are not codes, and a repeated code is kept once.
  assert.deepEqual(parseClientValue("Acme| |ACM|acm")?.codes, ["ACM"]);
});

test("a value is kept byte for byte, because it is a key", () => {
  const parsed = parseClientValue("  Skin|SK  ");
  assert.equal(parsed?.value, "  Skin|SK  ");
  assert.equal(parsed?.name, "Skin");
  assert.deepEqual(parsed?.codes, ["SK"]);
});

test("a blank value is not a client", () => {
  assert.equal(parseClientValue(""), null);
  assert.equal(parseClientValue("   "), null);
  assert.equal(parseClientValue("|"), null);
});

test("the client field is read whether Redmine sends a string or a list", () => {
  const issue = {
    id: 1,
    custom_fields: [
      { id: 155, name: "Task Type", value: "Incident" },
      { id: CLIENT_FIELD_ID, name: "Client-eShopaid", value: "Skin|SK" },
      { id: 215, name: "Asset", value: null },
    ],
  };
  assert.deepEqual(customFieldValues(issue), ["Skin|SK"]);

  assert.deepEqual(
    customFieldValues({
      custom_fields: [{ id: CLIENT_FIELD_ID, value: ["Skin|SK", "Acme|ACM", 7] }],
    }),
    ["Skin|SK", "Acme|ACM"],
  );

  assert.deepEqual(customFieldValues({ custom_fields: "nope" }), []);
  assert.deepEqual(customFieldValues({}), []);
});

/* -------------------------------------------------------------------------- */
/*  Tallying a page of tickets                                                */
/* -------------------------------------------------------------------------- */

test("tickets are counted per value, newest first", () => {
  const seen = new Map<string, RedmineClientFound>();
  const issues = [
    { id: 900, custom_fields: [{ id: CLIENT_FIELD_ID, value: "Skin|SK" }] },
    { id: 899, custom_fields: [{ id: CLIENT_FIELD_ID, value: "Skin|SK|SKIN" }] },
    { id: 898, custom_fields: [{ id: CLIENT_FIELD_ID, value: "Acme|ACM" }] },
    { id: 897, custom_fields: [{ id: CLIENT_FIELD_ID, value: "" }] },
    { id: 896, custom_fields: [] },
  ];

  assert.equal(accumulateClients(seen, issues), 5);

  const skin = seen.get("Skin|SK");
  assert.equal(skin?.tickets, 1);
  // The newest ticket is the one worth linking to.
  assert.equal(skin?.issueId, 900);

  assert.deepEqual(seen.get("Skin|SK|SKIN")?.codes, ["SK", "SKIN"]);

  assert.equal(seen.size, 3);
});

test("clients sort by name, then by value", () => {
  const sorted = sortClients([
    { value: "zeta|Z", name: "zeta", codes: ["Z"], tickets: 1, issueId: 1 },
    { value: "Acme|A", name: "Acme", codes: ["A"], tickets: 1, issueId: 2 },
    { value: "acme2|A2", name: "Acme", codes: ["A2"], tickets: 1, issueId: 3 },
  ] as RedmineClientFound[]);
  assert.deepEqual(
    sorted.map((client) => client.value),
    ["Acme|A", "acme2|A2", "zeta|Z"],
  );
});

/* -------------------------------------------------------------------------- */
/*  The scan                                                                  */
/* -------------------------------------------------------------------------- */

test("the scan path asks for every status, newest first, one page at a time", () => {
  assert.equal(
    buildClientScanPath(674, 0),
    "/issues.json?project_id=674&status_id=*&sort=updated_on%3Adesc&limit=100",
  );
  assert.match(buildClientScanPath(674, 200), /offset=200/);
  // Redmine caps a page at 100 whatever is asked for.
  assert.match(buildClientScanPath(674, 0, 500), /limit=100/);
});

/* A small Redmine: 250 tickets in one project. */
const TOTAL = 250;
const issues = Array.from({ length: TOTAL }, (_, index) => {
  const value =
    index < 120 ? "Skin|SK" : index < 220 ? "Acme Corp|ACME|ACM" : "Zeta|ZT";
  return {
    id: 1000 + (TOTAL - index),
    updated_on: "2026-11-01T10:00:00Z",
    custom_fields: [
      { id: 155, name: "Task Type", value: "Incident" },
      { id: CLIENT_FIELD_ID, name: "Client-eShopaid", value },
    ],
  };
});

let server: http.Server | undefined;
let baseUrl = "";
const requests: { url: string; headers: Record<string, string> }[] = [];

async function startServer() {
  server = http.createServer((request, response) => {
    requests.push({
      url: String(request.url),
      headers: request.headers as Record<string, string>,
    });

    const key = request.headers["x-redmine-api-key"];
    if (key !== "good-key-123456") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ errors: ["Unauthorized"] }));
      return;
    }

    const url = new URL(String(request.url), "http://127.0.0.1");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const limit = Number(url.searchParams.get("limit") ?? "100");

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        issues: issues.slice(offset, offset + limit),
        total_count: TOTAL,
        offset,
        limit,
      }),
    );
  });

  return new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", () => {
      const address = server?.address();
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

test("a scan walks every page and returns the distinct clients", async () => {
  await serverReady;
  requests.length = 0;

  const scan = await scanClients({ baseUrl, apiKey: "good-key-123456" });

  assert.equal(scan.scanned, TOTAL);
  assert.equal(scan.total, TOTAL);
  assert.equal(scan.truncated, false);
  assert.deepEqual(
    scan.clients.map((client) => [client.name, client.tickets]),
    [
      ["Acme Corp", 100],
      ["Skin", 120],
      ["Zeta", 30],
    ],
  );
  assert.equal(scan.clients[0].issueId, 1130, "the newest ticket that carried it");

  // Three pages: offsets 0, 100 and 200 — nothing more, nothing less.
  assert.equal(requests.length, 3);
  assert.match(requests[0].url, /offset=0|limit=100/);
  assert.match(requests[1].url, /offset=100/);
  assert.match(requests[2].url, /offset=200/);
  assert.equal(requests[0].headers["x-redmine-api-key"], "good-key-123456");
});

test("a scan stops at its cap and says it was truncated", async () => {
  await serverReady;
  requests.length = 0;

  const scan = await scanClients(
    { baseUrl, apiKey: "good-key-123456" },
    { maxTickets: 100 },
  );

  assert.equal(scan.scanned, 100);
  assert.equal(scan.truncated, true);
  assert.equal(requests.length, 1);
  assert.deepEqual(
    scan.clients.map((client) => client.name),
    ["Skin"],
  );
});

test("a rejected key fails the whole scan instead of returning half a list", async () => {
  await serverReady;

  await assert.rejects(
    () => scanClients({ baseUrl, apiKey: "wrong-key-000000" }),
    (error: unknown) => {
      assert.ok(error instanceof RedmineError);
      assert.equal(error.status, 401);
      return true;
    },
  );
});

/* -------------------------------------------------------------------------- */
/*  Matching against our own client register                                  */
/* -------------------------------------------------------------------------- */

test("a captured client finds its register record by code or by name", () => {
  const register = [
    { id: "CL-1001", name: "Acme Manufacturing", code: "ACME" },
    { id: "CL-1002", name: "Skin Cosmetics", code: "SKIN" },
  ];

  assert.equal(
    matchRegisterClient({ name: "Skin", codes: ["SK"] }, register)?.id,
    "CL-1002",
    "the name matches even when the code does not",
  );
  assert.equal(
    matchRegisterClient({ name: "Acme Corp", codes: ["acme"] }, register)?.id,
    "CL-1001",
    "codes match regardless of case",
  );
  assert.equal(
    matchRegisterClient({ name: "S.K. Skin", codes: [] }, register),
    null,
    "only an exact match counts",
  );
  assert.equal(matchRegisterClient({ name: "", codes: [] }, register), null);
});

/* -------------------------------------------------------------------------- */
/*  How old the capture is                                                    */
/* -------------------------------------------------------------------------- */

test("the sync age reads like a sentence and goes stale after a week", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  assert.equal(describeSyncAge("2026-11-19T11:59:40Z", now), "just now");
  assert.equal(describeSyncAge("2026-11-19T11:00:00Z", now), "1 hour ago");
  assert.equal(describeSyncAge("2026-11-19T08:00:00Z", now), "4 hours ago");
  assert.equal(describeSyncAge("2026-11-17T12:00:00Z", now), "2 days ago");
  assert.equal(describeSyncAge("nonsense", now), "never");

  assert.equal(isSyncStale(null, now), true);
  assert.equal(isSyncStale({ syncedAt: "2026-11-18T12:00:00Z" }, now), false);
  assert.equal(isSyncStale({ syncedAt: "2026-11-01T12:00:00Z" }, now), true);
});
