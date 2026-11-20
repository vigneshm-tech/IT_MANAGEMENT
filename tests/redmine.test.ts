import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import {
  RedmineError,
  buildIssueUpdate,
  buildIssuesPath,
  clampLimit,
  createIssue,
  describeFailure,
  fetchIssue,
  fetchIssues,
  fetchPriorities,
  fetchProjectMembers,
  fetchStatuses,
  mapIssue,
  mapIssuePage,
  mapIssueDetail,
  mapJournals,
  mapMembers,
  mapPriorities,
  mapProjects,
  mapStatuses,
  normaliseBaseUrl,
  redmineIssueUrl,
  updateIssue,
} from "../lib/integrations/redmine";

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                              */
/* -------------------------------------------------------------------------- */

test("base URLs are normalised and issue links follow the instance", () => {
  assert.equal(normaliseBaseUrl("https://rm.example.com/"), "https://rm.example.com");
  assert.equal(normaliseBaseUrl(" https://rm.example.com  "), "https://rm.example.com");
  assert.equal(
    redmineIssueUrl("https://rm.example.com/", 1042),
    "https://rm.example.com/issues/1042",
  );
});

test("issue paths use the documented query parameters", () => {
  assert.equal(buildIssuesPath(), "/issues.json?limit=50");
  assert.equal(
    buildIssuesPath({ assignedToMe: true, statusId: "open", limit: 25 }),
    "/issues.json?limit=25&assigned_to_id=me&status_id=open",
  );
  const filtered = buildIssuesPath({
    projectId: 7,
    offset: 50,
    statusId: "*",
    search: "printer down",
    sort: "updated_on:desc",
  });
  assert.match(filtered, /project_id=7/);
  assert.match(filtered, /offset=50/);
  assert.match(filtered, /status_id=\*/);
  // URLSearchParams encodes the "~" that marks a contains-search; Redmine decodes it.
  assert.match(filtered, /subject=(%7E|~)printer\+down/);
  assert.match(filtered, /sort=updated_on%3Adesc/);
});

test("limits are clamped to the API's 1..100 range", () => {
  assert.equal(clampLimit(undefined), 50);
  assert.equal(clampLimit(0), 1);
  assert.equal(clampLimit(500), 100);
  assert.equal(clampLimit(30.7), 30);
});

test("an issue is mapped with safe defaults and its Redmine link", () => {
  const issue = mapIssue(
    {
      id: 1042,
      subject: "Patch ring 2 stalled",
      description: "Two hosts missed the window.",
      project: { id: 3, name: "Acme" },
      tracker: { id: 1, name: "Bug" },
      status: { id: 2, name: "In Progress" },
      priority: { id: 3, name: "High" },
      author: { id: 9, name: "Meera" },
      created_on: "2026-11-01T10:00:00Z",
      updated_on: "2026-11-02T11:30:00Z",
      due_date: "2026-11-05",
      done_ratio: 40,
    },
    "https://rm.example.com",
  );

  assert.equal(issue.id, 1042);
  assert.equal(issue.project.name, "Acme");
  assert.equal(issue.assignee, null);
  assert.equal(issue.dueDate, "2026-11-05");
  assert.equal(issue.doneRatio, 40);
  assert.equal(issue.url, "https://rm.example.com/issues/1042");
});

test("a collection keeps total_count, limit and offset", () => {
  const page = mapIssuePage(
    { issues: [{ id: 1, subject: "One" }, { id: 2, subject: "Two" }], total_count: 253, limit: 25, offset: 50 },
    "https://rm.example.com",
  );
  assert.equal(page.issues.length, 2);
  assert.equal(page.totalCount, 253);
  assert.equal(page.limit, 25);
  assert.equal(page.offset, 50);
});

test("projects are mapped by id, name and identifier", () => {
  const projects = mapProjects({ projects: [{ id: 4, name: "Ops", identifier: "ops" }] });
  assert.deepEqual(projects, [{ id: 4, name: "Ops", identifier: "ops" }]);
});

