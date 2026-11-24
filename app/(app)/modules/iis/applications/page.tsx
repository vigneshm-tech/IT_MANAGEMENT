import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Globe, Plus, X } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { IisApplicationsTable } from "@/components/modules/iis-applications-table";
import { IisApplicationFilters } from "@/components/modules/iis-filters";
import { IisCollectorPanel } from "@/components/modules/iis-collector";
import { IisTabs } from "@/components/modules/iis-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { canIngestIis } from "@/lib/iis/automation";
import {
  applicationFilterQuery,
  filterApplications,
  hasApplicationFilters,
  parseApplicationFilters,
  serverOptions,
} from "@/lib/iis/filters";
import { listApplications } from "@/lib/iis/repository";
import { MODULE_BY_ID } from "@/lib/modules";
import { applicationRowAction, saveApplicationAction } from "../actions";

export const metadata: Metadata = { title: "IIS Application" };

/** A page of the register at a time; the filters are how you find the rest. */
const PAGE_SIZE = 150;

export default async function IisApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "iis")) {
    return <AccessDenied moduleTitle={MODULE_BY_ID.iis.title} />;
  }

  const params = await searchParams;
  const filters = parseApplicationFilters(params);
  const canEdit = can(user.role, "iis", "edit");

  const applications = await listApplications(true);
  const filtered = filterApplications(applications, filters);
  const shown = filtered.slice(0, PAGE_SIZE);
  const query = applicationFilterQuery(filters);

  const deleteId = typeof params.delete === "string" ? params.delete : "";
  const deleting = deleteId ? applications.find((row) => row.id === deleteId) : undefined;

  const savedTo = typeof params.saved === "string" ? params.saved : "";
  const updatedTo = typeof params.updated === "string" ? params.updated : "";

  const servers = serverOptions(applications);
  const filteredOut = hasApplicationFilters(filters);

  return (
    <div className="space-y-4">
      <PageHeader title="IIS Application">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4">
          <IisTabs active="applications" />
          <IisCollectorPanel canIngest={canIngestIis(user.role)} />
          {canEdit && (
            <Link href="/modules/iis/applications/new" className={buttonClass({ size: "sm" })}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New application
            </Link>
          )}
        </div>
      </PageHeader>

      {(savedTo || updatedTo) && (
        <div className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-4 py-2.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
          <p className="text-[12.5px] text-success">
            {updatedTo ? `"${updatedTo}" updated.` : `"${savedTo}" added to the register.`}
          </p>
        </div>
      )}

      {deleting && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-[#f0d5d5] bg-danger-soft px-4 py-3">
          <p className="text-[12.5px] text-danger">
            Remove <span className="font-medium">“{deleting.name}”</span>? Its history goes too —
            retire it instead to keep it.
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/modules/iis/applications${query}`}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[11.5px] text-body hover:border-navy hover:text-navy"
            >
              <X className="h-3 w-3" aria-hidden />
              Cancel
            </Link>
            <form action={applicationRowAction}>
              <input type="hidden" name="id" value={deleting.id} />
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="returnTo" value={query} />
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

      {applications.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No applications yet"
          description={
            canEdit
              ? "Add the IIS sites this team answers for, or run the collection script on the server and let it fill the register."
              : "IT maintains this register."
          }
        />
      ) : (
        <>
          <IisApplicationFilters
            filters={filters}
            servers={servers}
            shown={filtered.length}
            total={applications.length}
          />

          {filtered.length === 0 ? (
            <div className="border border-line bg-surface px-4 py-8 text-center">
              <p className="text-[12.5px] font-medium text-navy">Nothing matches these filters</p>
              <p className="mt-1 text-[11.5px] text-muted">
                {applications.length} applications are in the register.
              </p>
              {filteredOut && (
                <Link
                  href="/modules/iis/applications"
                  className="mt-3 inline-flex items-center gap-1 text-[11.5px] text-navy underline underline-offset-2"
                >
                  <X className="h-3 w-3" aria-hidden />
                  Clear the filters
                </Link>
              )}
            </div>
          ) : (
            <>
              <IisApplicationsTable
                rows={shown}
                canEdit={canEdit}
                returnTo={query}
                onRowAction={applicationRowAction}
              />
              {filtered.length > shown.length && (
                <p className="text-[11.5px] text-muted">
                  Showing the first {shown.length} of {filtered.length} — narrow the filters, or
                  pick a server, to see the rest.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
