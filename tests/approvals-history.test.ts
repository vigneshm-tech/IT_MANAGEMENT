import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approvalItems,
  itemCounts,
  itemRaisedBy,
  itemsForView,
  patchingItem,
  requestItem,
} from "../lib/approvals/history";
import type { ApprovalRecord } from "../lib/records/repository";
import type { PatchApprover, PatchScheduleRecord } from "../lib/patching/plan";

function approver(
  name: string,
  status: PatchApprover["status"] = "pending",
  decidedAt: string | null = null,
): PatchApprover {
  return {
    approverId: `u-${name.toLowerCase()}`,
    approverName: name,
    status,
    verificationName: status === "approved" ? `${name} verified` : "",
    note: "",
    decidedAt,
  };
}

function plan(
  id: string,
  approvers: PatchApprover[],
  overrides: Partial<PatchScheduleRecord> = {},
): PatchScheduleRecord {
  return {
    id,
    endpointId: `ep-${id}`,
    endpointName: `SRV-${id}`,
    missingCount: 4,
    otherCount: 1,
    plannedDate: "2026-11-21",
    handlerId: "u-handler",
    handlerName: "Handler",
    approvers,
    outcome: "pending",
    outcomeByName: "",
    outcomeAt: null,
    note: "",
    createdByName: "Shaik Mohamed",
    createdById: "u-shaik",
    createdAt: "2026-11-18T09:00:00.000Z",
    updatedAt: "2026-11-18T09:00:00.000Z",
    ...overrides,
  };
}

function approval(id: string, overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id,
    title: `Request ${id}`,
    category: "access",
    requesterId: "u-arun",
    requesterName: "Arun Prakash",
    requesterRole: "it_engineer",
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    note: "",
    createdAt: "2026-11-10T10:00:00.000Z",
    ...overrides,
  };
}

const SHAIK = { id: "u-shaik", name: "Shaik Mohamed" };

test("a signed-off plan reads as an approved item, with who signed it", () => {
  const item = patchingItem(
    plan("PS-2", [
      approver("Shaik Mohamed", "approved", "2026-11-20T04:16:39.747Z"),
      approver("Meera Raghavan", "approved", "2026-11-20T05:00:00.000Z"),
    ]),
  );

  assert.equal(item.kind, "patching");
  assert.equal(item.type, "Patching");
  assert.equal(item.title, "SRV-PS-2");
  assert.equal(item.status, "approved");
  assert.equal(item.decidedBy, "Shaik Mohamed, Meera Raghavan");
  // The latest decision is the one the date column shows.
  assert.equal(item.decidedAt, "2026-11-20T05:00:00.000Z");
  assert.equal(item.requester, "Shaik Mohamed");
  assert.equal(item.href, "/modules/patching");
});

test("one rejection sinks the plan, and only the rejecting approvers are named", () => {
  const item = patchingItem(
    plan("PS-3", [
      approver("Shaik Mohamed", "approved", "2026-11-20T04:00:00.000Z"),
      approver("Meera Raghavan", "rejected", "2026-11-20T06:00:00.000Z"),
    ]),
  );
  assert.equal(item.status, "rejected");
  assert.equal(item.decidedBy, "Meera Raghavan");
  assert.equal(item.decidedAt, "2026-11-20T06:00:00.000Z");
});

test("a plan still waiting has nobody to credit", () => {
  const item = patchingItem(plan("PS-4", [approver("Shaik Mohamed")]));
  assert.equal(item.status, "pending");
  assert.equal(item.decidedBy, "—");
  assert.equal(item.decidedAt, null);
});

test("a request carries its type and requester role", () => {
  const item = requestItem(approval("AP-1", { status: "approved", decidedBy: "Ramesh", decidedAt: "2026-11-12T10:00:00.000Z" }));
  assert.equal(item.kind, "request");
  assert.equal(item.type, "Access");
  assert.equal(item.requesterDetail, "Arun Prakash · IT Engineer");
  assert.equal(item.status, "approved");
  assert.equal(item.decidedBy, "Ramesh");
});

test("the approved tab lists requests and patch plans together", () => {
  const items = approvalItems(
    [approval("AP-3", { status: "approved", createdAt: "2026-11-09T10:00:00.000Z" })],
    [plan("PS-2", [approver("Shaik Mohamed", "approved", "2026-11-20T04:16:39.747Z")])],
  );

  const approved = itemsForView(items, "approved", SHAIK);
  assert.deepEqual(
    approved.map((item) => item.id),
    ["PS-2", "AP-3"],
  );
});

test("requested holds the plans this person scheduled as well as their requests", () => {
  const items = approvalItems(
    [
      approval("AP-1", { requesterId: "u-shaik", requesterName: "Shaik Mohamed" }),
      approval("AP-2", { requesterId: "u-arun", requesterName: "Arun Prakash" }),
    ],
    [
      plan("PS-2", [approver("Shaik Mohamed", "approved", "2026-11-20T04:16:39.747Z")]),
      plan("PS-9", [approver("Shaik Mohamed")], { createdById: "u-other", createdByName: "Someone Else" }),
    ],
  );

  const requested = itemsForView(items, "requested", SHAIK).map((item) => item.id).sort();
  assert.deepEqual(requested, ["AP-1", "PS-2"]);
});

test("a plan with no creator id falls back to the name on the row", () => {
  const item = patchingItem(
    plan("PS-5", [approver("Shaik Mohamed", "approved", "2026-11-20T04:16:39.747Z")], {
      createdById: null,
    }),
  );
  assert.equal(itemRaisedBy(item, SHAIK), true);
  assert.equal(itemRaisedBy(item, { id: "u-arun", name: "Arun Prakash" }), false);
});

test("counts cover both ledgers, and received stays the request inbox", () => {
  const items = approvalItems(
    [approval("AP-1"), approval("AP-2", { status: "approved" }), approval("AP-3", { status: "rejected" })],
    [
      plan("PS-2", [approver("Shaik Mohamed", "approved", "2026-11-20T04:16:39.747Z")]),
      plan("PS-4", [approver("Shaik Mohamed")]),
    ],
  );

  const counts = itemCounts(items, SHAIK, 1);
  // One pending request plus the one plan drawn as a sign-off card above it.
  assert.equal(counts.received, 2);
  assert.equal(counts.approved, 2);
  assert.equal(counts.rejected, 1);
  // Both plans were scheduled by Shaik; none of the requests were his.
  assert.equal(counts.requested, 2);
});