test("failures read as advice, not stack traces", () => {
  assert.match(describeFailure(401, ""), /rejected the API key/);
  assert.match(describeFailure(404, ""), /could not find the API/);
  assert.match(describeFailure(422, "Subject cannot be blank"), /Subject cannot be blank/);
  assert.match(describeFailure(503, ""), /503/);
});

/* -------------------------------------------------------------------------- */
/*  Against a local fake Redmine                                              */
/* -------------------------------------------------------------------------- */

type Recorded = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };

const requests: Recorded[] = [];
let server: http.Server;
let baseUrl = "";

function startServer(): Promise<void> {
  server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({
        method: request.method ?? "",
        url: request.url ?? "",
        headers: request.headers,
        body,
      });

      if (request.headers["x-redmine-api-key"] !== "good-key-123456") {
        response.writeHead(401, { "content-type": "text/plain" });
        response.end("HTTP Basic: Access denied.");
        return;
      }

      if (request.method === "POST" && request.url === "/issues.json") {
        const payload = JSON.parse(body);
        response.writeHead(201, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            issue: {
              id: 2001,
              subject: payload.issue.subject,
              project: { id: Number(payload.issue.project_id), name: "Acme" },
              tracker: { id: 1, name: "Bug" },
              status: { id: 1, name: "New" },
              priority: { id: 2, name: "Normal" },
              author: { id: 5, name: "Meera" },
              created_on: "2026-11-03T09:00:00Z",
              updated_on: "2026-11-03T09:00:00Z",
            },
          }),
        );
        return;
      }

      if (request.method === "GET" && request.url?.startsWith("/issues/1042.json")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            issue: {
              id: 1042,
              subject: "Patch ring 2 stalled",
              description: "Ring 2 stopped syncing.",
              project: { id: 3, name: "Acme" },
              tracker: { id: 1, name: "Bug" },
              status: { id: 2, name: "In Progress" },
              priority: { id: 3, name: "High" },
              author: { id: 9, name: "Meera" },
              assigned_to: { id: 9, name: "Meera Raghavan" },
              created_on: "2026-11-01T10:00:00Z",
              updated_on: "2026-11-02T11:30:00Z",
              journals: [
                { id: 1, user: { id: 9, name: "Meera" }, notes: "Taken.", created_on: "2026-11-02T09:00:00Z" },
                { id: 2, user: { id: 4, name: "Arun" }, notes: "", created_on: "2026-11-02T10:00:00Z" },
                { id: 3, user: { id: 4, name: "Arun" }, notes: "Ring 2 restarted.", created_on: "2026-11-02T11:30:00Z" },
              ],
            },
          }),
        );
        return;
      }

      if (request.method === "PUT" && request.url?.startsWith("/issues/")) {
        const payload = JSON.parse(body);
        if (!payload.issue?.subject) {
          response.writeHead(422, { "content-type": "application/json" });
          response.end(JSON.stringify({ errors: ["Subject cannot be blank"] }));
          return;
        }
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.url?.startsWith("/issue_statuses.json")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            issue_statuses: [
              { id: 1, name: "New", is_default: true },
              { id: 2, name: "In Progress", is_default: false },
            ],
          }),
        );
        return;
      }

      if (request.url?.startsWith("/enumerations/issue_priorities.json")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            issue_priorities: [
              { id: 2, name: "Normal" },
              { id: 3, name: "High" },
            ],
          }),
        );
        return;
      }

      if (request.url?.startsWith("/projects/3/memberships.json")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            memberships: [
              { id: 1, user: { id: 9, name: "Meera Raghavan" } },
              { id: 2, user: { id: 4, firstname: "Arun", lastname: "Kumar" } },
            ],
          }),
        );
        return;
      }

      if (request.url?.startsWith("/projects.json")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ projects: [{ id: 3, name: "Acme", identifier: "acme" }] }));
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          issues: [
            {
              id: 1042,
              subject: "Patch ring 2 stalled",
              project: { id: 3, name: "Acme" },
              tracker: { id: 1, name: "Bug" },
              status: { id: 2, name: "In Progress" },
              priority: { id: 3, name: "High" },
              author: { id: 9, name: "Meera" },
              assigned_to: { id: 9, name: "Meera Raghavan" },
              created_on: "2026-11-01T10:00:00Z",
              updated_on: "2026-11-02T11:30:00Z",
              due_date: "2026-11-05",
            },
          ],
          total_count: 1,
          limit: 25,
          offset: 0,
        }),
      );
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
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

