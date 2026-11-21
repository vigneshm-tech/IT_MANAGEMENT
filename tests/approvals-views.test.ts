import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APPROVAL_VIEWS,
  approvalView,
  approvalViewCounts,
  approvalViewMeta,
  approvalsForView,
  approvalViewsFor,
  isApprovalView,
  raisedBy,
} from "../lib/approvals/views";
import type { ApprovalRecord } from "../lib/records/repository";

function approval(
  id: string,
  overrides: Partial<ApprovalRecord> = {},
): ApprovalRecord {
  return {
    id,
    title: `Request ${id}`,
    category: "access",
    requesterId: "u-it-engineer",
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

const ME = { id: "u-it-engineer", name: "Arun Prakash" };

const LIST: ApprovalRecord[] = [
  approval("AP-1", { createdAt: "2026-11-12T10:00:00.000Z" }),
  approval("AP-2", { createdAt: "2026-11-10T10:00:00.000Z" }),
  approval("AP-3", {
    requesterId: "u-dev-lead",
    requesterName: "Sneha Pillai",
    status: "approved",
    decidedBy: "Ramesh Subramanian",
    decidedAt: "2026-11-14T10:00:00.000Z",
    createdAt: "2026-11-09T10:00:00.000Z",
  }),
  approval("AP-4", {
    requesterId: "u-dev-lead",
    requesterName: "Sneha Pillai",
    status: "rejected",
    decidedBy: "Meera Raghavan",
    decidedAt: "2026-11-13T10:00:00.000Z",
    createdAt: "2026-11-08T10:00:00.000Z",
  }),
  approval("AP-5", {
    requesterId: null,
    requesterName: "Arun Prakash",
    status: "approved",
    decidedBy: "Meera Raghavan",
    decidedAt: "2026-11-11T10:00:00.000Z",
    createdAt: "2026-11-07T10:00:00.000Z",
  }),
];

test("an unknown or missing view falls back to the inbox", () => {
  assert.equal(approvalView(undefined), "received");
  assert.equal(approvalView("everything"), "received");
  assert.equal(approvalView("requested"), "requested");
  assert.ok(isApprovalView("approved"));
  assert.equal(isApprovalView("pending"), false);
});

test("every view carries a label and a description for the tab row", () => {
  assert.deepEqual(
    APPROVAL_VIEWS.map((view) => view.id),
    ["received", "requested", "approved", "rejected"],
  );
  for (const view of APPROVAL_VIEWS) {
    assert.ok(view.label.length > 0);
    assert.ok(view.blurb.length > 0);
    assert.equal(approvalViewMeta(view.id).label, view.label);
  }
});

test("a request is mine when the id matches, or the name does on older rows", () => {
  assert.equal(raisedBy(approval("AP-1"), ME), true);
  assert.equal(raisedBy(approval("AP-1", { requesterId: "u-dev-lead" }), ME), false);
  // Rows written before the requester id was carried over only have a name.
  assert.equal(raisedBy(approval("AP-9", { requesterId: null }), ME), true);
  assert.equal(
    raisedBy(approval("AP-9", { requesterId: null, requesterName: "someone else" }), ME),
    false,
  );
});

test("received is the open inbox, oldest first", () => {
  const received = approvalsForView(LIST, "received", ME);
  assert.deepEqual(
    received.map((item) => item.id),
    ["AP-2", "AP-1"],
  );
});

test("requested is everything I raised, decided or not, newest first", () => {
  const requested = approvalsForView(LIST, "requested", ME);
  assert.deepEqual(
    requested.map((item) => item.id),
    ["AP-1", "AP-2", "AP-5"],
  );
  assert.equal(requested.filter((item) => item.status === "approved").length, 1);
});

test("approved and rejected hold only decided requests", () => {
  assert.deepEqual(
    approvalsForView(LIST, "approved", ME).map((item) => item.id),
    ["AP-3", "AP-5"],
  );
  assert.deepEqual(
    approvalsForView(LIST, "rejected", ME).map((item) => item.id),
    ["AP-4"],
  );
});

test("the tab counts include patch sign-offs in received", () => {
  assert.deepEqual(approvalViewCounts(LIST, ME), {
    received: 2,
    requested: 3,
    approved: 2,
    rejected: 1,
  });
  assert.equal(approvalViewCounts(LIST, ME, 2).received, 4);
});

test("a reader who cannot decide has no inbox tab", () => {
  assert.deepEqual(
    approvalViewsFor(false).map((view) => view.id),
    ["requested", "approved", "rejected"],
  );
  assert.deepEqual(
    approvalViewsFor(true).map((view) => view.id),
    ["received", "requested", "approved", "rejected"],
  );
});
