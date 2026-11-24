import { planStatus, type PatchScheduleRecord } from "@/lib/patching/plan";
import { roleOf } from "@/lib/roles";
import { requestTypeLabel } from "@/lib/request-types";
import type { ApprovalRecord } from "@/lib/records/repository";
import type { ApprovalView } from "./views";

/**
 * One ledger for both kinds of approval.
 *
 * A request raised on this screen and a patch plan waiting for a sign-off are
 * the same thing to the person who has to act on them — and, once decided, the
 * same thing to the person looking for what happened. The Approved tab used to
 * list only requests, so the two patch plans someone had just signed off never
 * showed up there at all. This module turns both into one shape.
 */

export type ApprovalKind = "request" | "patching";
export type ApprovalItemStatus = "pending" | "approved" | "rejected";

export type ApprovalItem = {
  id: string;
  kind: ApprovalKind;
  /** "Request" or "Patching" — the Type column says which ledger it came from. */
  type: string;
  title: string;
  requester: string;
  /** "Sneha Pillai · Development Lead" for a request, the name alone for a plan. */
  requesterDetail: string;
  requesterId: string | null;
  createdAt: string;
  status: ApprovalItemStatus;
  /** Who decided it, or "—" while it is open. */
  decidedBy: string;
  decidedAt: string | null;
  /** Where to go to look at it. */
  href: string;
};

function names(values: string[]): string;
function names(values: string[], fallback: string): string;
function names(values: string[], fallback = "—") {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.join(", ") : fallback;
}

/**
 * `labels` is the request type register (id → name); without it an id is
 * humanised, so history never renders a blank Type cell.
 */
export function requestItem(
  approval: ApprovalRecord,
  labels: Record<string, string> = {},
): ApprovalItem {
  return {
    id: approval.id,
    kind: "request",
    type: labels[approval.category] ?? requestTypeLabel(approval.category),
    title: approval.title,
    requester: approval.requesterName,
    requesterDetail: `${approval.requesterName} · ${roleOf(approval.requesterRole).label}`,
    requesterId: approval.requesterId,
    createdAt: approval.createdAt,
    status: approval.status,
    decidedBy: approval.decidedBy ?? "—",
    decidedAt: approval.decidedAt,
    href: "/modules/approvals",
  };
}

/** A plan's verdict is the verdict of its approvers, decided or not. */
export function patchingItem(plan: PatchScheduleRecord): ApprovalItem {
  const status = planStatus(plan.approvers);
  const decided = plan.approvers.filter(
    (approver) => approver.status !== "pending" && approver.status === status,
  );
  const decidedAt = decided
    .map((approver) => approver.decidedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    id: plan.id,
    kind: "patching",
    type: "Patching",
    title: plan.endpointName,
    requester: plan.createdByName,
    requesterDetail: plan.createdByName || "—",
    requesterId: plan.createdById,
    createdAt: plan.createdAt,
    status,
    decidedBy: status === "pending" ? "—" : names(decided.map((approver) => approver.approverName)),
    decidedAt: decidedAt ?? null,
    href: "/modules/patching",
  };
}

export function approvalItems(
  requests: ApprovalRecord[],
  plans: PatchScheduleRecord[],
  labels: Record<string, string> = {},
): ApprovalItem[] {
  return [...requests.map((request) => requestItem(request, labels)), ...plans.map(patchingItem)];
}

type Person = { id: string; name: string };

/**
 * Did this person raise it? By id where the row carries one; rows written before
 * the id was mapped only have a name, so the name is the fallback.
 */
export function itemRaisedBy(item: ApprovalItem, user: Person): boolean {
  if (item.requesterId) return item.requesterId === user.id;
  return item.requester.trim().toLowerCase() === user.name.trim().toLowerCase();
}

const newestFirst = (a: ApprovalItem, b: ApprovalItem) => b.createdAt.localeCompare(a.createdAt);
const oldestFirst = (a: ApprovalItem, b: ApprovalItem) => a.createdAt.localeCompare(b.createdAt);

/** Received is the open inbox (oldest first); the rest read newest first. */
export function itemsForView(
  items: ApprovalItem[],
  view: ApprovalView,
  user: Person,
): ApprovalItem[] {
  switch (view) {
    case "received":
      return items.filter((item) => item.status === "pending").sort(oldestFirst);
    case "requested":
      return items.filter((item) => itemRaisedBy(item, user)).sort(newestFirst);
    case "approved":
      return items.filter((item) => item.status === "approved").sort(newestFirst);
    case "rejected":
      return items.filter((item) => item.status === "rejected").sort(newestFirst);
  }
}

/**
 * Tab counts over the merged ledger. `receivedExtra` is the patch inbox: a plan
 * waiting on this person that is already drawn as a sign-off card above the
 * table, not as a row.
 */
export function itemCounts(
  items: ApprovalItem[],
  user: Person,
  receivedExtra = 0,
): Record<ApprovalView, number> {
  return {
    received:
      items.filter((item) => item.kind === "request" && item.status === "pending").length +
      receivedExtra,
    requested: items.filter((item) => itemRaisedBy(item, user)).length,
    approved: items.filter((item) => item.status === "approved").length,
    rejected: items.filter((item) => item.status === "rejected").length,
  };
}
