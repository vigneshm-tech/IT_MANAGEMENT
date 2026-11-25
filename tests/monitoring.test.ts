import assert from "node:assert/strict";
import { test } from "node:test";
import type { IisApplication } from "../lib/iis/constants";
import {
  DEFAULT_CHECK_INTERVAL_SECONDS,
  MAX_CHECK_INTERVAL_SECONDS,
  MIN_CHECK_INTERVAL_SECONDS,
  bindingUrl,
  buildTargets,
  checkIntervalSeconds,
  describeAge,
  describeSince,
  formatInterval,
  parseRecipients,
  planAlerts,
  readFailure,
  readResponse,
  statusTone,
  isProtocolFilter,
  timeoutFor,
  certDaysLeft,
  certState,
  describeCert,
  inMaintenance,
  escalationDue,
  uptimePercent,
  PROBE_TIMEOUT_HEALTHY_MS,
  PROBE_TIMEOUT_TROUBLED_MS,
  filterFromHttpEnabled,
  isHttpEnabled,
  urlProtocol,
  type MonitorTarget,
} from "../lib/monitoring/core";
import { newestAgeSeconds } from "../lib/monitoring/run";
import { can, canAccessModule } from "../lib/access";
import { ROLE_IDS, type RoleId } from "../lib/roles";

const ALL_ROLES = [...ROLE_IDS] as RoleId[];

