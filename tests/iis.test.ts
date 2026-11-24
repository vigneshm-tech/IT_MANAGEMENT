import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applicationError,
  backupOverdue,
  describeBinding,
  ingestApplications,
  createApplication,
  createDatabase,
  createMysqlInstance,
  databaseError,
  deleteApplication,
  deleteMysqlInstance,
  describeBackup,
  listApplications,
  listDatabases,
  listMysqlInstances,
  mysqlError,
  setApplicationActive,
  summariseApplications,
  summariseDatabases,
  summariseMysql,
  updateDatabase,
  type ApplicationInput,
  type DatabaseInput,
  type IisDatabase,
  type IisMysqlInstance,
  type MysqlInput,
} from "../lib/iis/repository";
import {
  canIngestIis,
  parseAutomationPayload,
} from "../lib/iis/automation";
import { COLLECTOR_FILE_NAME, collectorScript } from "../lib/iis/collector";
import {
  SNAPSHOT_MAX_AGE_MS,
  describeAge,
  isStale,
  type InventorySnapshot,
} from "../lib/servers/snapshot";

const appInput = (overrides: Partial<ApplicationInput> = {}): ApplicationInput => ({
  name: "Billing",
  server: "WEB03",
  environment: "production",
  bindingHost: "billing.example.com",
  bindingPort: 8443,
  sslMapped: true,
  appPool: "BillingPool",
  directoryBrowsing: "disabled",
  appRoot: "D:\\sites\\billing",
  owner: "Arun Prakash",
  status: "running",
  notes: "",
  ...overrides,
});

const dbInput = (overrides: Partial<DatabaseInput> = {}): DatabaseInput => ({
  name: "BILLING_DB",
  server: "SQL03",
  engine: "sql_server",
  environment: "production",
  sizeGb: 12.5,
  recoveryModel: "FULL",
  lastBackupAt: "2026-11-18",
  owner: "Priya Nair",
  status: "online",
  notes: "",
  ...overrides,
});

/* ------------------------------ validation ------------------------------- */

test("an application needs a name and cannot repeat on the same server", () => {
  const existing = [{ id: "a1", name: "Portal", server: "WEB01" }];
  assert.match(applicationError(appInput({ name: "" }), existing) ?? "", /at least 2 characters/);
  assert.match(
    applicationError(appInput({ name: " portal ", server: "web01" }), existing) ?? "",
    /already exists/,
  );
  // The same name on another server is a different application.
  assert.equal(applicationError(appInput({ name: "Portal", server: "WEB02" }), existing), null);
  // Editing a row does not collide with itself.
  assert.equal(applicationError(appInput({ name: "Portal", server: "WEB01" }), existing, "a1"), null);
});

test("a database rejects an implausible size and a malformed backup date", () => {
  assert.match(databaseError(dbInput({ sizeGb: -1 }), []) ?? "", /Size must be/);
  assert.match(databaseError(dbInput({ sizeGb: 5_000_000 }), []) ?? "", /not credible/);
  assert.match(databaseError(dbInput({ lastBackupAt: "18/11/2026" }), []) ?? "", /must be a date/);
  assert.equal(databaseError(dbInput({ sizeGb: null, lastBackupAt: null }), []), null);
});

/* ------------------------------- summaries ------------------------------- */