test("issues are fetched with the API key header and parsed", async () => {
  await serverReady;
  requests.length = 0;

  const page = await fetchIssues(
    { baseUrl, apiKey: "good-key-123456" },
    { assignedToMe: true, statusId: "open", limit: 25 },
  );

  assert.equal(page.totalCount, 1);
  assert.equal(page.issues[0].subject, "Patch ring 2 stalled");
  assert.equal(page.issues[0].assignee?.name, "Meera Raghavan");

  const [request] = requests;
  assert.equal(request.headers["x-redmine-api-key"], "good-key-123456");
  assert.match(String(request.url), /assigned_to_id=me/);
  assert.match(String(request.url), /status_id=open/);
  assert.ok(!String(request.url).includes("key="), "the key must never travel in the URL");
});

test("a rejected key becomes a actionable RedmineError", async () => {
  await serverReady;

  await assert.rejects(
    () => fetchIssues({ baseUrl, apiKey: "wrong-key-000000" }),
    (error: unknown) => {
      assert.ok(error instanceof RedmineError);
      assert.equal(error.status, 401);
      assert.match(error.message, /rejected the API key/);
      return true;
    },
  );
});

test("creating an issue posts JSON and returns the new issue", async () => {
  await serverReady;
  requests.length = 0;

  const issue = await createIssue(
    { baseUrl, apiKey: "good-key-123456" },
    { projectId: 3, subject: "Printer offline", description: "Floor 2" },
  );

  assert.equal(issue.id, 2001);
  assert.equal(issue.subject, "Printer offline");

  const [request] = requests;
  assert.equal(request.method, "POST");
  assert.equal(request.headers["content-type"], "application/json");
  const payload = JSON.parse(request.body);
  assert.equal(payload.issue.project_id, 3);
  assert.equal(payload.issue.subject, "Printer offline");
  assert.equal(payload.issue.description, "Floor 2");
});

test("an unreachable instance fails politely instead of hanging", async () => {
  await assert.rejects(
    () => fetchIssues({ baseUrl: "http://127.0.0.1:1", apiKey: "good-key-123456" }, {}, { timeoutMs: 1500 }),
    (error: unknown) => {
      assert.ok(error instanceof RedmineError);
      assert.match(error.message, /Could not reach Redmine/);
      return true;
    },
  );
});

/* -------------------------------------------------------------------------- */
/*  Reading and updating one issue                                            */
/* -------------------------------------------------------------------------- */

test("issue detail keeps the ids the editor needs and drops empty notes", () => {
  const detail = mapIssueDetail(
    {
      issue: {
        id: 12,
        subject: "Printer offline",
        description: "Floor 2",
        project: { id: 3, name: "Acme" },
        tracker: { id: 1, name: "Bug" },
        status: { id: 2, name: "In Progress" },
        priority: { id: 3, name: "High" },
        author: { id: 9, name: "Meera" },
        journals: [
          { id: 1, user: { id: 9, name: "Meera" }, notes: "Taken", created_on: "2026-11-02T09:00:00Z" },
          { id: 2, user: { id: 4, name: "Arun" }, notes: "  ", created_on: "2026-11-02T10:00:00Z" },
        ],
      },
    },
    "https://rm.example.com",
  );

  assert.equal(detail.id, 12);
  assert.equal(detail.statusId, 2);
  assert.equal(detail.priorityId, 3);
  assert.equal(detail.projectId, 3);
  assert.equal(detail.assigneeId, null);
  assert.equal(detail.url, "https://rm.example.com/issues/12");
  assert.equal(detail.journals.length, 1);
  assert.equal(detail.journals[0].notes, "Taken");
});

