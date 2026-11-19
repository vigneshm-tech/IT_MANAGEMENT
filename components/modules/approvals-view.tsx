import { BadgeCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type TableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordDialog, type FieldDef } from "@/components/ui/record-dialog";
import { can } from "@/lib/access";
import { ROLE_BY_ID } from "@/lib/roles";
import type { SessionUser } from "@/lib/auth/token";
import { createApprovalAction, decideApprovalAction } from "@/app/(app)/modules/approvals/actions";
import type { ApprovalRecord } from "@/lib/records/repository";
import { formatDayMonth } from "@/lib/format";

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
}: {
  user: SessionUser;
  approvals: ApprovalRecord[];
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

      <DataTable
        columns={COLUMNS}
        rows={rows}
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
