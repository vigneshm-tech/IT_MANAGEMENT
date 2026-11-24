import type { Metadata } from "next";
import Link from "next/link";
import { Globe, X } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { IisCollectorPanel } from "@/components/modules/iis-collector";
import { IisApplicationForm } from "@/components/modules/iis-form";
import { IisTabs } from "@/components/modules/iis-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  ENVIRONMENT_LABELS,
  describeBinding,
  listApplications,
  summariseApplications,
} from "@/lib/iis/repository";
import { canIngestIis } from "@/lib/iis/automation";
import { MODULE_BY_ID } from "@/lib/modules";
import { applicationRowAction, saveApplicationAction } from "../actions";

export const metadata: Metadata = { title: "IIS Application" };

/** A certificate close to expiry is the reason this column exists. */
function expiryTone(date: string | null): string {
  if (!date) return "text-muted";
  const days = Math.floor((new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "font-medium text-danger";
  if (days <= 30) return "font-medium text-[#8a5a1c]";
  return "text-muted";
}

const ROW_BUTTON =
  "inline-flex h-7 items-center rounded-md border border-line px-2 text-[11.5px] text-body transition-colors hover:border-navy hover:text-navy";
const ROW_BUTTON_DANGER =
  "inline-flex h-7 items-center rounded-md border border-[#f0d5d5] px-2 text-[11.5px] text-danger transition-colors hover:border-danger hover:bg-danger-soft";

export default async function IisApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; delete?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "iis")) {
    return <AccessDenied moduleTitle={MODULE_BY_ID.iis.title} />;
  }

  const { edit, delete: deleteId } = await searchParams;
  const applications = await listApplications(true);
  const canEdit = can(user.role, "iis", "edit");
  const editing = edit ? applications.find((row) => row.id === edit) : undefined;
  const deleting = deleteId ? applications.find((row) => row.id === deleteId) : undefined;
  const summary = summariseApplications(applications);
  const live = applications.filter((row) => row.active);
  const retired = applications.filter((row) => !row.active);

  return (
    <div className="space-y-5">
      <PageHeader title="IIS Application">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <IisTabs active="applications" />
          <IisCollectorPanel canIngest={canIngestIis(user.role)} />
          <p className="text-[12px] text-muted">
            {live.length} live {live.length === 1 ? "application" : "applications"}
            {summary.attention > 0 ? ` · ${summary.attention} need attention` : ""}
            {retired.length > 0 ? ` · ${retired.length} retired` : ""}
          </p>
        </div>
      </PageHeader>

      {deleting && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-[#f0d5d5] bg-danger-soft px-4 py-3">
          <p className="text-[12.5px] text-danger">
            Remove <span className="font-medium">“{deleting.name}”</span> from the register? Its
            history goes with it — deactivate instead if you only want to stop tracking it.
          </p>
          <div className="flex items-center gap-2">
            <Link
              href="/modules/iis/applications"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[11.5px] text-body hover:border-navy hover:text-navy"
            >
              <X className="h-3 w-3" aria-hidden />
              Cancel
            </Link>
            <form action={applicationRowAction}>
              <input type="hidden" name="id" value={deleting.id} />
              <input type="hidden" name="intent" value="delete" />
              <button
                type="submit"
                className="inline-flex h-7 items-center rounded-md bg-danger px-2.5 text-[11.5px] font-medium text-white hover:bg-[#a83232]"
              >
                Delete application
              </button>
            </form>
          </div>
        </div>
      )}

      <IisApplicationForm action={saveApplicationAction} record={editing} canEdit={canEdit} />

      {applications.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No applications yet"
          description={
            canEdit
              ? "Add the IIS sites and applications this team answers for — server, binding, app pool, directory browsing and root path. Or run the collection script on the server and let it fill the register."
              : "IT maintains this register."
          }
        />
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[1120px] text-left">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.09em] text-muted">
                <th className="px-4 py-2.5 font-medium sm:px-5">Application</th>
                <th className="px-3 py-2.5 font-medium">Binding</th>
                <th className="px-3 py-2.5 font-medium">SSL</th>
                <th className="px-3 py-2.5 font-medium">App pool</th>
                <th className="px-3 py-2.5 font-medium">Directory browsing</th>
                <th className="px-3 py-2.5 font-medium">Root path</th>
                <th className="px-3 py-2.5 font-medium">Owner</th>
                <th className="px-3 py-2.5 font-medium">State</th>
                {canEdit && <th className="px-4 py-2.5 text-right font-medium sm:px-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...live, ...retired].map((row) => (
                <tr key={row.id} className={row.active ? undefined : "opacity-60"}>
                  <td className="px-4 py-3 sm:px-5">
                    <Link
                      href={`/modules/iis/applications?edit=${row.id}`}
                      className="text-[12.5px] font-medium text-navy hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {row.server || "No server host name"} · {ENVIRONMENT_LABELS[row.environment]}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-[12px] text-body">
                    <span className="break-all">{describeBinding(row)}</span>
                  </td>
                  <td className="px-3 py-3 text-[12px]">
                    {row.sslMapped ? (
                      <div className="min-w-0">
                        <span className="text-navy">Mapped</span>
                        {row.sslCertificate ? (
                          <p className="break-all text-[11px] text-body">{row.sslCertificate}</p>
                        ) : (
                          <p className="text-[11px] text-muted">No certificate name</p>
                        )}
                        {row.sslExpiresAt && (
                          <p className={`text-[11px] ${expiryTone(row.sslExpiresAt)}`}>
                            to {row.sslExpiresAt}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted">Not mapped</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[12px] text-body">{row.appPool || "—"}</td>
                  <td className="px-3 py-3 text-[12px]">
                    {row.directoryBrowsing === "enabled" ? (
                      <span className="rounded-full border border-[#f2d6ba] bg-[#fdf3e7] px-2 py-0.5 text-[11px] font-medium text-[#8a5a1c]">
                        Enabled
                      </span>
                    ) : (
                      <span className="text-muted">Disabled</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[11.5px] text-body">
                    <span className="break-all font-mono">{row.appRoot || "—"}</span>
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
                          href={`/modules/iis/applications?edit=${row.id}`}
                          className={ROW_BUTTON}
                        >
                          Edit
                        </Link>
                        <form action={applicationRowAction}>
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
                          href={`/modules/iis/applications?delete=${row.id}`}
                          className={ROW_BUTTON_DANGER}
                        >
                          Delete
                        </Link>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
