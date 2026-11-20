import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PATCH_APPROVERS_MAX,
  PATCH_ENDPOINTS_MAX,
  PATCH_OUTCOMES,
  PATCH_OUTCOME_LABEL,
  PATCH_OUTCOME_TONE,
  isPatchOutcome,
  approvedByName,
  decodeEndpoints,
  decisionError,
  encodeEndpoints,
  formatPlannedDate,
  isApprover,
  myDecision,
  pendingApproverNames,
  pendingForApprover,
  outcomeError,
  planStatus,
  plannedDateError,
  plannedRangeError,
  plannedRangeLabel,
  withinPlannedRange,
  schedulePlanError,
  todayInIndia,
  verificationNames,
  rejectedByName,
  type PatchApprover,
  type PatchScheduleRecord,
} from "../lib/patching/plan";

function approver(name: string, status: PatchApprover["status"] = "pending"): PatchApprover {
  return {
    approverId: `usr-${name.toLowerCase()}`,
    approverName: name,
    status,
    verificationName: status === "approved" ? `${name} verified` : "",
    note: "",
    decidedAt: status === "pending" ? null : "2026-11-19T10:00:00.000Z",
  };
}

/* -------------------------------------------------------------------------- */
/*  Status                                                                    */
/* -------------------------------------------------------------------------- */

test("a plan is pending until every approver has decided", () => {
  assert.equal(planStatus([approver("Asha"), approver("Ravi")]), "pending");
  assert.equal(planStatus([approver("Asha", "approved"), approver("Ravi")]), "pending");
  assert.equal(planStatus([approver("Asha", "approved"), approver("Ravi", "approved")]), "approved");
});

test("one rejection sinks the plan even after an approval", () => {
  const approvers = [approver("Asha", "approved"), approver("Ravi", "rejected")];
  assert.equal(planStatus(approvers), "rejected");
  assert.equal(approvedByName(approvers), "Asha");
  assert.equal(rejectedByName(approvers), "Ravi");
});

test("the report reads the sign-off names from the decisions", () => {
  const approvers = [approver("Asha", "approved"), approver("Ravi"), approver("Meera", "approved")];
  assert.equal(approvedByName(approvers), "Asha, Meera");
  assert.equal(pendingApproverNames(approvers), "Ravi");
  assert.equal(verificationNames(approvers), "Asha verified, Meera verified");
  assert.equal(approvedByName([approver("Asha")]), "—");
  assert.equal(verificationNames([]), "—");
});

test("the same verifier named twice is printed once", () => {
  const approvers = [
    { ...approver("Asha", "approved"), verificationName: "Meera" },
    { ...approver("Ravi", "approved"), verificationName: "Meera" },
  ];
  assert.equal(verificationNames(approvers), "Meera");
});

test("only a named approver can decide, and their state is readable", () => {
  const approvers = [approver("Asha", "approved"), approver("Ravi")];
  assert.equal(isApprover(approvers, "usr-ravi"), true);
  assert.equal(isApprover(approvers, "usr-other"), false);
  assert.equal(myDecision(approvers, "usr-ravi"), "pending");
  assert.equal(myDecision(approvers, "usr-other"), null);
});

/* -------------------------------------------------------------------------- */
/*  Dates                                                                     */
/* -------------------------------------------------------------------------- */

test("today is an IST date whatever the machine clock says", () => {
  // 20 Nov 2026 02:26 UTC is already 07:56 on the 20th in India.
  assert.equal(todayInIndia(new Date("2026-11-20T02:26:00Z")), "2026-11-20");
  // 19 Nov 2026 20:00 UTC is 01:30 on the 20th in India.
  assert.equal(todayInIndia(new Date("2026-11-19T20:00:00Z")), "2026-11-20");
});

test("a planned date must exist, parse and not be in the past", () => {
  const today = "2026-11-19";
  assert.match(plannedDateError("", today) ?? "", /Choose the date/);
  assert.match(plannedDateError("19-11-2026", today) ?? "", /YYYY-MM-DD/);
  assert.match(plannedDateError("2026-11-18", today) ?? "", /cannot be in the past/);
  assert.equal(plannedDateError("2026-11-19", today), null);
  assert.equal(plannedDateError("2026-12-01", today), null);
});

test("the printed date is the same wording everywhere", () => {
  assert.equal(formatPlannedDate("2026-11-19"), "19 Nov 2026");
  assert.equal(formatPlannedDate(""), "—");
});

/* -------------------------------------------------------------------------- */
/*  Selection posted by the page                                              */
/* -------------------------------------------------------------------------- */

