import test from "node:test";
import assert from "node:assert/strict";
import { assertCanCreateTask, taskWindowFor } from "../lib/task-window";

// Asia/Kolkata is UTC+05:30 with no DST.
const at = (iso: string) => new Date(iso);

test("engineer window is closed at 08:59 IST", () => {
  const window = taskWindowFor("l2_support_engineer", at("2026-11-19T03:29:00Z"));
  assert.equal(window.canCreate, false);
  assert.equal(window.restricted, true);
  assert.equal(window.opensAt, "2026-11-19T03:30:00.000Z"); // 09:00 IST
});

test("engineer window opens exactly at 09:00 IST", () => {
  const window = taskWindowFor("l2_support_engineer", at("2026-11-19T03:30:00Z"));
  assert.equal(window.canCreate, true);
  assert.equal(window.opensAt, "2026-11-19T03:30:00.000Z");
  assert.equal(window.closesAt, "2026-11-19T12:30:00.000Z"); // 18:00 IST
});

test("engineer window is open at 17:59 IST", () => {
  const window = taskWindowFor("testing_engineer", at("2026-11-19T12:29:00Z"));
  assert.equal(window.canCreate, true);
});

test("engineer window closes at 18:00 IST and reopens next day", () => {
  const window = taskWindowFor("testing_engineer", at("2026-11-19T12:30:00Z"));
  assert.equal(window.canCreate, false);
  assert.equal(window.opensAt, "2026-11-20T03:30:00.000Z");
  assert.equal(window.closesAt, "2026-11-20T12:30:00.000Z");
  assert.equal(window.nextChangeAt, "2026-11-20T03:30:00.000Z");
});

test("leadership bypasses the window at any hour", () => {
  for (const role of ["it_manager", "l2_support_lead", "development_manager", "management"] as const) {
    const window = taskWindowFor(role, at("2026-11-19T20:00:00Z"));
    assert.equal(window.canCreate, true, role);
    assert.equal(window.restricted, false, role);
    assert.equal(window.nextChangeAt, null, role);
  }
});

test("the guard throws for engineers outside hours", () => {
  assert.throws(
    () => assertCanCreateTask("implementation_engineer", at("2026-11-19T02:00:00Z")),
    /Engineer task creation/,
  );
  assert.doesNotThrow(() =>
    assertCanCreateTask("implementation_engineer", at("2026-11-19T06:00:00Z")),
  );
  assert.doesNotThrow(() => assertCanCreateTask("it_manager", at("2026-11-19T02:00:00Z")));
});

test("missing/invalid role ids are not time-boxed by accident", () => {
  const window = taskWindowFor("management", at("2026-11-19T23:59:00Z"));
  assert.equal(window.canCreate, true);
  assert.equal(window.timeZone, "Asia/Kolkata");
});