function application(overrides: Partial<IisApplication> = {}): IisApplication {
  return {
    id: "app-1",
    server: "WEB01",
    name: "Portal",
    environment: "production",
    bindingHost: "portal.example.com",
    bindingPort: 443,
    sslMapped: true,
    sslCertificate: "*.example.com",
    sslThumbprint: "abc",
    sslExpiresAt: null,
    appPool: "PortalPool",
    directoryBrowsing: "disabled",
    appRoot: "C:\\sites\\portal",
    owner: "Vignesh M",
    status: "running",
    notes: "",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("a binding becomes the URL people type", () => {
  // The scheme follows TLS, and the scheme's own port is left out.
  assert.equal(
    bindingUrl({ bindingHost: "portal.example.com", bindingPort: 443, sslMapped: true }),
    "https://portal.example.com",
  );
  assert.equal(
    bindingUrl({ bindingHost: "portal.example.com", bindingPort: 80, sslMapped: false }),
    "http://portal.example.com",
  );
  // A port the scheme does not imply is kept, because that is where the site is.
  assert.equal(
    bindingUrl({ bindingHost: "internal.example.com", bindingPort: 8080, sslMapped: false }),
    "http://internal.example.com:8080",
  );
  assert.equal(
    bindingUrl({ bindingHost: "portal.example.com", bindingPort: null, sslMapped: true }),
    "https://portal.example.com",
  );
  // A host already written as a URL is taken as written.
  assert.equal(
    bindingUrl({ bindingHost: "https://shop.example.com/", bindingPort: 443, sslMapped: true }),
    "https://shop.example.com",
  );
  // Nothing published, nothing to watch.
  assert.equal(bindingUrl({ bindingHost: "  ", bindingPort: 80, sslMapped: false }), null);
});

test("only active applications with a binding are watched", () => {
  const targets = buildTargets([
    application({ id: "a", bindingHost: "b.example.com", name: "B" }),
    application({ id: "b", bindingHost: "a.example.com", name: "A" }),
    application({ id: "c", active: false }),
    application({ id: "d", bindingHost: "" }),
  ]);

  assert.deepEqual(
    targets.map((target) => target.key),
    ["b", "a"],
    "sorted by URL, retired and unbound rows left out",
  );
  assert.equal(targets[0].url, "https://a.example.com");
  assert.equal(targets[0].site, "A");
  assert.equal(targets[0].server, "WEB01");
});

test("a site answering anything below 500 is read honestly", () => {
  assert.deepEqual(readResponse(200, 120), { ok: true, statusCode: 200, latencyMs: 120, error: null });
  assert.equal(readResponse(302, 80).ok, true, "a redirect is a healthy answer");
  assert.equal(readResponse(401, 40).ok, false);
  assert.equal(readResponse(404, 40).error, "HTTP 404");
  assert.equal(readResponse(503, 40).ok, false, "a server fault is down");
  assert.deepEqual(readFailure("The connection was refused.", 12), {
    ok: false,
    statusCode: null,
    latencyMs: 12,
    error: "The connection was refused.",
  });
});

const target = (key: string): MonitorTarget => ({
  key,
  url: `https://${key}.example.com`,
  site: key,
  server: "WEB01",
  environment: "production",
  owner: "Vineeth",
});

const down = (key: string) => ({ target: target(key), result: readFailure("refused", 10) });
const up = (key: string) => ({ target: target(key), result: readResponse(200, 20) });

test("only a change of state is worth an email", () => {
  // First ever check that fails: announce it.
  assert.deepEqual(planAlerts(new Map(), [down("a")]).down.map((t) => t.key), ["a"]);

  // Still down and already announced: say nothing.
  const announced = new Map([["a", { ok: false, alerted: true }]]);
  assert.equal(planAlerts(announced, [down("a")]).down.length, 0);

  // Still down but the mail never went out (no SMTP yet): try again.
  const unannounced = new Map([["a", { ok: false, alerted: false }]]);
  assert.equal(planAlerts(unannounced, [down("a")]).down.length, 1);

  // Coming back is worth one line.
  assert.deepEqual(planAlerts(announced, [up("a")]).recovered.map((t) => t.key), ["a"]);

  // Up and staying up: nothing.
  assert.equal(planAlerts(new Map([["a", { ok: true, alerted: false }]]), [up("a")]).recovered.length, 0);
});

test("addresses are read the way people type them", () => {
  assert.deepEqual(
    parseRecipients("IT-Team@Example.com, ops@example.com\nops@example.com; bad-entry"),
    ["it-team@example.com", "ops@example.com"],
  );
  assert.deepEqual(parseRecipients(""), []);
});

test("the board's times are plain words", () => {
  const now = new Date("2026-11-19T10:00:00.000Z");
  assert.equal(describeAge(null, now), "never");
  assert.equal(describeAge("2026-11-19T09:59:30.000Z", now), "30s ago");
  assert.equal(describeAge("2026-11-19T09:40:00.000Z", now), "20m ago");
  assert.equal(describeSince("2026-11-19T09:00:00.000Z", now), "1 hour");
  assert.equal(describeSince("2026-11-19T09:45:00.000Z", now), "15 minutes");
});

test("monitoring is a working module, not a public one", () => {
  assert.equal(canAccessModule("it_manager", "monitoring"), true);
  assert.equal(canAccessModule("it_engineer", "monitoring"), true);
  assert.equal(canAccessModule("management", "monitoring"), true);
  assert.equal(canAccessModule("super_admin", "monitoring"), true);
  assert.equal(canAccessModule("development_engineer", "monitoring"), false);
  assert.equal(canAccessModule("l2_support_engineer", "monitoring"), false);

  // Only the IT Manager sets the alert recipients (the super admin holds every
  // capability, which the registry grants separately).
  const admins = ALL_ROLES.filter((role) => can(role, "monitoring", "admin"));
  assert.deepEqual(admins.sort(), ["it_manager", "super_admin"]);
});

test("the interval is said in minutes and seconds, and kept sane", () => {
  assert.equal(DEFAULT_CHECK_INTERVAL_SECONDS, 60);
  assert.equal(checkIntervalSeconds(2, 0), 120);
  assert.equal(checkIntervalSeconds(1, 30), 90);
  assert.equal(checkIntervalSeconds(0, 45), 45);
  // Nothing shorter than a round, nothing longer than an hour.
  assert.equal(checkIntervalSeconds(0, 0), MIN_CHECK_INTERVAL_SECONDS);
  assert.equal(checkIntervalSeconds(0, 5), MIN_CHECK_INTERVAL_SECONDS);
  assert.equal(checkIntervalSeconds(90, 0), MAX_CHECK_INTERVAL_SECONDS);
  assert.equal(checkIntervalSeconds(-4, -4), MIN_CHECK_INTERVAL_SECONDS);

  assert.equal(formatInterval(45), "45 sec");
  assert.equal(formatInterval(60), "1 min");
  assert.equal(formatInterval(90), "1 min 30 sec");
  assert.equal(formatInterval(3_600), "60 min");
});

test("the three lights say what the numbers mean", () => {
  assert.equal(statusTone({ ok: null, latencyMs: null }), "unknown");
  assert.equal(statusTone({ ok: false, latencyMs: 12 }), "down");
  assert.equal(statusTone({ ok: true, latencyMs: 90 }), "up");
  // Answering, but slowly: the amber light, not green and not red.
  assert.equal(statusTone({ ok: true, latencyMs: 1_500 }), "slow");
  assert.equal(statusTone({ ok: true, latencyMs: 4_200 }), "slow");
});

test("the scheduler measures from the newest answer", () => {
  const now = new Date("2026-11-19T10:00:00.000Z").getTime();
  assert.equal(newestAgeSeconds([], now), null, "nothing checked yet");

  const row = (key: string, checkedAt: string) => ({
    key, ok: true, statusCode: 200, latencyMs: 90, error: null, checkedAt,
    since: "2026-11-19T09:00:00.000Z", alerted: false, escalated: false, certAlerted: false,
    certExpiresAt: null, attempts: 1, phases: null,
  });
  const rows = [
    row("a", "2026-11-19T09:59:00.000Z"),
    row("b", "2026-11-19T09:58:30.000Z"),
  ];
  assert.equal(newestAgeSeconds(rows, now), 60);
});

test("the filter watches only the scheme that was chosen", () => {
  const register = [
    application({ id: "secure", bindingHost: "portal.example.com", bindingPort: 443, sslMapped: true }),
    application({ id: "secure-alt", bindingHost: "shop.example.com", bindingPort: 8443, sslMapped: true }),
    application({ id: "plain", bindingHost: "legacy.example.com", bindingPort: 80, sslMapped: false }),
    application({ id: "plain-alt", bindingHost: "intranet.example.com", bindingPort: 8080, sslMapped: false }),
    application({ id: "retired", active: false, sslMapped: true }),
  ];

  const keys = (filter: "all" | "https" | "http") =>
    buildTargets(register, filter).map((target) => target.key);

  assert.deepEqual(keys("all"), ["plain-alt", "plain", "secure", "secure-alt"]);
  assert.deepEqual(keys("https"), ["secure", "secure-alt"]);
  assert.deepEqual(keys("http"), ["plain-alt", "plain"]);
  // No filter argument keeps the old behaviour.
  assert.equal(buildTargets(register).length, 4);

  // A scheme written into the host is read by what it says, not by the SSL flag.
  assert.equal(urlProtocol("https://shop.example.com"), "https");
  assert.equal(urlProtocol("http://shop.example.com"), "http");

  assert.equal(isProtocolFilter("https"), true);
  assert.equal(isProtocolFilter("ftp"), false);

  // The settings switch is a yes/no over the same stored filter.
  assert.equal(filterFromHttpEnabled(true), "all");
  assert.equal(filterFromHttpEnabled(false), "https");
  assert.equal(isHttpEnabled("all"), true);
  assert.equal(isHttpEnabled("http"), true);
  assert.equal(isHttpEnabled("https"), false);
  // Switching HTTP off leaves exactly the SSL-mapped bindings.
  assert.equal(buildTargets(register, filterFromHttpEnabled(false)).length, 2);
});

test("a site that answered gets the short timeout, a troubled one the long", () => {
  assert.equal(timeoutFor(undefined), PROBE_TIMEOUT_HEALTHY_MS);
  assert.equal(timeoutFor({ ok: true }), PROBE_TIMEOUT_HEALTHY_MS);
  assert.equal(timeoutFor({ ok: false }), PROBE_TIMEOUT_TROUBLED_MS);
  assert.ok(PROBE_TIMEOUT_HEALTHY_MS < PROBE_TIMEOUT_TROUBLED_MS);
});

test("a certificate is an early warning, not an outage", () => {
  const now = new Date("2026-11-19T10:00:00.000Z");
  assert.equal(certDaysLeft("2026-12-19T10:00:00.000Z", now), 30);
  assert.equal(certState("2026-12-19T10:00:00.000Z", now), "expiring");
  assert.equal(certState("2027-06-19T10:00:00.000Z", now), "ok");
  assert.equal(certState("2026-11-01T10:00:00.000Z", now), "expired");
  assert.equal(certState(null, now), "unknown");

  assert.equal(describeCert("2026-12-01T10:00:00.000Z", now), "expires in 12 days");
  assert.equal(describeCert("2026-11-17T10:00:00.000Z", now), "expired 2 days ago");
  assert.equal(describeCert(null, now), "not seen");
});

test("alerts are quiet inside a declared window, and only inside it", () => {
  const window = { from: "2026-11-19T09:00:00.000Z", to: "2026-11-19T11:00:00.000Z", note: "patch" };
  assert.equal(inMaintenance(window, new Date("2026-11-19T10:00:00.000Z")), true);
  assert.equal(inMaintenance(window, new Date("2026-11-19T11:01:00.000Z")), false);
  assert.equal(inMaintenance(window, new Date("2026-11-19T08:59:00.000Z")), false);
  // An open-ended or malformed window must not silence anything for ever.
  assert.equal(inMaintenance({ from: null, to: null, note: "" }), false);
  assert.equal(inMaintenance({ from: "nonsense", to: "nonsense", note: "" }), false);
});

test("escalation is for an outage that outlasts the delay, once", () => {
  const now = new Date("2026-11-19T10:00:00.000Z");
  assert.equal(escalationDue("2026-11-19T09:50:00.000Z", 15, false, now), false);
  assert.equal(escalationDue("2026-11-19T09:40:00.000Z", 15, false, now), true);
  assert.equal(escalationDue("2026-11-19T09:40:00.000Z", 15, true, now), false, "already escalated");
  assert.equal(escalationDue(null, 15, false, now), false);
});

test("uptime is up checks over checks, to one decimal", () => {
  const base = { key: "a", avgLatencyMs: null, p95LatencyMs: null, lastCheckedAt: null };
  assert.equal(uptimePercent({ ...base, checks: 0, up: 0 }), null);
  assert.equal(uptimePercent({ ...base, checks: 200, up: 200 }), 100);
  assert.equal(uptimePercent({ ...base, checks: 3, up: 2 }), 66.7);
  assert.equal(uptimePercent(undefined), null);
});
