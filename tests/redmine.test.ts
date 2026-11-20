import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import {
  RedmineError,
  buildIssuesPath,
  clampLimit,
  createIssue,
  describeFailure,
  fetchIssues,
  mapIssue,
  mapIssuePage,
  mapProjects,
  normaliseBaseUrl,
  redmineIssueUrl,
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
