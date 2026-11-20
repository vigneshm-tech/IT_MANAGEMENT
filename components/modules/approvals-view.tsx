import Link from "next/link";
import { BadgeCheck, CalendarDays, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PatchDecisionForm } from "@/components/modules/patch-decision-form";
import { DataTable, type Column, type TableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordDialog, type FieldDef } from "@/components/ui/record-dialog";
import { can } from "@/lib/access";
import { ROLE_BY_ID } from "@/lib/roles";
import type { SessionUser } from "@/lib/auth/token";
import { createApprovalAction, decideApprovalAction } from "@/app/(app)/modules/approvals/actions";
import type { ApprovalRecord, AssignableUser, PatchScheduleRecord } from "@/lib/records/repository";
import { formatDayMonth } from "@/lib/format";
import { formatPlannedDate } from "@/lib/patching/plan";

const COLUMNS: Column[] = [
  { key: "title", label: "Request" },
  { key: "id", label: "Ref", type: "mono", width: "92px" },
  { key: "category", label: "Type", type: "muted", width: "104px" },
  { key: "requester", label: "Raised by", width: "200px" },
  { key: "created", label: "Submitted", type: "muted", width: "112px" },
  { key: "status", label: "Status", type: "status", align: "right", width: "112px" },
];

const TYPE_LABEL: Record<ApprovalRecord["category"], string> = {
  change: "Change",
  access: "Access",
  patch: "Patch",
  purchase: "Purchase",
};

function fields(): FieldDef[] {
  return [
    { name: "title", label: "What are you requesting?", type: "text", required: true, span: 2, placeholder: "Access to the production database for release 4.8" },
    {
      name: "category",
      label: "Request type",
      type: "select",
      required: true,
      defaultValue: "access",
      options: [
        { value: "change", label: "Change request" },
        { value: "access", label: "Access" },
        { value: "patch", label: "Patch exception" },
        { value: "purchase", label: "Purchase" },
      ],
    },
    { name: "note", label: "Justification", type: "textarea", span: 2, placeholder: "Scope, duration and why it is needed" },
  ];
}

export function ApprovalsView({
  user,
  approvals,
  patchApprovals = [],
  people = [],
}: {
  user: SessionUser;
  approvals: ApprovalRecord[];
  /** Patch plans this person was named on and has not decided yet. */
  patchApprovals?: PatchScheduleRecord[];
  /** Staff directory for the "Verified by" picker. */
  people?: AssignableUser[];
}) {
  const canApprove = can(user.role, "approvals", "approve");
  const ordered = [
    ...approvals.filter((approval) => approval.status === "pending"),
    ...approvals.filter((approval) => approval.status !== "pending"),
  ];

  const rows: TableRow[] = ordered.map((approval) => ({
    id: approval.id,
    cells: {
      title: approval.title,
      id: approval.id,
      category: TYPE_LABEL[approval.category],
      requester: `${approval.requesterName} · ${ROLE_BY_ID[approval.requesterRole]?.label ?? "—"}`,
      created: formatDayMonth(approval.createdAt),
      status: approval.status,
    },
    actions:
      canApprove && approval.status === "pending"
        ? [
            { label: "Approve", value: "approve", tone: "primary" as const },
            { label: "Reject", value: "reject", tone: "danger" as const },
          ]
        : [],
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals"
        actions={
          <RecordDialog
            title="New request"
            triggerLabel="Raise request"
            submitLabel="Submit request"
            fields={fields()}
            action={createApprovalAction}
            size="lg"
          />
        }
      />

      {patchApprovals.length > 0 && (
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
        columns={COLUMNS}
        rows={rows}
        tableId="approvals"
        exportName="tasktornado-approvals"
        rowAction={decideApprovalAction}
        searchPlaceholder="Search requests, people or references"
        emptyState={
          <EmptyState
            icon={BadgeCheck}
            title="No requests yet"
            description="Changes, access and purchase requests raised by any team land here for a decision."
            action={
              <RecordDialog
                title="New request"
                description="Requests route to managers, leads and management for a decision."
                triggerLabel="Raise the first request"
                submitLabel="Submit request"
                fields={fields()}
                action={createApprovalAction}
                size="lg"
              />
            }
          />
        }
      />
    </div>
  );
}
