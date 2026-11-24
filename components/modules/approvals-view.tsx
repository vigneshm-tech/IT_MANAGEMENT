import Link from "next/link";
import { BadgeCheck, Ban, CalendarDays, Inbox, Send, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PatchDecisionForm } from "@/components/modules/patch-decision-form";
import { DataTable, type Column, type TableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordDialog, type FieldDef } from "@/components/ui/record-dialog";
import { can } from "@/lib/access";
import { roleOf } from "@/lib/roles";
import type { SessionUser } from "@/lib/auth/token";
import { createApprovalAction, decideApprovalAction } from "@/app/(app)/modules/approvals/actions";
import type {
  ApprovalRecord,
  AssignableUser,
  PatchScheduleRecord,
  RequestTypeRecord,
} from "@/lib/records/repository";
import {
  approvalView,
  approvalViewMeta,
  approvalsForView,
  approvalViewsFor,
  type ApprovalView,
} from "@/lib/approvals/views";
import { approvalItems, itemCounts, itemsForView } from "@/lib/approvals/history";
import {
  requestTypeLabel,
  requestTypeLabels,
  requestTypeOptions,
} from "@/lib/request-types";
import { formatDayMonth } from "@/lib/format";
import { formatPlannedDate } from "@/lib/patching/plan";

const TITLE: Column = { key: "title", label: "Request" };
const REF: Column = { key: "id", label: "Ref", type: "mono", width: "92px" };
const TYPE: Column = { key: "category", label: "Type", type: "muted", width: "104px" };
const RAISED_BY: Column = { key: "requester", label: "Raised by", width: "200px" };
const SUBMITTED: Column = { key: "created", label: "Submitted", type: "muted", width: "112px" };
const STATUS: Column = { key: "status", label: "Status", type: "status", align: "right", width: "112px" };
const DECIDED_BY: Column = { key: "decidedBy", label: "Decided by", width: "176px" };
const DECIDED_ON: Column = { key: "decidedAt", label: "Decided", type: "muted", width: "112px" };

/** The inbox shows the requester; the history shows who decided. */
const COLUMNS: Record<ApprovalView, Column[]> = {
  received: [TITLE, REF, TYPE, RAISED_BY, SUBMITTED, STATUS],
  requested: [TITLE, REF, TYPE, SUBMITTED, DECIDED_BY, DECIDED_ON, STATUS],
  approved: [TITLE, REF, TYPE, RAISED_BY, DECIDED_BY, DECIDED_ON],
  rejected: [TITLE, REF, TYPE, RAISED_BY, DECIDED_BY, DECIDED_ON],
};

const VIEW_ICON: Record<ApprovalView, typeof Inbox> = {
  received: Inbox,
  requested: Send,
  approved: BadgeCheck,
  rejected: Ban,
};

/** The Request type list comes from Masters → Request types, active rows only. */
function fields(requestTypes: RequestTypeRecord[]): FieldDef[] {
  const options = requestTypeOptions(requestTypes);
  const preferred = options.find((option) => option.value === "access") ?? options[0];

  return [
    { name: "title", label: "What are you requesting?", type: "text", required: true, span: 2, placeholder: "Access to the production database for release 4.8" },
    {
      name: "category",
      label: "Request type",
      type: "select",
      required: true,
      defaultValue: preferred?.value ?? "",
      options: options.length > 0 ? options : [{ value: "", label: "No active request types — add one in Masters" }],
    },
    { name: "note", label: "Justification", type: "textarea", span: 2, placeholder: "Scope, duration and why it is needed" },
  ];
}

function raiseRequestDialog(triggerLabel: string, requestTypes: RequestTypeRecord[]) {
  return (
    <RecordDialog
      title="New request"
      description="Route a request to the people who decide it."
      triggerLabel={triggerLabel}
      submitLabel="Submit request"
      fields={fields(requestTypes)}
      action={createApprovalAction}
      size="lg"
    />
  );
}

function cellsFor(approval: ApprovalRecord, labels: Record<string, string>) {
  return {
    title: approval.title,
    id: approval.id,
    category: labels[approval.category] ?? requestTypeLabel(approval.category),
    requester: `${approval.requesterName} · ${roleOf(approval.requesterRole).label}`,
    created: formatDayMonth(approval.createdAt),
    decidedBy: approval.decidedBy ?? "—",
    decidedAt: approval.decidedAt ? formatDayMonth(approval.decidedAt) : "—",
    status: approval.status,
  };
}

