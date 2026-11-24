import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Mail, Send } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketAdminTabs } from "@/components/modules/ticket-admin-tabs";
import { TicketEmailForm } from "@/components/modules/ticket-email-form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  getTicketEmailSettings,
  listTicketOutbox,
  listTicketQueues,
} from "@/lib/records/repository";
import { canConfigureTickets, canReadTicketAdmin } from "@/lib/tickets/admin";
import { maskAddress, outboxStatusLabel } from "@/lib/tickets/email";
import { saveTicketEmailSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Email channel" };

export default async function TicketEmailPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }
  if (!canReadTicketAdmin(user.role)) {
    return <AccessDenied moduleTitle="Email channel" />;
  }

  const [settings, queues, outbox] = await Promise.all([
    getTicketEmailSettings(),
    listTicketQueues(),
    listTicketOutbox(undefined, 10),
  ]);
  const canEdit = canConfigureTickets(user.role);
  const queueName = queues.find((queue) => queue.id === settings.defaultQueueId)?.name ?? "—";

  return (
    <div className="space-y-5">
      <PageHeader title="Email channel">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-4 text-[12px] text-muted">
          <TicketAdminTabs active="settings" />
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
          <p className="mt-1 text-[11.5px] text-muted">
            Mail arrives at{" "}
            <code className="rounded bg-[#f2f5fa] px-1 py-0.5 font-mono text-[11px]">
              POST /api/tickets/inbound
            </code>
            . A subject with <code className="font-mono text-[11px]">[TT-1001]</code> replies to that
            ticket; anything else opens a new one.
          </p>
        </div>
        <div className="border border-line bg-surface px-4 py-3.5">
          <h2 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-navy">
            <Send className="h-3.5 w-3.5" aria-hidden />
            Outbound
          </h2>
          <p className="mt-1 text-[11.5px] text-muted">
            Replies are queued and sent through{" "}
            <code className="rounded bg-[#f2f5fa] px-1 py-0.5 font-mono text-[11px]">
              POST /api/tickets/outbox
            </code>
            . Sending starts once the relay URL is set.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-[13px] font-semibold text-navy">Recent outbox</h2>
        {outbox.length === 0 ? (
          <p className="mt-2 border border-line bg-surface px-4 py-4 text-[12.5px] text-muted">
            Nothing queued yet.
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