test("the endpoint selection survives the round trip", () => {
  const list = [
    { id: "ep-1", name: "ACME-SRV01", missing: 7, other: 3 },
    { id: "ep-2", name: "ACME-SRV02", missing: 0, other: 1 },
  ];
  assert.deepEqual(decodeEndpoints(encodeEndpoints(list)), list);
});

test("malformed or empty selections simply select nothing", () => {
  assert.deepEqual(decodeEndpoints(""), []);
  assert.deepEqual(decodeEndpoints("{not json"), []);
  assert.deepEqual(decodeEndpoints(JSON.stringify([{ id: "", name: "x" }])), []);
  assert.deepEqual(
    decodeEndpoints(JSON.stringify([{ id: "ep-1", name: "A", missing: -4 }]))[0].missing,
    0,
  );
});

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

test("a schedule needs an endpoint, a future date, a handler and approvers", () => {
  const base = {
    endpoints: [{ id: "ep-1", name: "ACME-SRV01", missing: 2, other: 0 }],
    plannedDate: "2026-12-01",
    handlerId: "usr-handler",
    approverIds: ["usr-asha"],
  };

  assert.equal(schedulePlanError(base), null);
  assert.match(schedulePlanError({ ...base, endpoints: [] }) ?? "", /at least one endpoint/);
  assert.match(schedulePlanError({ ...base, plannedDate: "" }) ?? "", /Choose the date/);
  assert.match(schedulePlanError({ ...base, handlerId: "" }) ?? "", /IT member/);
  assert.match(schedulePlanError({ ...base, approverIds: [] }) ?? "", /at least one approver/);
});

test("the bulk limits hold", () => {
  const endpoints = Array.from({ length: PATCH_ENDPOINTS_MAX + 1 }, (_, index) => ({
    id: `ep-${index}`,
    name: `SRV-${index}`,
    missing: 0,
    other: 0,
  }));
  const approvers = Array.from({ length: PATCH_APPROVERS_MAX + 1 }, (_, index) => `usr-${index}`);

  assert.match(
    schedulePlanError({
      endpoints,
      plannedDate: "2026-12-01",
      handlerId: "usr-handler",
      approverIds: approvers,
    }) ?? "",
    /at most 25 endpoints/,
  );

  assert.match(
    schedulePlanError({
      endpoints: endpoints.slice(0, 1),
      plannedDate: "2026-12-01",
      handlerId: "usr-handler",
      approverIds: approvers,
    }) ?? "",
    /at most 10 approvers/,
  );
});

test("approving requires the person who verified the patching; rejecting does not", () => {
  assert.match(
    decisionError({ decision: "approve", verificationName: "" }) ?? "",
    /verified/,
  );
  assert.equal(decisionError({ decision: "approve", verificationName: "usr-meera" }), null);
  assert.equal(decisionError({ decision: "reject", verificationName: "" }), null);
  assert.match(decisionError({ decision: "later", verificationName: "" }) ?? "", /approve or reject/);
});

/* -------------------------------------------------------------------------- */
/*  Planned-date range filter                                                 */
/* -------------------------------------------------------------------------- */

test("the range filter keeps plans inside the window and drops the rest", () => {
  assert.equal(withinPlannedRange("2026-11-19", "2026-11-01", "2026-11-30"), true);
  // Both ends are inclusive — a plan on the boundary is in the window.
  assert.equal(withinPlannedRange("2026-11-01", "2026-11-01", "2026-11-30"), true);
  assert.equal(withinPlannedRange("2026-11-30", "2026-11-01", "2026-11-30"), true);
  assert.equal(withinPlannedRange("2026-10-31", "2026-11-01", "2026-11-30"), false);
  assert.equal(withinPlannedRange("2026-12-01", "2026-11-01", "2026-11-30"), false);
});

test("either end of the range can be left open", () => {
  assert.equal(withinPlannedRange("2026-12-24", "2026-11-01", ""), true);
  assert.equal(withinPlannedRange("2026-10-01", "2026-11-01", ""), false);
  assert.equal(withinPlannedRange("2026-12-24", "", "2026-12-31"), true);
  assert.equal(withinPlannedRange("2027-01-02", "", "2026-12-31"), false);
  // No range at all keeps everything, and an unscheduled row has no date to match.
  assert.equal(withinPlannedRange("2026-12-24", "", ""), true);
  assert.equal(withinPlannedRange("", "2026-11-01", "2026-11-30"), false);
});

