import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, Mail } from "lucide-react";
import { PublicTicketForm } from "@/components/support/public-ticket-form";
import { listPublicTicketQueues } from "@/lib/records/repository";

/**
 * Public pages read the live shelf, so they must not be frozen at build time —
 * a build has no session and would bake the fallback in.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Raise a ticket",
  description: "Contact the IT service desk without an account.",
};

export default async function NewTicketPage() {
  const queues = await listPublicTicketQueues();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/support"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-navy"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Support
        </Link>
        <h1 className="mt-2 font-logo text-[24px] leading-tight text-navy">Raise a ticket</h1>
        <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
          No account needed — we reply to the address you give us.
        </p>
      </div>

      {queues.length === 0 ? (
        <p className="border border-line bg-surface px-4 py-4 text-[12.5px] text-muted">
          The desk is not accepting public tickets right now. Please call the service desk.
        </p>
      ) : (
        <PublicTicketForm queues={queues} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <p className="flex items-start gap-2 border border-line bg-surface px-4 py-3 text-[11.5px] leading-relaxed text-muted">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy" aria-hidden />
          Replies are measured in office hours.
        </p>
        <p className="flex items-start gap-2 border border-line bg-surface px-4 py-3 text-[11.5px] leading-relaxed text-muted">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy" aria-hidden />
          Already have a ticket number? Reply to our last email and keep it in the subject line.
        </p>
      </div>
    </div>
  );
}
