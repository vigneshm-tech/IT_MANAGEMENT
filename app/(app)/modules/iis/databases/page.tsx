import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Database, X } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { IisDatabaseForm } from "@/components/modules/iis-form";
import { IisTabs } from "@/components/modules/iis-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  ENGINE_LABELS,
  ENVIRONMENT_LABELS,
  backupOverdue,
  describeBackup,
  listDatabases,
} from "@/lib/iis/repository";
import { MODULE_BY_ID } from "@/lib/modules";
import { databaseRowAction, saveDatabaseAction } from "../actions";

export const metadata: Metadata = { title: "Database" };

const ROW_BUTTON =
  "inline-flex h-7 items-center rounded-md border border-line px-2 text-[11.5px] text-body transition-colors hover:border-navy hover:text-navy";
const ROW_BUTTON_DANGER =
  "inline-flex h-7 items-center rounded-md border border-[#f0d5d5] px-2 text-[11.5px] text-danger transition-colors hover:border-danger hover:bg-danger-soft";

export default async function IisDatabasesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; delete?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "iis")) {
    return <AccessDenied moduleTitle={MODULE_BY_ID.iis.title} />;
  }

  const { edit, delete: deleteId } = await searchParams;
  const databases = await listDatabases(true);
  const canEdit = can(user.role, "iis", "edit");
  const editing = edit ? databases.find((row) => row.id === edit) : undefined;
  const deleting = deleteId ? databases.find((row) => row.id === deleteId) : undefined;
  const live = databases.filter((row) => row.active);
  const retired = databases.filter((row) => !row.active);
  const overdue = live.filter((row) => backupOverdue(row));

  return (
    <div className="space-y-5">
      <PageHeader title="Database">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <IisTabs active="databases" />
          {overdue.length > 0 && (
            <span className="inline-flex items-center gap-1.5 border border-[#ecd9b6] bg-warning-soft px-2 py-0.5 text-[11px] text-[#7b5c1d]">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {overdue.length} backup{overdue.length === 1 ? "" : "s"} overdue
            </span>
          )}
        </div>
      </PageHeader>

      {deleting && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-[#f0d5d5] bg-danger-soft px-4 py-3">
          <p className="text-[12.5px] text-danger">
            Remove <span className="font-medium">“{deleting.name}”</span>? Its history goes too —
            retire it instead to keep it.
          </p>
          <div className="flex items-center gap-2">
            <Link
              href="/modules/iis/databases"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[11.5px] text-body hover:border-navy hover:text-navy"
            >
              <X className="h-3 w-3" aria-hidden />
              Cancel
            </Link>
            <form action={databaseRowAction}>
              <input type="hidden" name="id" value={deleting.id} />
              <input type="hidden" name="intent" value="delete" />
              <button
                type="submit"
                className="inline-flex h-7 items-center rounded-md bg-danger px-2.5 text-[11.5px] font-medium text-white hover:bg-[#a83232]"
              >
                Delete database
              </button>
            </form>
          </div>
        </div>
      )}

      <IisDatabaseForm action={saveDatabaseAction} record={editing} canEdit={canEdit} />

      {databases.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No databases yet"
          description={
            canEdit
              ? "Add the instances behind your applications — engine, host, size and the last backup."
              : "IT maintains this register."
          }
        />
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[880px] text-left">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.09em] text-muted">
                <th className="px-4 py-2.5 font-medium sm:px-5">Database</th>
                <th className="px-3 py-2.5 font-medium">Engine</th>
                <th className="px-3 py-2.5 font-medium">Environment</th>
                <th className="px-3 py-2.5 font-medium">Size</th>
                <th className="px-3 py-2.5 font-medium">Last backup</th>
                <th className="px-3 py-2.5 font-medium">Owner</th>
                <th className="px-3 py-2.5 font-medium">State</th>
                {canEdit && <th className="px-4 py-2.5 text-right font-medium sm:px-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...live, ...retired].map((row) => {
                const overdueRow = backupOverdue(row);
                return (
                  <tr key={row.id} className={row.active ? undefined : "opacity-60"}>
                    <td className="px-4 py-3 sm:px-5">
                      <Link
                        href={`/modules/iis/databases?edit=${row.id}`}
                        className="text-[12.5px] font-medium text-navy hover:underline"
                      >
                        {row.name}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {row.server || "No instance"}
                        {row.recoveryModel ? ` · ${row.recoveryModel}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-body">{ENGINE_LABELS[row.engine]}</td>
                    <td className="px-3 py-3 text-[12px] text-body">
                      {ENVIRONMENT_LABELS[row.environment]}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-body">
                      {row.sizeGb === null ? "—" : `${row.sizeGb} GB`}
                    </td>
                    <td className="px-3 py-3 text-[12px]">
                      <span
                        className={
                          overdueRow ? "inline-flex items-center gap-1 text-warning" : "text-body"
                        }
                      >
                        {overdueRow && <AlertTriangle className="h-3 w-3" aria-hidden />}
                        {describeBackup(row)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-body">{row.owner || "—"}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={row.status} />
                      {!row.active && <span className="ml-1.5 text-[11px] text-muted">retired</span>}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 sm:px-5">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/modules/iis/databases?edit=${row.id}`}
                            className={ROW_BUTTON}
                          >
                            Edit
                          </Link>
                          <form action={databaseRowAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <input
                              type="hidden"
                              name="intent"
                              value={row.active ? "deactivate" : "activate"}
                            />
                            <button type="submit" className={ROW_BUTTON}>
                              {row.active ? "Retire" : "Restore"}
                            </button>
                          </form>
                          <Link
                            href={`/modules/iis/databases?delete=${row.id}`}
                            className={ROW_BUTTON_DANGER}
                          >
                            Delete
                          </Link>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
