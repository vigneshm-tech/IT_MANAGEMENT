import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTIVITY_TYPE_SEED,
  activityTypeNameError,
  normaliseActivityTypeName,
} from "../lib/activity-types";

const EXISTING = [
  { id: "AT-1", name: "Patching" },
  { id: "AT-2", name: "Service request" },
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
  assert.equal(activityTypeNameError("Patching", EXISTING, "AT-1"), null);
  assert.match(String(activityTypeNameError("Service request", EXISTING, "AT-1")), /already exists/);
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
