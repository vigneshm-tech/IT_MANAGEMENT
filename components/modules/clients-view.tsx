import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type TableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordDialog, type FieldDef } from "@/components/ui/record-dialog";
import { can } from "@/lib/access";
import { VISIBLE_ROLES } from "@/lib/roles";
import type { SessionUser } from "@/lib/auth/token";
import { createClientAction, updateClientStatusAction } from "@/app/(app)/modules/clients/actions";
import type { ClientRecord } from "@/lib/records/repository";

const COLUMNS: Column[] = [
  { key: "name", label: "Client" },
  { key: "code", label: "Code", type: "mono", width: "86px" },
  { key: "contact", label: "Primary contact", type: "muted" },
  { key: "industry", label: "Industry", type: "muted", width: "150px" },
  { key: "owner", label: "Account owner", width: "200px" },
  { key: "status", label: "Status", type: "status", align: "right", width: "110px" },
];

function fields(): FieldDef[] {
  return [
    { name: "name", label: "Client name", type: "text", required: true, span: 2, placeholder: "Acme Manufacturing" },
    { name: "code", label: "Short code", type: "text", placeholder: "ACME" },
    { name: "industry", label: "Industry", type: "text", placeholder: "Manufacturing" },
    { name: "contactName", label: "Primary contact", type: "text", placeholder: "Full name" },
    { name: "contactEmail", label: "Contact email", type: "email", placeholder: "name@company.com" },
    {
      name: "ownerRole",
      label: "Account owner",
      type: "select",
      required: true,
      options: VISIBLE_ROLES.map((role) => ({ value: role.id, label: role.label })),
      defaultValue: "implementation_lead",
    },
  ];
}

export function ClientsView({
  user,
  clients,
}: {
  user: SessionUser;
  clients: ClientRecord[];
}) {
  const canEdit = can(user.role, "clients", "edit");

  const rows: TableRow[] = clients.map((client) => ({
    id: client.id,
    cells: {
      name: client.name,
      code: client.code,
      contact: [client.contactName, client.contactEmail].filter(Boolean).join(" · ") || "—",
      industry: client.industry || "—",
      owner: VISIBLE_ROLES.find((role) => role.id === client.ownerRole)?.label ?? "—",
      status: client.status,
    },
    actions: canEdit
      ? [
          client.status === "active"
            ? { label: "Deactivate", value: "deactivate", tone: "default" as const }
            : { label: "Activate", value: "activate", tone: "default" as const },
        ]
      : [],
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        actions={
          canEdit ? (
            <RecordDialog
              title="Add client"
              triggerLabel="Add client"
              submitLabel="Save client"
              fields={fields()}
              action={createClientAction}
              size="lg"
            />
          ) : undefined
        }
      />

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowAction={updateClientStatusAction}
        searchPlaceholder="Search clients, contacts or owners"
        emptyState={
          <EmptyState
            icon={Building2}
            title="No clients yet"
            description="Add the accounts you support to link renewals, contacts and patching windows."
            action={
              canEdit ? (
                <RecordDialog
                  title="Add client"
                  description="Accounts drive renewals, patching windows and ownership."
                  triggerLabel="Add the first client"
                  submitLabel="Save client"
                  fields={fields()}
                  action={createClientAction}
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
