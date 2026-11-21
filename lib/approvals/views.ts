import type { ApprovalRecord } from "@/lib/records/repository";

/**
 * The four things a person wants from the Approvals screen, in the order they
 * need them: what is waiting on me, what I asked for, and what has already been
 * decided — approved or turned down.
 *
 * Kept as data plus small functions so the page, the tabs and the tests all
 * agree on what "requested" and "received" mean.
 */
export const APPROVAL_VIEWS = [
  {
    id: "received",
    label: "Received",
    blurb: "Requests waiting for your decision.",
    /** Only people who can decide have an inbox. */
    approversOnly: true,
  },
  {
    id: "requested",
    label: "Requested",
    blurb: "Requests you raised, and where they stand.",
    approversOnly: false,
  },
  {
    id: "approved",
    label: "Approved",
    blurb: "Requests that have already been approved.",
    approversOnly: false,
  },
  {
    id: "rejected",
    label: "Rejected",
    blurb: "Requests that were turned down.",
    approversOnly: false,
  },
] as const;

export type ApprovalView = (typeof APPROVAL_VIEWS)[number]["id"];

export function isApprovalView(value: unknown): value is ApprovalView {
  return APPROVAL_VIEWS.some((view) => view.id === value);
}

/** Anything unrecognised falls back to the inbox. */
export function approvalView(value: unknown): ApprovalView {
  return isApprovalView(value) ? value : "received";
}

export function approvalViewMeta(view: ApprovalView) {
  return APPROVAL_VIEWS.find((item) => item.id === view) ?? APPROVAL_VIEWS[0];
}

type Requester = { id: string; name: string };

/**
 * Did this person raise it?
 *
 * Rows carry the requester's id; a request written before that id was mapped
 * only has the name on it, so the name is the fallback rather than dropping
 * those rows out of the tab entirely.
 */
export function raisedBy(approval: ApprovalRecord, user: Requester): boolean {
  if (approval.requesterId) return approval.requesterId === user.id;
  return approval.requesterName.trim().toLowerCase() === user.name.trim().toLowerCase();
}

/** Newest first — history reads backwards; the inbox reads first-come-first-served. */
function byCreatedDescending(a: ApprovalRecord, b: ApprovalRecord) {
  return b.createdAt.localeCompare(a.createdAt);
}

function byCreatedAscending(a: ApprovalRecord, b: ApprovalRecord) {
  return a.createdAt.localeCompare(b.createdAt);
}

export function approvalsForView(
  approvals: ApprovalRecord[],
  view: ApprovalView,
  user: Requester,
): ApprovalRecord[] {
  switch (view) {
    case "received":
      return approvals.filter((approval) => approval.status === "pending").sort(byCreatedAscending);
    case "requested":
      return approvals.filter((approval) => raisedBy(approval, user)).sort(byCreatedDescending);
    case "approved":
      return approvals.filter((approval) => approval.status === "approved").sort(byCreatedDescending);
    case "rejected":
      return approvals.filter((approval) => approval.status === "rejected").sort(byCreatedDescending);
  }
}

export type ApprovalViewCounts = Record<ApprovalView, number>;

/**
 * Counts for the tabs. `receivedExtra` is the patch sign-offs, which are
 * received work too even though they live in their own table.
 */
export function approvalViewCounts(
  approvals: ApprovalRecord[],
  user: Requester,
  receivedExtra = 0,
): ApprovalViewCounts {
  return {
    received: approvals.filter((approval) => approval.status === "pending").length + receivedExtra,
    requested: approvals.filter((approval) => raisedBy(approval, user)).length,
    approved: approvals.filter((approval) => approval.status === "approved").length,
    rejected: approvals.filter((approval) => approval.status === "rejected").length,
  };
}

/** The tabs this person should see — the inbox is only for deciders. */
export function approvalViewsFor(canApprove: boolean) {
  return APPROVAL_VIEWS.filter((view) => !view.approversOnly || canApprove);
}
