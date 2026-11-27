import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTIVITY_TYPE_SEED,
  ACTIVITY_MODULE_OPTIONS,
  activityTypeModuleError,
  activityTypeNameError,
  activityModuleLabel,
  normaliseActivityTypeName,
} from "../lib/activity-types";

const EXISTING = [
  { id: "AT-1", name: "Patching", module: "tasks" },
  { id: "AT-2", name: "Service request", module: "tasks" },
  { id: "AT-3", name: "Service request", module: "tickets" },
];

test("names are trimmed and inner whitespace is collapsed", () => {
  assert.equal(normaliseActivityTypeName("  Patching   window "), "Patching window");
  assert.equal(normaliseActivityTypeName("\tIncident\n"), "Incident");
});

test("a usable name returns no error", () => {
  assert.equal(activityTypeNameError("Vulnerability remediation", EXISTING), null);
});

test("names shorter than 2 or longer than 60 characters are rejected", () => {
  assert.match(String(activityTypeNameError(" a ", EXISTING)), /at least 2/);
  assert.match(String(activityTypeNameError("x".repeat(61), EXISTING)), /under 60/);
});

test("duplicates are rejected regardless of case or spacing", () => {
  assert.match(String(activityTypeNameError("  patching ", EXISTING)), /already exists/);
  assert.match(String(activityTypeNameError("SERVICE REQUEST", EXISTING)), /already exists/);
});

test("the row being renamed does not collide with itself", () => {
  assert.equal(activityTypeNameError("Patching", EXISTING, { ignoreId: "AT-1" }), null);
  assert.match(
    String(activityTypeNameError("Service request", EXISTING, { ignoreId: "AT-1" })),
    /already exists/,
  );
});

test("names only have to be unique inside their module", () => {
  assert.match(
    String(activityTypeNameError("Service request", EXISTING, { module: "tasks" })),
    /already exists for Task Management/,
  );
  assert.match(
    String(activityTypeNameError("Service request", EXISTING, { module: "tickets" })),
    /already exists for Tickets/,
  );
  assert.equal(activityTypeNameError("Service request", EXISTING, { module: "servers" }), null);
});

test("a module must be chosen from the registry", () => {
  assert.match(String(activityTypeModuleError("")), /Choose the module/);
  assert.match(String(activityTypeModuleError("payroll")), /valid module/);
  assert.equal(activityTypeModuleError("tasks"), null);
  assert.equal(activityTypeModuleError("approvals"), null);
});

test("module options are labelled from the registry", () => {
  assert.deepEqual(
    ACTIVITY_MODULE_OPTIONS.map((option) => option.value),
    ["tasks", "tickets", "servers", "patching", "clients", "renewals", "approvals"],
  );
  assert.equal(activityModuleLabel("tasks"), "Task Management");
  assert.equal(activityModuleLabel("patching"), "Patching Plans");
});

test("the seed keeps the previously hard-coded vocabulary", () => {
  assert.deepEqual([...ACTIVITY_TYPE_SEED], [
    "Patching",
    "Incident",
    "Service request",
    "Change request",
    "Preventive maintenance",
    "Onboarding",
    "Audit",
    "Other",
  ]);
});

/* -------------------------------------------------------------------------- */
/*  Repository: renaming an entry and retiring it                             */
/* -------------------------------------------------------------------------- */

test("an existing type can be renamed, moved between modules and deleted", async () => {
  const {
    createActivityType,
    deleteActivityType,
    listActivityTypes,
    setActivityTypeStatus,
    updateActivityType,
  } = await import("../lib/records/repository");

  const user = {
    id: "test-user",
    name: "Test Manager",
    email: "test.manager@tasktornado.dev",
    role: "it_manager",
  } as never;

  const created = await createActivityType(user, "  Vulnerability   window ", "tasks");
  assert.equal(created.name, "Vulnerability window");

  assert.equal(await updateActivityType(created.id, "Security window", "servers"), true);

  const afterRename = (await listActivityTypes()).find((item) => item.id === created.id);
  assert.equal(afterRename?.name, "Security window");
  assert.equal(afterRename?.module, "servers");
  // Renaming keeps the row's identity, so references elsewhere stay intact.
  assert.equal(afterRename?.id, created.id);

  assert.equal(await setActivityTypeStatus(created.id, "inactive"), true);
  assert.equal(
    (await listActivityTypes()).find((item) => item.id === created.id)?.status,
    "inactive",
  );

  assert.equal(await deleteActivityType(created.id), true);
  assert.equal(
    (await listActivityTypes()).find((item) => item.id === created.id),
    undefined,
  );
});
