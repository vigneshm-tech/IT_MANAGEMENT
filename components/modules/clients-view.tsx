import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { DataTable, type Column, type TableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/lib/access";
import { VISIBLE_ROLES } from "@/lib/roles";
import type { SessionUser } from "@/lib/auth/token";
import { updateClientStatusAction } from "@/app/(app)/modules/clients/actions";
import { clientTimestamps } from "@/lib/clients";
import { formatPhone } from "@/lib/countries";
import type { ClientRecord } from "@/lib/records/repository";

const COLUMNS: Column[] = [
  { key: "name", label: "Client" },
  { key: "code", label: "Short / license code", type: "mono", width: "150px" },
  { key: "industry", label: "Industry", type: "muted", width: "140px" },
  { key: "primaryName", label: "Primary contact", width: "160px" },
  { key: "primaryEmail", label: "Primary email", type: "muted", width: "200px" },
  { key: "primaryMobile", label: "Primary mobile", type: "muted", width: "160px" },
  { key: "secondaryName", label: "Secondary contact", width: "160px" },
  { key: "secondaryEmail", label: "Secondary email", type: "muted", width: "200px" },
  { key: "secondaryMobile", label: "Secondary mobile", type: "muted", width: "160px" },
  { key: "owner", label: "Account owner", width: "180px" },
  { key: "assigned", label: "Assigned user", width: "170px" },
  { key: "created", label: "Created", type: "muted", width: "150px" },
  { key: "updated", label: "Last update", type: "muted", width: "150px" },
  { key: "status", label: "Status", type: "status", align: "right", width: "110px" },
];

/**
 * Clients register. The create form lives on its own page
 * (`/modules/clients/new`) — full page, no popup — and every field the register
 * captures is a column here, so nothing has to be opened to be checked.
 */
export function ClientsView({
  user,
  clients,
  createdId,
}: {
  user: SessionUser;
  clients: ClientRecord[];
  /** Set after a client was created in this session. */
  createdId?: string;
}) {
  const canEdit = can(user.role, "clients", "edit");
  const created = createdId ? clients.find((client) => client.id === createdId) : undefined;

  const rows: TableRow[] = clients.map((client) => {
    const stamps = clientTimestamps(client.createdAt, client.updatedAt);
    return {
      id: client.id,
      cells: {
        name: client.name,
        code: client.code || "—",
        industry: client.industry || "—",
        primaryName: client.primary.name || "—",
        primaryEmail: client.primary.email || "—",
        primaryMobile: formatPhone(client.primary.mobileCountry, client.primary.mobile) || "—",
        secondaryName: client.secondary.name || "—",
        secondaryEmail: client.secondary.email || "—",
        secondaryMobile:
          formatPhone(client.secondary.mobileCountry, client.secondary.mobile) || "—",
        owner: VISIBLE_ROLES.find((role) => role.id === client.ownerRole)?.label ?? "—",
        assigned: client.assignedUserName || "Unassigned",
        created: stamps.created,
        updated: stamps.touched ? stamps.updated : "—",
        status: client.status,
      },
      actions: canEdit
        ? [
            client.status === "active"
              ? { label: "Deactivate", value: "deactivate", tone: "default" as const }
              : { label: "Activate", value: "activate", tone: "default" as const },
          ]
        : [],
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        actions={
          canEdit ? (
            <Link href="/modules/clients/new" className={buttonClass({ size: "sm" })}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add client
            </Link>
          ) : undefined
        }
      >
        <p className="text-[12.5px] leading-relaxed text-muted">
          {clients.length} {clients.length === 1 ? "account" : "accounts"} with a primary and a
          secondary contact. Created and last-updated dates are stamped by the database — the
          Columns control hides any of them if the table gets too wide.
        </p>
      </PageHeader>

      {created && (
        <p className="border border-[#cfe4d4] bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          {created.name} was added to the register.
        </p>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        tableId="clients"
        exportName="tasktornado-clients"
        rowAction={canEdit ? updateClientStatusAction : undefined}
        rowActions={[]}
        searchPlaceholder="Search clients, codes, industries, contacts or owners"
        emptyState={
          <EmptyState
            icon={Building2}
            title="No clients yet"
            description="Add the accounts you support to link renewals, contacts and patching windows."
            action={
              canEdit ? (
                <Link href="/modules/clients/new" className={buttonClass({ size: "sm" })}>
                  Add the first client
                </Link>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}
