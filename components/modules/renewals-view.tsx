import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type TableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordDialog, type FieldDef } from "@/components/ui/record-dialog";
import { can } from "@/lib/access";
import { VISIBLE_ROLES } from "@/lib/roles";
import type { SessionUser } from "@/lib/auth/token";
import {
  createRenewalAction,
  markRenewalRenewedAction,
} from "@/app/(app)/modules/renewals/actions";
import { daysUntil, type RenewalRecord } from "@/lib/records/repository";
import { formatDayMonth, formatMoney } from "@/lib/format";

const COLUMNS: Column[] = [
  { key: "item", label: "Item" },
  { key: "vendor", label: "Vendor", type: "muted", width: "150px" },
  { key: "client", label: "Client", type: "muted", width: "170px" },
  { key: "amount", label: "Value", align: "right", width: "130px" },
  { key: "date", label: "Renews", width: "150px" },
  { key: "status", label: "Status", type: "status", align: "right", width: "110px" },
];

function fields(): FieldDef[] {
  return [
    { name: "item", label: "Renewal item", type: "text", required: true, span: 2, placeholder: "Action1 endpoint licence" },
    { name: "vendor", label: "Vendor", type: "text", placeholder: "Action1" },
    { name: "clientName", label: "Client", type: "text", placeholder: "Internal" },
    { name: "amount", label: "Value", type: "number", min: "0", step: "1", placeholder: "480000" },
    {
      name: "currency",
      label: "Currency",
      type: "select",
      required: true,
      defaultValue: "INR",
      options: [
        { value: "INR", label: "INR ₹" },
        { value: "USD", label: "USD $" },
        { value: "EUR", label: "EUR €" },
      ],
    },
    { name: "renewalDate", label: "Renewal date", type: "date", required: true },
    { name: "noticeDays", label: "Notice period (days)", type: "number", min: "0", step: "1", defaultValue: "30" },
    {
      name: "ownerRole",
      label: "Owner",
      type: "select",
      required: true,
      options: VISIBLE_ROLES.map((role) => ({ value: role.id, label: role.label })),
      defaultValue: "it_manager",
    },
  ];
}

export function RenewalsView({
  user,
  renewals,
}: {
  user: SessionUser;
  renewals: RenewalRecord[];
}) {
  const canEdit = can(user.role, "renewals", "edit");
  const now = new Date();
  const ordered = [...renewals].sort(
    (a, b) => daysUntil(a.renewalDate, now) - daysUntil(b.renewalDate, now),
  );
  const dueSoon = renewals.filter(
    (renewal) =>
      renewal.status !== "renewed" &&
      renewal.status !== "expired" &&
      daysUntil(renewal.renewalDate, now) <= 30,
  ).length;

  const rows: TableRow[] = ordered.map((renewal) => {
    const days = daysUntil(renewal.renewalDate, now);
    const when =
      renewal.status === "renewed"
        ? formatDayMonth(renewal.renewalDate, now)
        : days === 0
          ? "Today"
          : days > 0
            ? `${formatDayMonth(renewal.renewalDate, now)} · in ${days}d`
            : `${formatDayMonth(renewal.renewalDate, now)} · ${Math.abs(days)}d ago`;

    return {
      id: renewal.id,
      cells: {
        item: renewal.item,
        vendor: renewal.vendor || "—",
        client: renewal.clientName || "—",
        amount: formatMoney(renewal.amount, renewal.currency),
        date: when,
        status: renewal.status,
      },
      actions:
        canEdit && renewal.status !== "renewed" && renewal.status !== "expired"
          ? [{ label: "Mark renewed", value: "renew", tone: "default" as const }]
          : [],
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Renewals"
        meta={
          <span className="text-[12.5px] text-muted">
            {dueSoon} due within 30 days · {renewals.length} tracked
          </span>
        }
        actions={
          canEdit ? (
            <RecordDialog
              title="Add renewal"
              description="Track the contract value, date and notice period."
              triggerLabel="Add renewal"
              submitLabel="Save renewal"
              fields={fields()}
              action={createRenewalAction}
              size="lg"
            />
          ) : undefined
        }
      />

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowAction={markRenewalRenewedAction}
        searchPlaceholder="Search items, vendors or clients"
        emptyState={
          <EmptyState
            icon={CalendarClock}
            title="No renewals tracked"
            description="Licences, contracts and AMCs live here with their notice periods so nothing lapses quietly."
            action={
              canEdit ? (
                <RecordDialog
                  title="Add renewal"
                  description="Track the contract value, date and notice period."
                  triggerLabel="Add the first renewal"
                  submitLabel="Save renewal"
                  fields={fields()}
                  action={createRenewalAction}
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
