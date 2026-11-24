import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Inbox } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketAdminTabs } from "@/components/modules/ticket-admin-tabs";
import { TicketQueueForm } from "@/components/modules/ticket-queue-form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listTicketQueues } from "@/lib/records/repository";
import { canConfigureTickets, canReadTicketAdmin } from "@/lib/tickets/admin";
import { saveTicketQueueAction, ticketQueueRowAction } from "./actions";

export const metadata: Metadata = { title: "Queues" };

export default async function TicketQueuesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; delete?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }
  if (!canReadTicketAdmin(user.role)) {
    return <AccessDenied moduleTitle="Queues" />;
  }

  const { edit, delete: deleteId } = await searchParams;
  const queues = await listTicketQueues(true);
  const canEdit = canConfigureTickets(user.role);
  const editing = edit ? queues.find((queue) => queue.id === edit) : undefined;

  return (
    <div className="space-y-5">
      <PageHeader title="Queues">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <TicketAdminTabs active="queues" />
        </div>
      </PageHeader>

      <TicketQueueForm
        action={saveTicketQueueAction}
        queue={editing}
        canEdit={canEdit}
      />

      <ul className="divide-y divide-line border-y border-line bg-surface">
        {queues.map((queue) => {
          const confirming = deleteId === queue.id;
          return (
            <li key={queue.id} className="px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-navy">
                  <Inbox className="h-3.5 w-3.5 text-muted" aria-hidden />
                  {queue.name}
                </span>
                <StatusPill
                  status={queue.status}
                  label={queue.status === "active" ? "Active" : "Inactive"}
                />
                {queue.isPublic && (
                  <span className="inline-flex items-center gap-1 border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                    <Globe className="h-2.5 w-2.5" aria-hidden />
                    Public
                  </span>
                )}
                <span className="ml-auto font-mono text-[11px] text-muted">{queue.id}</span>
              </div>
              {queue.description && (
                <p className="mt-1 text-[12px] text-muted">{queue.description}</p>
              )}

              {canEdit && (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/modules/tickets/masters/queues?edit=${queue.id}`}
                    className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
                  >
                    Edit
                  </Link>
                  <form action={ticketQueueRowAction}>
                    <input type="hidden" name="id" value={queue.id} />
                    <input type="hidden" name="value" value="toggle" />
                    <button
                      type="submit"
                      className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
                    >
                      {queue.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                  {queue.status === "active" && (
                    <form action={ticketQueueRowAction}>
                      <input type="hidden" name="id" value={queue.id} />
                      <input type="hidden" name="value" value="public" />
                      <button
                        type="submit"
                        className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
                      >
                        {queue.isPublic ? "Take off the public form" : "Offer on the public form"}
                      </button>
                    </form>
                  )}
                  {confirming ? (
                    <form action={ticketQueueRowAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={queue.id} />
                      <input type="hidden" name="value" value="delete" />
                      <span className="text-[11.5px] text-danger">Delete this queue?</span>
                      <button
                        type="submit"
                        className="text-[11.5px] font-medium text-danger underline-offset-2 hover:underline"
                      >
                        Yes, delete
                      </button>
                      <Link
                        href="/modules/tickets/masters/queues"
                        className="text-[11.5px] text-muted hover:text-navy"
                      >
                        Cancel
                      </Link>
                    </form>
                  ) : (
                    <Link
                      href={`/modules/tickets/masters/queues?delete=${queue.id}`}
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

      <p className="text-[11.5px] text-muted">
        A queue holding tickets cannot be deleted — deactivate it instead.
      </p>
    </div>
  );
}