export function ApprovalsView({
  user,
  approvals,
  view = "received",
  plans = [],
  patchApprovals = [],
  people = [],
  requestTypes = [],
}: {
  user: SessionUser;
  approvals: ApprovalRecord[];
  /** Which of the four lists to show: received, requested, approved, rejected. */
  view?: ApprovalView | string;
  /** Every patch plan, so signed-off ones can appear in the history tabs. */
  plans?: PatchScheduleRecord[];
  /** Patch plans this person was named on and has not decided yet. */
  patchApprovals?: PatchScheduleRecord[];
  /** Staff directory for the "Verified by" picker. */
  people?: AssignableUser[];
  /** Masters → Request types. The form offers the active ones; history reads all. */
  requestTypes?: RequestTypeRecord[];
}) {
  const canApprove = can(user.role, "approvals", "approve");
  const views = approvalViewsFor(canApprove);

  // A reader without decide rights has no inbox — their own requests are the
  // sensible landing spot, and `?view=received` should not dead-end them.
  const requested = approvalView(view);
  const active: ApprovalView = views.some((tab) => tab.id === requested) ? requested : views[0].id;
  const meta = approvalViewMeta(active);
  // Requests and patch sign-offs are one ledger: the tabs count and list both,
  // so a plan signed off here is findable under Approved afterwards.
  const labels = requestTypeLabels(requestTypes);
  const items = approvalItems(approvals, plans, labels);
  const counts = itemCounts(items, user, patchApprovals.length);

  const rows: TableRow[] =
    active === "received"
      ? approvalsForView(approvals, "received", user).map((approval) => ({
          id: approval.id,
          cells: cellsFor(approval, labels),
          actions: canApprove
            ? [
                { label: "Approve", value: "approve", tone: "primary" as const },
                { label: "Reject", value: "reject", tone: "danger" as const },
              ]
            : [],
        }))
      : itemsForView(items, active, user).map((item) => ({
          id: item.id,
          href: item.kind === "patching" ? item.href : undefined,
          cells: {
            title: item.title,
            id: item.id,
            category: item.type,
            requester: item.requesterDetail,
            created: formatDayMonth(item.createdAt),
            decidedBy: item.decidedBy,
            decidedAt: item.decidedAt ? formatDayMonth(item.decidedAt) : "—",
            status: item.status,
          },
        }));

  const emptyState = (() => {
    switch (active) {
      case "received":
        return (
          <EmptyState
            icon={BadgeCheck}
            title="Nothing waiting on you"
            description={
              patchApprovals.length > 0
                ? "No open requests — the patch sign-offs above are the only pending decisions."
                : "Every request has been decided."
            }
          />
        );
      case "requested":
        return (
          <EmptyState
            icon={Send}
            title="You have not raised a request"
            description="Requests you raise, and the patch plans you schedule."
            action={raiseRequestDialog("Raise the first request", requestTypes)}
          />
        );
      case "approved":
        return (
          <EmptyState
            icon={BadgeCheck}
            title="Nothing approved yet"
            description="Approved requests and signed-off patch plans."
          />
        );
      case "rejected":
        return (
          <EmptyState
            icon={Ban}
            title="Nothing turned down"
            description="Rejected requests and refused patch plans."
          />
        );
    }
  })();

  return (
    <div className="space-y-5">
      <PageHeader title="Approvals" actions={raiseRequestDialog("Raise request", requestTypes)} />

      <div
        role="group"
        aria-label="Approval views"
        className="flex flex-wrap items-center gap-1"
      >
        {views.map((tab) => {
          const current = active === tab.id;
          const Icon = VIEW_ICON[tab.id];
          const count = counts[tab.id];
          return (
            <Link
              key={tab.id}
              href={tab.id === "received" ? "/modules/approvals" : `/modules/approvals?view=${tab.id}`}
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? "inline-flex items-center gap-1.5 border border-navy bg-navy px-3 py-1.5 text-[12px] font-medium text-white"
                  : "inline-flex items-center gap-1.5 border border-line bg-surface px-3 py-1.5 text-[12px] text-body transition-colors hover:border-navy/30 hover:text-navy"
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {tab.label}
              <span
                className={
                  current
                    ? "rounded bg-white/20 px-1.5 text-[10.5px] font-medium tabular-nums"
                    : "rounded bg-[#eef1f7] px-1.5 text-[10.5px] font-medium tabular-nums text-body"
                }
              >
                {count}
              </span>
            </Link>
          );
        })}

        <span className="ml-auto text-[11.5px] text-muted">{meta.blurb}</span>
      </div>

      {active === "received" && patchApprovals.length > 0 && (
        <section
          id="patching-signoffs"
          aria-labelledby="patching-signoffs-title"
          className="space-y-3 border border-line bg-surface"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <div>
              <h2
                id="patching-signoffs-title"
                className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-navy"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-gold" aria-hidden />
                Patching sign-offs
              </h2>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {patchApprovals.length === 1
                  ? "One patch plan is waiting for your decision."
                  : `${patchApprovals.length} patch plans are waiting for your decision.`}
              </p>
            </div>
            <Link
              href="/modules/patching"
              className="text-[12px] font-medium text-navy hover:underline"
            >
              Open Patching Plans
            </Link>
          </div>

          <ul className="divide-y divide-line">
            {patchApprovals.map((plan) => (
              <li key={plan.id} className="space-y-3 px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-navy">{plan.endpointName}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" aria-hidden />
                        {formatPlannedDate(plan.plannedDate)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3 w-3" aria-hidden />
                        {plan.handlerName || "No handler"}
                      </span>
                      <span>
                        {plan.missingCount} missing {plan.missingCount === 1 ? "patch" : "patches"} ·{" "}
                        {plan.otherCount} other {plan.otherCount === 1 ? "update" : "updates"}
                      </span>
                      {plan.createdByName ? <span>Raised by {plan.createdByName}</span> : null}
                    </p>
                  </div>
                  <span className="rounded bg-[#eaeef6] px-1.5 py-0.5 text-[10.5px] font-medium text-navy">
                    {plan.id}
                  </span>
                </div>

                <PatchDecisionForm plan={plan} people={people} compact />
              </li>
            ))}
          </ul>
        </section>
      )}

      <DataTable
        columns={COLUMNS[active]}
        rows={rows}
        tableId={`approvals-${active}`}
        exportName={`tasktornado-approvals-${active}`}
        rowAction={active === "received" ? decideApprovalAction : undefined}
        searchPlaceholder={
          active === "received"
            ? "Search requests, people or references"
            : "Search by request, reference or person"
        }
        emptyState={emptyState}
      />
    </div>
  );
}
