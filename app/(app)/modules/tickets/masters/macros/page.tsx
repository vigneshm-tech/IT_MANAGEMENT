import type { Metadata } from "next";
import Link from "next/link";
import { Zap } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketAdminTabs } from "@/components/modules/ticket-admin-tabs";
import { TicketMacroForm } from "@/components/modules/ticket-macro-admin-form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listTicketMacros, listTicketQueues } from "@/lib/records/repository";
import { canConfigureTickets, canReadTicketAdmin } from "@/lib/tickets/admin";
import { macroSummary } from "@/lib/tickets/core";
import { saveTicketMacroAction, ticketMacroRowAction } from "./actions";

export const metadata: Metadata = { title: "Macros" };

export default async function TicketMacrosPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; delete?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }
  if (!canReadTicketAdmin(user.role)) {
    return <AccessDenied moduleTitle="Macros" />;
  }

  const { edit, delete: deleteId } = await searchParams;
  const [macros, queues] = await Promise.all([listTicketMacros(true), listTicketQueues()]);
  const canEdit = canConfigureTickets(user.role);
  const editing = edit ? macros.find((macro) => macro.id === edit) : undefined;
  const active = macros.filter((macro) => macro.status === "active").length;

  return (
    <div className="space-y-5">
      <PageHeader title="Macros">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <TicketAdminTabs active="macros" />
          <p className="text-[12px] text-muted">
            {active} active of {macros.length} · an agent picks one and the whole bundle is applied
          </p>
        </div>
      </PageHeader>

      {canEdit ? (
        <TicketMacroForm
          key={editing?.id ?? "new"}
          action={saveTicketMacroAction}
          queues={queues}
          macro={editing}
        />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Your role can read macros but not change them.
        </p>
      )}

      {macros.length === 0 ? (
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-navy">No macros yet</p>
            <p className="mt-1 text-[12.5px] text-muted">
              Add the bundles agents apply most: escalate, park on the requester, close as duplicate.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line bg-surface">
          {macros.map((macro) => (
            <li
              key={macro.id}
              className={
                editing?.id === macro.id ? "border-l-2 border-navy px-4 py-3 sm:px-5" : "px-4 py-3 sm:px-5"
              }
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[13px] font-medium text-navy">{macro.name}</span>
                <StatusPill
                  status={macro.status}
                  label={macro.status === "active" ? "Active" : "Inactive"}
                />
                <span className="ml-auto font-mono text-[11px] text-muted">{macro.id}</span>
              </div>
              <p className="mt-1 text-[12px] text-muted">{macroSummary(macro)}</p>
              {macro.description && (
                <p className="mt-0.5 text-[11.5px] text-muted">{macro.description}</p>
              )}
              {macro.note && (
                <p className="mt-1 border-l-2 border-line pl-2 text-[11.5px] italic text-muted">
                  Thread note: {macro.note}
                </p>
              )}

              {canEdit && (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/modules/tickets/masters/macros?edit=${macro.id}`}
                    className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
                  >
                    Edit
                  </Link>
                  <form action={ticketMacroRowAction}>
                    <input type="hidden" name="id" value={macro.id} />
                    <input type="hidden" name="value" value="toggle" />
                    <button
                      type="submit"
                      className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
                    >
                      {macro.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                  {deleteId === macro.id ? (
                    <form action={ticketMacroRowAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={macro.id} />
                      <input type="hidden" name="value" value="delete" />
                      <span className="text-[11.5px] text-danger">Delete this macro?</span>
                      <button
                        type="submit"
                        className="text-[11.5px] font-medium text-danger underline-offset-2 hover:underline"
                      >
                        Yes, delete
                      </button>
                      <Link
                        href="/modules/tickets/masters/macros"
                        className="text-[11.5px] text-muted hover:text-navy"
                      >
                        Cancel
                      </Link>
                    </form>
                  ) : (
                    <Link
                      href={`/modules/tickets/masters/macros?delete=${macro.id}`}
                      className="text-[11.5px] text-muted underline-offset-2 hover:text-danger hover:underline"
                    >
                      Delete
                    </Link>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
