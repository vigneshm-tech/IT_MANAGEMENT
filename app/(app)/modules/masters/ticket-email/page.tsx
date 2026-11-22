import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Inbox, Mail, Send } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketEmailForm } from "@/components/modules/ticket-email-form";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  getTicketEmailSettings,
  listTicketOutbox,
  listTicketQueues,
} from "@/lib/records/repository";
import { maskAddress, outboxStatusLabel } from "@/lib/tickets/email";
import { saveTicketEmailSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Email channel" };

export default async function TicketEmailPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  const [settings, queues, outbox] = await Promise.all([
    getTicketEmailSettings(),
    listTicketQueues(),
    listTicketOutbox(undefined, 10),
  ]);
  const canEdit = can(user.role, "masters", "edit");
  const queueName = queues.find((queue) => queue.id === settings.defaultQueueId)?.name ?? "—";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Email channel"
        actions={
          <Link href="/modules/masters" className={buttonClass({ variant: "secondary", size: "sm" })}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Masters
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-4 text-[12px] text-muted">
          <StatusPill
            status={settings.enabled ? "active" : "inactive"}
            label={settings.enabled ? "On" : "Off"}
          />
          <span className="inline-flex items-center gap-1">
            <Mail className="h-3 w-3" aria-hidden />
            {maskAddress(settings.address)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Inbox className="h-3 w-3" aria-hidden />
            {queueName}
          </span>
          <span>Updated {formatDateTime(settings.updatedAt)}</span>
        </div>
      </PageHeader>

      <TicketEmailForm
        action={saveTicketEmailSettingsAction}
        settings={settings}
        queues={queues}
        canEdit={canEdit}
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="border border-line bg-surface px-4 py-3.5">
          <h2 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-navy">
            <Inbox className="h-3.5 w-3.5" aria-hidden />
            Inbound
          </h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Your mail worker posts each message to{" "}
            <code className="rounded bg-[#f2f5fa] px-1 py-0.5 font-mono text-[11px]">
              POST /api/tickets/inbound
            </code>{" "}
            with{" "}
            <code className="rounded bg-[#f2f5fa] px-1 py-0.5 font-mono text-[11px]">
              Authorization: Bearer $TICKET_INBOUND_SECRET
            </code>
            . A message whose subject carries <code className="font-mono text-[11px]">[TT-1001]</code> and
            whose sender is on that ticket is appended; anything else opens a ticket in the queue above.
          </p>
        </div>
        <div className="border border-line bg-surface px-4 py-3.5">
          <h2 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-navy">
            <Send className="h-3.5 w-3.5" aria-hidden />
            Outbound
          </h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Replies are written to the outbox, and the dispatcher at{" "}
            <code className="rounded bg-[#f2f5fa] px-1 py-0.5 font-mono text-[11px]">
              POST /api/tickets/outbox
            </code>{" "}
            empties it three attempts at a time. It stays inert until the relay URL above and the
            dispatcher secret are set.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-[13px] font-semibold text-navy">Recent outbox</h2>
        {outbox.length === 0 ? (
          <p className="mt-2 border border-line bg-surface px-4 py-4 text-[12.5px] text-muted">
            Nothing has been queued yet. An agent&apos;s public reply fills this once the channel is on.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line border-y border-line bg-surface">
            {outbox.map((item) => (
              <li key={item.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Link
                    href={`/modules/tickets/${item.ticketId}`}
                    className="font-mono text-[11.5px] text-navy hover:underline"
                  >
                    {item.ticketId}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-body">{item.subject}</span>
                  <span className="text-[11px] text-muted">{outboxStatusLabel(item.status)}</span>
                  {item.attempts > 0 && (
                    <span className="text-[11px] text-muted">
                      {item.attempts} {item.attempts === 1 ? "attempt" : "attempts"}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11.5px] text-muted">
                  To {item.toAddress} · queued {formatDateTime(item.createdAt)}
                  {item.lastError ? ` · ${item.lastError}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
