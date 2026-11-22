import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketCreateForm } from "@/components/modules/ticket-create-form";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listClients, listTicketQueues } from "@/lib/records/repository";

export const metadata: Metadata = { title: "New ticket" };

export default async function NewTicketPage() {
  const user = await requireUser();

  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }

  const canCreate = can(user.role, "tickets", "create");
  const [queues, clients] = await Promise.all([listTicketQueues(), listClients()]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="New ticket"
        actions={
          <Link href="/modules/tickets" className={buttonClass({ variant: "secondary", size: "sm" })}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Tickets
          </Link>
        }
      >
        <p className="text-[12.5px] text-muted">
          The ticket is stored in TaskTornado and lands in the queue you pick.
        </p>
      </PageHeader>

      {!canCreate ? (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Your role can read tickets but not raise them.
        </p>
      ) : queues.length === 0 ? (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          No ticket queue is active, so a ticket has nowhere to land.
        </p>
      ) : (
        <TicketCreateForm queues={queues} clients={clients} />
      )}
    </div>
  );
}
