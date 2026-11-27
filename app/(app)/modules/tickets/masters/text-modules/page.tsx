import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketAdminTabs } from "@/components/modules/ticket-admin-tabs";
import { TextModuleForm } from "@/components/modules/text-module-form";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listTicketTextModules } from "@/lib/records/repository";
import { canConfigureTickets, canReadTicketAdmin } from "@/lib/tickets/admin";
import { addTextModuleAction, textModuleRowAction } from "./actions";

export const metadata: Metadata = { title: "Text modules" };

export default async function TextModulesPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; delete?: string }>;
}) {
  const user = await requireUser();

  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }
  if (!canReadTicketAdmin(user.role)) {
    return <AccessDenied moduleTitle="Text modules" />;
  }

  const { updated, delete: deleteId } = await searchParams;
  const modules = await listTicketTextModules(true);
  const canEdit = canConfigureTickets(user.role);
  const updatedModule = updated ? modules.find((module) => module.id === updated) : undefined;

  return (
    <div className="space-y-5">
      <PageHeader title="Text modules">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <TicketAdminTabs active="text-modules" />
        </div>
      </PageHeader>

      {updatedModule && (
        <p className="border border-[#cfe4d4] bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          &quot;{updatedModule.name}&quot; was updated.
        </p>
      )}

      {canEdit ? (
        <TextModuleForm
          action={addTextModuleAction}
          submitLabel="Add snippet"
          basePath="/modules/tickets/masters/text-modules"
        />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Read only — you cannot change text modules.
        </p>
      )}

      {modules.length === 0 ? (
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-navy">No text modules yet</p>
            <p className="mt-1 text-[12.5px] text-muted">
              Add a reply agents can insert.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line bg-surface">
          {modules.map((module) => {
            const confirmDelete = deleteId === module.id;
            return (
              <li key={module.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <Link
                    href={`/modules/tickets/masters/text-modules/${module.id}`}
                    className="text-[13px] font-medium text-navy underline-offset-2 hover:underline"
                  >
                    {module.name}
                  </Link>
                  <StatusPill
                    status={module.status}
                    label={module.status === "active" ? "Active" : "Inactive"}
                  />
                  {module.keywords && (
                    <span className="text-[11.5px] text-muted">keywords: {module.keywords}</span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-muted">{module.id}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-[12px] leading-relaxed text-muted">
                  {module.body}
                </p>

                {canEdit && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Link
                      href={`/modules/tickets/masters/text-modules/${module.id}`}
                      className="text-[11.5px] font-medium text-navy underline-offset-2 hover:underline"
                    >
                      Edit
                    </Link>
                    <form action={textModuleRowAction}>
                      <input type="hidden" name="id" value={module.id} />
                      <input type="hidden" name="value" value="toggle" />
                      <button
                        type="submit"
                        className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
                      >
                        {module.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                    {confirmDelete ? (
                      <form action={textModuleRowAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={module.id} />
                        <input type="hidden" name="value" value="delete" />
                        <span className="text-[11.5px] text-danger">
                          Delete this snippet for good?
                        </span>
                        <button
                          type="submit"
                          className="text-[11.5px] font-medium text-danger underline-offset-2 hover:underline"
                        >
                          Yes, delete
                        </button>
                        <Link
                          href="/modules/tickets/masters/text-modules"
                          className="text-[11.5px] text-muted hover:text-navy"
                        >
                          Cancel
                        </Link>
                      </form>
                    ) : (
                      <Link
                        href={`/modules/tickets/masters/text-modules?delete=${module.id}`}
                        className="text-[11.5px] text-muted underline-offset-2 hover:text-danger hover:underline"
                      >
                        Delete
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
