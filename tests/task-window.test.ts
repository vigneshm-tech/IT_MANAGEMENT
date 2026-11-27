import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCanCreateTask,
  clockMinutes,
  formatClock,
  taskWindowFor,
  taskWindowSettings,
} from "../lib/task-window";

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

/* -------------------------------------------------------------------------- */
/*  Per-user enrolment windows                                                */
/* -------------------------------------------------------------------------- */

const morning = { startMinute: 7 * 60, endMinute: 13 * 60 }; // 07:00–13:00 IST

test("a personal window replaces office hours for that person", () => {
  // 06:30 IST — inside office hours is irrelevant: their window opens at 07:00.
  const before = taskWindowFor("l2_support_engineer", at("2026-11-19T01:00:00Z"), morning);
  assert.equal(before.canCreate, false);
  assert.equal(before.personal, true);
  assert.equal(before.label, "07:00–13:00");
  assert.match(before.message, /Your task window opens at 07:00 IST/);

  // 07:00 IST exactly.
  const open = taskWindowFor("l2_support_engineer", at("2026-11-19T01:30:00Z"), morning);
  assert.equal(open.canCreate, true);
  assert.equal(open.closesAt, "2026-11-19T07:30:00.000Z"); // 13:00 IST

  // 14:00 IST — office hours would still be open, their window is not.
  const closed = taskWindowFor("l2_support_engineer", at("2026-11-19T08:30:00Z"), morning);
  assert.equal(closed.canCreate, false);
  assert.equal(closed.opensAt, "2026-11-20T01:30:00.000Z");
});

test("a personal window holds leadership to it too", () => {
  const window = taskWindowFor("it_manager", at("2026-11-19T20:00:00Z"), morning);
  assert.equal(window.personal, true);
  assert.equal(window.restricted, true);
  assert.equal(window.canCreate, false);
  assert.equal(window.nextChangeAt, "2026-11-20T01:30:00.000Z");
});

test("a personal guard throws with the person's own hours", () => {
  // 19:30 IST — closed for today, so the message says when it reopens.
  assert.throws(
    () => assertCanCreateTask("testing_engineer", at("2026-11-19T14:00:00Z"), morning),
    /Your task window is closed for today — it reopens at 07:00 IST/,
  );
  // 06:30 IST — before it opens.
  assert.throws(
    () => assertCanCreateTask("testing_engineer", at("2026-11-19T01:00:00Z"), morning),
    /Your task window opens at 07:00 IST/,
  );
  assert.doesNotThrow(() =>
    assertCanCreateTask("testing_engineer", at("2026-11-19T04:00:00Z"), morning),
  );
});

test("without a personal window nothing changes", () => {
  const window = taskWindowFor("l2_support_engineer", at("2026-11-19T04:00:00Z"), null);
  assert.equal(window.personal, false);
  assert.equal(window.canCreate, true);
  assert.equal(window.label, "09:00–18:00");
});

test("clock parsing only accepts real times of day", () => {
  assert.equal(clockMinutes("09:30"), 570);
  assert.equal(clockMinutes("09:30:00"), 570);
  assert.equal(clockMinutes("7:05"), 425);
  assert.equal(clockMinutes("24:00"), null);
  assert.equal(clockMinutes("09:60"), null);
  assert.equal(clockMinutes("9:5"), null);
  assert.equal(clockMinutes("morning"), null);
  assert.equal(clockMinutes(null), null);
  assert.equal(formatClock(570), "09:30");
  assert.equal(formatClock(0), "00:00");
});

test("a window that does not run forwards is refused, not corrected", () => {
  assert.deepEqual(taskWindowSettings("09:00", "18:00"), {
    startMinute: 540,
    endMinute: 1080,
  });
  assert.equal(taskWindowSettings("18:00", "09:00"), null);
  assert.equal(taskWindowSettings("09:00", "09:00"), null);
  assert.equal(taskWindowSettings("09:00", ""), null);
  assert.equal(taskWindowSettings(null, null), null);
});
