import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type TableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordDialog, type FieldDef } from "@/components/ui/record-dialog";
import { can } from "@/lib/access";
import { ROLE_BY_ID, VISIBLE_ROLES } from "@/lib/roles";
import type { SessionUser } from "@/lib/auth/token";
import {
  createPatchPlanAction,
  updatePatchPlanStatusAction,
} from "@/app/(app)/modules/patching/actions";
import type { PatchPlanRecord } from "@/lib/records/repository";
import { formatDayMonth } from "@/lib/format";

const COLUMNS: Column[] = [
  { key: "title", label: "Plan" },
  { key: "client", label: "Client", type: "muted" },
  { key: "ring", label: "Ring", width: "78px" },
  { key: "owner", label: "Owner", width: "190px" },
  { key: "window", label: "Window", width: "120px" },
  { key: "status", label: "Status", type: "status", align: "right", width: "130px" },
];

function fields(clients: string[]): FieldDef[] {
  return [
    { name: "title", label: "Plan name", type: "text", required: true, span: 2, placeholder: "November security rollup" },
    {
      name: "clientName",
      label: "Client",
      type: clients.length > 0 ? "select" : "text",
      required: true,
      options:
        clients.length > 0
          ? clients.map((client) => ({ value: client, label: client }))
          : undefined,
      placeholder: clients.length > 0 ? undefined : "Client name",
    },
    { name: "windowDate", label: "Window date", type: "date", required: true },
    {
      name: "ring",
      label: "Patch ring",
      type: "select",
      required: true,
      defaultValue: "A",
      options: [
        { value: "A", label: "Ring A — pilot" },
        { value: "B", label: "Ring B — broad" },
        { value: "C", label: "Ring C — critical" },
      ],
    },
    {
      name: "ownerRole",
      label: "Owner",
      type: "select",
      required: true,
      options: VISIBLE_ROLES.map((role) => ({ value: role.id, label: role.label })),
      defaultValue: "it_engineer",
    },
    { name: "notes", label: "Notes", type: "textarea", span: 2, placeholder: "Reboot approvals, exclusions, client contact" },
  ];
}

export function PatchingView({
  user,
  plans,
  clients,
}: {
  user: SessionUser;
  plans: PatchPlanRecord[];
  clients: string[];
}) {
  const canEdit = can(user.role, "patching", "edit");

  const rows: TableRow[] = plans.map((plan) => ({
    id: plan.id,
    cells: {
      title: plan.title,
      client: plan.clientName || "—",
      ring: `Ring ${plan.ring}`,
      owner: ROLE_BY_ID[plan.ownerRole]?.label ?? "—",
      window: formatDayMonth(plan.windowDate),
      status: plan.status,
    },
    actions: canEdit
      ? plan.status === "planned"
        ? [{ label: "Start", value: "start", tone: "primary" as const }]
        : plan.status === "in_progress"
          ? [{ label: "Complete", value: "complete", tone: "default" as const }]
          : []
      : [],
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Patching Plans"
        actions={
          canEdit ? (
            <RecordDialog
              title="Schedule patching"
              triggerLabel="New plan"
              submitLabel="Schedule plan"
              fields={fields(clients)}
              action={createPatchPlanAction}
              size="lg"
            />
          ) : undefined
        }
      />

      <DataTable
        columns={COLUMNS}
        rows={rows}
        tableId="patching"
        exportName="tasktornado-patching"
        rowAction={updatePatchPlanStatusAction}
        searchPlaceholder="Search plans, clients or owners"
        emptyState={
          <EmptyState
            icon={ShieldCheck}
            title="No patching plans"
            description="Schedule maintenance windows per client and track them from pilot ring to completion."
            action={
              canEdit ? (
                <RecordDialog
                  title="Schedule patching"
                  description="Plans track the maintenance window, ring and owner."
                  triggerLabel="Schedule the first plan"
                  submitLabel="Schedule plan"
                  fields={fields(clients)}
                  action={createPatchPlanAction}
                  size="lg"
                />
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}