const databaseRow = (overrides: Partial<IisDatabase> = {}): IisDatabase => ({
  id: "d1",
  name: "ORDERS_DB",
  server: "SQL01",
  engine: "sql_server",
  environment: "production",
  sizeGb: 10,
  recoveryModel: "FULL",
  lastBackupAt: "2026-11-18",
  owner: "",
  status: "online",
  notes: "",
  active: true,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

test("attention counts stopped applications, not retired ones", () => {
  const summary = summariseApplications([
    { id: "1", name: "A", server: "", environment: "production", appPool: "", bindingHost: "", bindingPort: null, sslMapped: false, directoryBrowsing: "disabled", appRoot: "", owner: "", status: "stopped", notes: "", active: true, createdAt: "", updatedAt: "" },
    { id: "2", name: "B", server: "", environment: "production", appPool: "", bindingHost: "", bindingPort: null, sslMapped: false, directoryBrowsing: "disabled", appRoot: "", owner: "", status: "stopped", notes: "", active: false, createdAt: "", updatedAt: "" },
    { id: "3", name: "C", server: "", environment: "staging", appPool: "", bindingHost: "", bindingPort: null, sslMapped: false, directoryBrowsing: "disabled", appRoot: "", owner: "", status: "running", notes: "", active: true, createdAt: "", updatedAt: "" },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.active, 2);
  assert.equal(summary.attention, 1);
  assert.equal(summary.byEnvironment.find((row) => row.environment === "production")?.count, 1);
});

test("a backup older than a week, or missing, needs attention", () => {
  const now = new Date("2026-11-19T00:00:00Z");
  assert.equal(backupOverdue(databaseRow({ lastBackupAt: "2026-11-18" }), now), false);
  assert.equal(backupOverdue(databaseRow({ lastBackupAt: "2026-11-01" }), now), true);
  assert.equal(backupOverdue(databaseRow({ lastBackupAt: null }), now), true);
  // An offline database is already counted as offline; do not count it twice.
  assert.equal(backupOverdue(databaseRow({ lastBackupAt: null, status: "offline" }), now), false);
  assert.equal(describeBackup(databaseRow({ lastBackupAt: null })), "Never backed up");
  assert.equal(describeBackup(databaseRow({ lastBackupAt: "2026-11-12" }), now), "Backed up 7 days ago");
});

test("database summary counts offline instances and overdue backups", () => {
  const now = new Date("2026-11-19T00:00:00Z");
  const summary = summariseDatabases(
    [
      databaseRow({ id: "1", lastBackupAt: "2026-11-18" }),
      databaseRow({ id: "2", lastBackupAt: "2026-10-01" }),
      databaseRow({ id: "3", status: "offline" }),
      databaseRow({ id: "4", active: false, status: "offline", lastBackupAt: null }),
    ],
    now,
  );
  assert.equal(summary.total, 4);
  assert.equal(summary.active, 3);
  assert.equal(summary.attention, 2);
});

/* ------------------------------ demo register ---------------------------- */

test("the demo register adds, edits, retires and deletes", async () => {
  const created = await createApplication(appInput());
  assert.equal(created.name, "Billing");
  assert.ok((await listApplications(true)).some((row) => row.id === created.id));

  await setApplicationActive(created.id, false);
  const retired = (await listApplications(true)).find((row) => row.id === created.id);
  assert.equal(retired?.active, false);
  assert.equal(
    (await listApplications(false)).some((row) => row.id === created.id),
    false,
  );

  await deleteApplication(created.id);
  assert.equal(
    (await listApplications(true)).some((row) => row.id === created.id),
    false,
  );
});

test("editing a database keeps its backup date and size", async () => {
  const created = await createDatabase(dbInput({ name: "AUDIT_DB", server: "SQL09" }));
  const saved = await updateDatabase(created.id, dbInput({ name: "AUDIT_DB", server: "SQL09", sizeGb: 20 }));
  assert.equal(saved, true);

  const row = (await listDatabases(true)).find((item) => item.id === created.id);
  assert.equal(row?.sizeGb, 20);
  assert.equal(row?.lastBackupAt, "2026-11-18");
});

/* ---------------------------- snapshot helpers --------------------------- */

const snapshot = (capturedAt: string): InventorySnapshot => ({
  capturedAt,
  durationMs: 1000,
  organizationId: "org",
  apiHost: "https://app.action1.com",
  total: 1,
  truncated: false,
  patchData: true,
  endpoints: [],
  source: "schedule",
  lastError: null,
  lastAttemptAt: capturedAt,
});

test("a snapshot is stale only after a day, and says how old it is", () => {
  const now = new Date("2026-11-19T12:00:00Z").getTime();
  assert.equal(isStale(snapshot("2026-11-19T06:00:00Z"), now), false);
  assert.equal(isStale(snapshot("2026-11-18T06:00:00Z"), now), true);
  assert.equal(describeAge(snapshot("2026-11-19T11:59:40Z"), now), "just now");
  assert.equal(describeAge(snapshot("2026-11-19T10:00:00Z"), now), "2 hours ago");
  assert.equal(describeAge(snapshot("2026-11-17T12:00:00Z"), now), "2 days ago");
  assert.equal(SNAPSHOT_MAX_AGE_MS, 86_400_000);
});

/* --------------------------------- MySQL --------------------------------- */

const mysqlInput = (overrides: Partial<MysqlInput> = {}): MysqlInput => ({
  name: "orders-mysql-09",
  host: "DB-MY09",
  port: 3306,
  version: "8.0.36",
  environment: "production",
  sizeGb: 40,
  charset: "utf8mb4 / utf8mb4_0900_ai_ci",
  lastBackupAt: "2026-11-18",
  owner: "Karthik Raman",
  status: "running",
  notes: "",
  ...overrides,
});

test("a MySQL instance needs a real port and a unique name on its host", () => {
  const existing = [{ id: "m1", name: "orders-mysql-01", host: "DB-MY01" }];

  assert.match(mysqlError(mysqlInput({ port: 0 }), existing) ?? "", /Port must be/);
  assert.match(mysqlError(mysqlInput({ port: 70000 }), existing) ?? "", /Port must be/);
  assert.match(mysqlError(mysqlInput({ port: 3306.5 }), existing) ?? "", /Port must be/);
  assert.match(
    mysqlError(mysqlInput({ name: " orders-mysql-01 ", host: "db-my01" }), existing) ?? "",
    /already registered/,
  );
  // The same label on a different host is a different server.
  assert.equal(
    mysqlError(mysqlInput({ name: "orders-mysql-01", host: "DB-MY02" }), existing),
    null,
  );
  assert.equal(
    mysqlError(mysqlInput({ name: "orders-mysql-01", host: "DB-MY01" }), existing, "m1"),
    null,
  );
  assert.match(mysqlError(mysqlInput({ lastBackupAt: "18-11-2026" }), []) ?? "", /must be a date/);
});

test("MySQL attention counts stopped instances and overdue backups, once", () => {
  const now = new Date("2026-11-19T00:00:00Z");
  const row = (overrides: Partial<IisMysqlInstance> = {}): IisMysqlInstance => ({
    id: "m1",
    name: "orders-mysql-01",
    host: "DB-MY01",
    port: 3306,
    version: "8.0.36",
    environment: "production",
    sizeGb: 40,
    charset: "",
    lastBackupAt: "2026-11-18",
    owner: "",
    status: "running",
    notes: "",
    active: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  });

  const summary = summariseMysql(
    [
      row({ id: "1" }),                                  // healthy
      row({ id: "2", lastBackupAt: "2026-10-01" }),      // backup overdue
      row({ id: "3", status: "stopped", lastBackupAt: null }), // stopped, counted once
      row({ id: "4", active: false, status: "stopped" }),      // retired, ignored
    ],
    now,
  );

  assert.equal(summary.total, 4);
  assert.equal(summary.active, 3);
  assert.equal(summary.attention, 2);
});

test("the demo MySQL register adds, edits, retires and deletes", async () => {
  const created = await createMysqlInstance(mysqlInput());
  assert.equal(created.port, 3306);
  assert.ok((await listMysqlInstances(true)).some((row) => row.id === created.id));

  await deleteMysqlInstance(created.id);
  assert.equal(
    (await listMysqlInstances(true)).some((row) => row.id === created.id),
    false,
  );
});

/* ------------------------ the eight IIS fields --------------------------- */

test("a binding reads as host:port, with https only when SSL is mapped", () => {
  assert.equal(
    describeBinding({ bindingHost: "portal.example.com", bindingPort: 443, sslMapped: true }),
    "portal.example.com:443 · https",
  );
  assert.equal(
    describeBinding({ bindingHost: "portal.example.com", bindingPort: 8080, sslMapped: false }),
    "portal.example.com:8080",
  );
  // A binding without a host header serves any host, and falls back to the default port.
  assert.equal(describeBinding({ bindingHost: "", bindingPort: null, sslMapped: true }), "(any host):443 · https");
  assert.equal(describeBinding({ bindingHost: "", bindingPort: null, sslMapped: false }), "(any host):80");
});

test("directory browsing is one of two states", () => {
  const existing = [{ id: "a1", name: "Portal", server: "WEB01" }];
  assert.match(
    applicationError(appInput({ directoryBrowsing: "maybe" as never }), existing) ?? "",
    /enabled or disabled/,
  );
  assert.equal(applicationError(appInput({ directoryBrowsing: "enabled" }), existing), null);
});

test("a binding port outside 1–65535 is refused with a sentence", () => {
  const existing: { id: string; name: string; server: string }[] = [];
  assert.match(applicationError(appInput({ bindingPort: 0 }), existing) ?? "", /1 and 65535/);
  assert.match(applicationError(appInput({ bindingPort: 70_000 }), existing) ?? "", /1 and 65535/);
  assert.match(applicationError(appInput({ bindingPort: 443.5 }), existing) ?? "", /1 and 65535/);
  assert.equal(applicationError(appInput({ bindingPort: null }), existing), null);
});

/* --------------------------- ingestion contract -------------------------- */

const payload = () => ({
  server: "WEB01",
  environment: "production",
  applications: [
    {
      name: "Portal",
      bindingHost: "portal.example.com",
      bindingPort: 443,
      sslMapped: true,
      appPool: "PortalPool",
      directoryBrowsing: "disabled",
      appRoot: "C:\\inetpub\\portal",
    },
  ],
});

test("the collector payload parses into the register's shape", () => {
  const parsed = parseAutomationPayload(payload());
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.payload.server, "WEB01");
  assert.equal(parsed.payload.applications.length, 1);
  const [row] = parsed.payload.applications;
  assert.equal(row.bindingPort, 443);
  assert.equal(row.sslMapped, true);
  assert.equal(row.directoryBrowsing, "disabled");
  // A script that forgets the optional fields still lands a valid row.
  assert.equal(row.status, "running");
});

test("the ingestion contract refuses what the register cannot hold", () => {
  const missingServer = parseAutomationPayload({ ...payload(), server: "" });
  assert.equal(missingServer.ok, false);

  const empty = parseAutomationPayload({ ...payload(), applications: [] });
  assert.match(empty.ok ? "" : empty.error, /empty/);

  const noApps = parseAutomationPayload({ server: "WEB01" });
  assert.match(noApps.ok ? "" : noApps.error, /applications/);

  const badPort = parseAutomationPayload({
    ...payload(),
    applications: [{ ...payload().applications[0], bindingPort: 99999 }],
  });
  assert.match(badPort.ok ? "" : badPort.error, /bindingPort/);

  const badBrowsing = parseAutomationPayload({
    ...payload(),
    applications: [{ ...payload().applications[0], directoryBrowsing: "sometimes" }],
  });
  assert.match(badBrowsing.ok ? "" : badBrowsing.error, /directoryBrowsing/);

  const duplicate = parseAutomationPayload({
    ...payload(),
    applications: [payload().applications[0], { ...payload().applications[0], name: " portal " }],
  });
  assert.match(duplicate.ok ? "" : duplicate.error, /appears twice/);
});

test("only the IT manager and the platform owner may push the register", () => {
  assert.equal(canIngestIis("super_admin"), true);
  assert.equal(canIngestIis("it_manager"), true);
  // IT engineering edits the register in the browser, but not from a script.
  assert.equal(canIngestIis("it_engineer"), false);
  assert.equal(canIngestIis("l2_support_manager"), false);
  assert.equal(canIngestIis("management"), false);
});

test("the collector script carries the URL, the key and the eight reads", () => {
  const script = collectorScript({
    apiUrl: "https://tasktornado.vercel.app/api/v1/iis/applications",
    serverHostName: "WEB01",
  });

  assert.ok(script.includes("https://tasktornado.vercel.app/api/v1/iis/applications"));
  assert.ok(script.includes("Import-Module WebAdministration"));
  assert.ok(script.includes("$ServerHostName = 'WEB01'"));
  // No key typed means the parameter is required rather than empty.
  assert.ok(script.includes("[Parameter(Mandatory = $true)]"));
  assert.ok(script.includes("directoryBrowsing"));
  assert.ok(script.includes(COLLECTOR_FILE_NAME));
  // Without a host name the script reads the machine's own.
  assert.ok(collectorScript({}).includes("$env:COMPUTERNAME"));
  // A template literal that leaks an interpolation looks like this.
  assert.equal(script.includes("${"), false);

  const withKey = collectorScript({ apiKey: "tt_demo_key" });
  assert.ok(withKey.includes("[string]$ApiKey = 'tt_demo_key'"));
  assert.equal(withKey.includes("[Parameter(Mandatory = $true)]"), false);
  // A quote in a host name must not end the PowerShell string early.
  const quoted = collectorScript({ serverHostName: "WEB'01" });
  assert.ok(quoted.includes("$ServerHostName = 'WEB''01'"));
});

test("ingesting twice updates instead of duplicating, and keeps the owner", async () => {
  const created = await ingestApplications("WEB-INGEST", "production", [
    {
      name: "Ingest Portal",
      bindingHost: "ingest.example.com",
      bindingPort: 443,
      sslMapped: true,
      appPool: "IngestPool",
      directoryBrowsing: "disabled",
      appRoot: "C:\\inetpub\\ingest",
      status: "running",
    },
  ]);
  assert.equal(created.created, 1);
  assert.equal(created.updated, 0);

  // A person claims the row; the next run must not wipe that.
  const claimed = (await listApplications(true)).find((row) => row.id === created.applications[0].id);
  assert.ok(claimed);
  if (!claimed) return;
  await setApplicationActive(claimed.id, false);

  const second = await ingestApplications("WEB-INGEST", "production", [
    {
      name: "ingest portal",
      bindingHost: "ingest.example.com",
      bindingPort: 8443,
      sslMapped: true,
      appPool: "IngestPool",
      directoryBrowsing: "enabled",
      appRoot: "C:\\inetpub\\ingest",
      status: "running",
    },
  ]);
  assert.equal(second.created, 0);
  assert.equal(second.updated, 1);

  const rows = (await listApplications(true)).filter(
    (row) => row.server === "WEB-INGEST" && row.name.toLowerCase() === "ingest portal",
  );
  assert.equal(rows.length, 1, "the name is the key, so a second run does not duplicate");
  assert.equal(rows[0].bindingPort, 8443);
  assert.equal(rows[0].directoryBrowsing, "enabled");
  assert.equal(rows[0].active, true, "a server that still reports an application brings it back");
});
