import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applicationError,
  backupOverdue,
  createApplication,
  createDatabase,
  databaseError,
  deleteApplication,
  describeBackup,
  listApplications,
  listDatabases,
  setApplicationActive,
  summariseApplications,
  summariseDatabases,
  updateDatabase,
  type ApplicationInput,
  type DatabaseInput,
  type IisDatabase,
} from "../lib/iis/repository";
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
  appPool: "BillingPool",
  binding: "https://billing.example.com",
  framework: ".NET 8",
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
    { id: "1", name: "A", server: "", environment: "production", appPool: "", binding: "", framework: "", owner: "", status: "stopped", notes: "", active: true, createdAt: "", updatedAt: "" },
    { id: "2", name: "B", server: "", environment: "production", appPool: "", binding: "", framework: "", owner: "", status: "stopped", notes: "", active: false, createdAt: "", updatedAt: "" },
    { id: "3", name: "C", server: "", environment: "staging", appPool: "", binding: "", framework: "", owner: "", status: "running", notes: "", active: true, createdAt: "", updatedAt: "" },
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