test("a backwards range is reported, not silently empty", () => {
  assert.equal(plannedRangeError("2026-11-01", "2026-11-30"), null);
  assert.equal(plannedRangeError("2026-11-01", ""), null);
  assert.match(plannedRangeError("2026-12-01", "2026-11-30") ?? "", /after/);
});

test("the filter names the window it applied", () => {
  assert.equal(plannedRangeLabel("", ""), "All dates");
  assert.equal(plannedRangeLabel("2026-11-01", "2026-11-30"), "01 Nov 2026 – 30 Nov 2026");
  assert.equal(plannedRangeLabel("2026-11-01", ""), "From 01 Nov 2026");
  assert.equal(plannedRangeLabel("", "2026-11-30"), "Until 30 Nov 2026");
});

/* -------------------------------------------------------------------------- */
/*  Update status                                                             */
/* -------------------------------------------------------------------------- */

test("only success, failed and partial are real results; empty resets to not run", () => {
  assert.deepEqual(PATCH_OUTCOMES, ["pending", "success", "failed", "partial"]);
  assert.equal(isPatchOutcome("success"), true);
  assert.equal(isPatchOutcome("partial"), true);
  assert.equal(isPatchOutcome("failed"), true);
  assert.equal(isPatchOutcome("done"), false);
  assert.equal(outcomeError("success"), null);
  assert.equal(outcomeError(""), null);
  assert.match(outcomeError("half way") ?? "", /success, failed or partial/);
});

test("each result reads and colours the same way in the table and the report", () => {
  assert.equal(PATCH_OUTCOME_LABEL.success, "Success");
  assert.equal(PATCH_OUTCOME_LABEL.failed, "Failed");
  assert.equal(PATCH_OUTCOME_LABEL.partial, "Partial update");
  assert.equal(PATCH_OUTCOME_LABEL.pending, "Not run");
  assert.equal(PATCH_OUTCOME_TONE.success, "positive");
  assert.equal(PATCH_OUTCOME_TONE.failed, "danger");
  assert.equal(PATCH_OUTCOME_TONE.partial, "pending");
  assert.equal(PATCH_OUTCOME_TONE.pending, "neutral");
});

/* -------------------------------------------------------------------------- */
/*  The approver's inbox                                                      */
/* -------------------------------------------------------------------------- */

function plan(id: string, approvers: PatchApprover[], plannedDate = "2026-11-20"): PatchScheduleRecord {
  return {
    id,
    endpointId: `ep-${id}`,
    endpointName: `SRV-${id}`,
    missingCount: 3,
    otherCount: 1,
    plannedDate,
    handlerId: "usr-handler",
    handlerName: "Handler",
    approvers,
    outcome: "pending",
    outcomeByName: "",
    outcomeAt: null,
    note: "",
    createdByName: "Ravi",
    createdAt: "2026-11-18T09:00:00.000Z",
    updatedAt: "2026-11-18T09:00:00.000Z",
  };
}

test("the inbox holds the plans still waiting on that person", () => {
  const schedules = [
    plan("1", [approver("Asha"), approver("Ravi")]),
    plan("2", [approver("Asha", "approved"), approver("Ravi")]),
    plan("3", [approver("Asha")]),
  ];

  // Asha has decided on plan 2, so only 1 and 3 wait for her.
  assert.deepEqual(
    pendingForApprover(schedules, "usr-asha").map((item) => item.id),
    ["1", "3"],
  );
  // Someone who was never named gets nothing — this is the bug being fixed:
  // a plan used to be invisible unless you opened Patching Plans.
  assert.deepEqual(pendingForApprover(schedules, "usr-nobody"), []);
  assert.deepEqual(pendingForApprover(schedules, ""), []);
});

test("a plan someone else rejected leaves the remaining inboxes", () => {
  const schedules = [
    plan("1", [approver("Asha"), approver("Ravi", "rejected")]),
    plan("2", [approver("Asha"), approver("Ravi")]),
  ];
  // Ravi's rejection settles plan 1, so Asha is no longer asked about it.
  assert.deepEqual(
    pendingForApprover(schedules, "usr-asha").map((item) => item.id),
    ["2"],
  );
});

test("the inbox is ordered by the date the patching is planned for", () => {
  const schedules = [
    plan("late", [approver("Asha")], "2026-12-09"),
    plan("soon", [approver("Asha")], "2026-11-21"),
  ];
  assert.deepEqual(
    pendingForApprover(schedules, "usr-asha").map((item) => item.id),
    ["soon", "late"],
  );
});
