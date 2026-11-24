import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketsPortalView } from "@/components/modules/tickets-portal-view";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { isTicketView, loadTickets } from "@/lib/tickets/portal";

export const metadata: Metadata = { title: "Redmine portal" };

export default async function RedminePortalPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; created?: string }>;
}) {
  const user = await requireUser();

  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }

  const { view, created } = await searchParams;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/modules/tickets"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-navy"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Tickets
        </Link>
        <p className="text-[11.5px] text-muted">
          These issues live in Redmine.
        </p>
      </div>

      <TicketsPortalView
        data={await loadTickets(user.id, isTicketView(view) ? view : "mine")}
        createdId={created}
      />
    </div>
  );
}