test("status, priority and member payloads map to flat option lists", () => {
  assert.deepEqual(mapStatuses({ issue_statuses: [{ id: 1, name: "New", is_default: true }] }), [
    { id: 1, name: "New", isDefault: true },
  ]);
  assert.deepEqual(mapPriorities({ issue_priorities: [{ id: 3, name: "High" }] }), [
    { id: 3, name: "High" },
  ]);
  assert.deepEqual(
    mapMembers({
      memberships: [
        { user: { id: 9, name: "Meera Raghavan" } },
        { user: { id: 4, firstname: "Arun", lastname: "Kumar" } },
        { group: { id: 7, name: "Service desk" } },
      ],
    }),
    [
      { id: 9, name: "Meera Raghavan" },
      { id: 4, name: "Arun Kumar" },
    ],
  );
  assert.deepEqual(mapJournals({}), []);
  assert.deepEqual(mapMembers({ memberships: "nope" }), []);
});

test("the update body only carries the fields that changed", () => {
  assert.deepEqual(buildIssueUpdate({ notes: "   " }), { issue: {} });
  assert.deepEqual(
    buildIssueUpdate({
      subject: "Printer offline",
      statusId: 2,
      priorityId: 3,
      assigneeId: null,
      description: "",
      notes: "  Ring 2 restarted.  ",
    }),
    {
      issue: {
        subject: "Printer offline",
        description: "",
        status_id: 2,
        priority_id: 3,
        assigned_to_id: "",
        notes: "Ring 2 restarted.",
      },
    },
  );
});

test("fetching one issue asks for its journals", async () => {
  await serverReady;
  requests.length = 0;

  const issue = await fetchIssue({ baseUrl, apiKey: "good-key-123456" }, 1042);

  assert.equal(issue.subject, "Patch ring 2 stalled");
  assert.equal(issue.statusId, 2);
  assert.equal(issue.assigneeId, 9);
  assert.equal(issue.journals.length, 2);

  const [request] = requests;
  assert.match(String(request.url), /include=journals/);
  assert.equal(request.headers["x-redmine-api-key"], "good-key-123456");
});

test("lookups read statuses, priorities and project members", async () => {
  await serverReady;

  const config = { baseUrl, apiKey: "good-key-123456" };
  const [statuses, priorities, members] = await Promise.all([
    fetchStatuses(config),
    fetchPriorities(config),
    fetchProjectMembers(config, 3),
  ]);

  assert.deepEqual(statuses.map((status) => status.name), ["New", "In Progress"]);
  assert.equal(statuses[0].isDefault, true);
  assert.deepEqual(priorities.map((priority) => priority.name), ["Normal", "High"]);
  assert.deepEqual(members.map((member) => member.name), ["Meera Raghavan", "Arun Kumar"]);
});

test("updating an issue PUTs JSON and accepts an empty 204", async () => {
  await serverReady;
  requests.length = 0;

  await updateIssue({ baseUrl, apiKey: "good-key-123456" }, 1042, {
    subject: "Printer offline again",
    statusId: 2,
    notes: "Checked the queue.",
  });

  const [request] = requests;
  assert.equal(request.method, "PUT");
  assert.equal(request.headers["content-type"], "application/json");
  assert.match(String(request.url), /^\/issues\/1042\.json/);
  assert.deepEqual(JSON.parse(request.body), {
    issue: { subject: "Printer offline again", status_id: 2, notes: "Checked the queue." },
  });
});

test("a validation failure surfaces Redmine's own message", async () => {
  await serverReady;

  await assert.rejects(
    () => updateIssue({ baseUrl, apiKey: "good-key-123456" }, 1042, { statusId: 2 }),
    (error: unknown) => {
      assert.ok(error instanceof RedmineError);
      assert.equal(error.status, 422);
      assert.match(error.message, /Subject cannot be blank/);
      return true;
    },
  );
});
