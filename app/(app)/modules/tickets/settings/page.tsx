import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Globe, Inbox, Mail, Send, Timer, Zap } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketAdminTabs } from "@/components/modules/ticket-admin-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  getTicketEmailSettings,
  listKbArticles,
  listKbCategories,
  listTicketCalendars,
  listTicketMacros,
  listTicketOutbox,
  listTicketQueues,
  listTicketSlas,
  listTicketTextModules,
  listTicketTriggers,
} from "@/lib/records/repository";
import { canReadTicketAdmin } from "@/lib/tickets/admin";
import { maskAddress, outboxStatusLabel } from "@/lib/tickets/email";

export const metadata: Metadata = { title: "Ticket settings" };

/**
 * The outward-facing half of ticket configuration: what the public can reach and
 * how mail gets in and out.
 *
 * The registers themselves — queues, targets, triggers, macros, snippets, KB
 * shelves — are one click away under Masters. This page answers "is the channel
 * on, and where does it point?" rather than repeating the forms.
 */
export default async function TicketSettingsPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }
  if (!canReadTicketAdmin(user.role)) {
    return <AccessDenied moduleTitle="Ticket settings" />;
  }

  const [mail, queues, outbox, categories, articles, slas, calendars, triggers, macros, snippets] =
    await Promise.all([
      getTicketEmailSettings(),
      listTicketQueues(),
      listTicketOutbox(undefined, 5),
      listKbCategories(true),
      listKbArticles({ includeInternal: true, includeInactive: true }),
      listTicketSlas(true),
      listTicketCalendars(true),
      listTicketTriggers(true),
      listTicketMacros(true),
      listTicketTextModules(true),
    ]);

  const publicQueues = queues.filter((queue) => queue.isPublic && queue.status === "active");
  const publicArticles = articles.filter(
    (article) => article.visibility === "public" && article.status === "active",
  );
  const queued = outbox.filter((item) => item.status === "queued").length;
  const failed = outbox.filter((item) => item.status === "failed").length;

  const registers = [
    { href: "/modules/tickets/masters/queues", label: "Queues", count: queues.length, noun: "queues" },
    {
      href: "/modules/tickets/masters/service-targets",
      label: "Targets & shifts",
      count: slas.length + calendars.length,
      noun: "promises and shifts",
    },
    { href: "/modules/tickets/masters/triggers", label: "Triggers", count: triggers.length, noun: "rules" },
    { href: "/modules/tickets/masters/macros", label: "Macros", count: macros.length, noun: "macros" },
    {
      href: "/modules/tickets/masters/text-modules",
      label: "Text modules",
      count: snippets.length,
      noun: "snippets",
    },
    {
      href: "/modules/tickets/masters/kb-categories",
      label: "KB categories",
      count: categories.length,
      noun: "shelves",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Settings">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <TicketAdminTabs active="settings" />
          <p className="text-[12px] text-muted">
            The public form, the knowledge base and the mailbox — and the registers they read from
          </p>
        </div>
      </PageHeader>

      <section className="grid gap-3 sm:grid-cols-2">
        <article className="border border-line bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <h2 className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-navy">
              <Globe className="h-3.5 w-3.5" aria-hidden />
              Public web form
            </h2>
            <StatusPill
              status={publicQueues.length > 0 ? "active" : "inactive"}
              label={publicQueues.length > 0 ? "Live" : "Closed"}
            />
          </div>
          <div className="px-4 py-3 text-[11.5px] leading-relaxed text-muted">
            <p>
              Anyone can file at{" "}
              <Link href="/support/new" className="text-navy underline-offset-2 hover:underline">
                /support/new
              </Link>{" "}
              — no account, five submissions an hour, and never into an internal queue.
            </p>
            <p className="mt-2">
              {publicQueues.length === 0
                ? "No queue is offered yet, so the form tells visitors to email instead."
                : `Offered into ${publicQueues.map((queue) => queue.name).join(", ")}.`}
            </p>
            <Link
              href="/modules/tickets/masters/queues"
              className="mt-2 inline-block text-[11.5px] text-navy underline underline-offset-2"
            >
              Choose which queues are offered
            </Link>
          </div>
        </article>

        <article className="border border-line bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <h2 className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-navy">
              <Mail className="h-3.5 w-3.5" aria-hidden />
              Email channel
            </h2>
            <StatusPill
              status={mail.enabled ? "active" : "inactive"}
              label={mail.enabled ? "On" : "Off"}
            />
          </div>
          <div className="px-4 py-3 text-[11.5px] leading-relaxed text-muted">
            <p>
              {mail.enabled
                ? "Replies to the support address open tickets in the queue below; replies carry [TT-…] in the subject."
                : "The channel is off. Nothing is filed from mail and no reply is queued."}
            </p>
            <p className="mt-2">
              Address{" "}
              <span className="font-mono text-[11px] text-body">
                {mail.address ? maskAddress(mail.address) : "not set"}
              </span>{" "}
              · inbound into{" "}
              <span className="text-body">
                {queues.find((queue) => queue.id === mail.defaultQueueId)?.name ?? "no queue"}
              </span>
            </p>
            <p className="mt-1">
              Outbox: {queued} queued, {failed} failed · updated {formatDateTime(mail.updatedAt)}
            </p>
            <Link
              href="/modules/tickets/settings/email"
              className="mt-2 inline-block text-[11.5px] text-navy underline underline-offset-2"
            >
              Open the email channel
            </Link>
          </div>
        </article>

        <article className="border border-line bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <h2 className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-navy">
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              Knowledge base
            </h2>
            <StatusPill
              status={publicArticles.length > 0 ? "active" : "inactive"}
              label={publicArticles.length > 0 ? "Published" : "Empty"}
            />
          </div>
          <div className="px-4 py-3 text-[11.5px] leading-relaxed text-muted">
            <p>
              {articles.length} articles across {categories.length} shelves — {publicArticles.length}{" "}
              readable without an account, {articles.length - publicArticles.length} internal.
            </p>
            <p className="mt-2">
              Public readers see{" "}
              <Link href="/support/kb" className="text-navy underline-offset-2 hover:underline">
                /support/kb
              </Link>
              ; agents write at{" "}
              <Link href="/modules/kb" className="text-navy underline-offset-2 hover:underline">
                /modules/kb
              </Link>
              .
            </p>
            <Link
              href="/modules/tickets/masters/kb-categories"
              className="mt-2 inline-block text-[11.5px] text-navy underline underline-offset-2"
            >
              Manage the shelves
            </Link>
          </div>
        </article>

        <article className="border border-line bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <h2 className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-navy">
              <Send className="h-3.5 w-3.5" aria-hidden />
              Recent outbox
            </h2>
            <span className="text-[11px] text-muted">{outbox.length} shown</span>
          </div>
          {outbox.length === 0 ? (
            <p className="px-4 py-3 text-[11.5px] text-muted">
              Nothing queued yet. An agent&apos;s public reply lands here once the channel is on.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {outbox.map((item) => (
                <li key={item.id} className="px-4 py-2.5 text-[11.5px]">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/modules/tickets/${item.ticketId}`}
                      className="font-mono text-[11px] text-navy hover:underline"
                    >
                      {item.ticketId}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-body">{item.subject}</span>
                    <span className="text-muted">{outboxStatusLabel(item.status)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-navy">
          <Zap className="h-4 w-4" aria-hidden />
          What the channels read from
        </h2>
        <p className="text-[11.5px] text-muted">
          Every register below is editable, and adding to one is a form on its own page.
        </p>
        <ul className="divide-y divide-line border-y border-line bg-surface">
          {registers.map((register) => (
            <li key={register.href}>
              <Link
                href={register.href}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#f4f7fc] focus-visible:bg-[#f4f7fc] focus-visible:outline-none sm:px-5"
              >
                <span className="flex-1 text-[12.5px] text-navy">{register.label}</span>
                <span className="text-[11.5px] tabular-nums text-muted">
                  {register.count} {register.noun}
                </span>
                <Inbox className="h-3.5 w-3.5 text-[#b9c4d6]" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="flex items-start gap-2 text-[11.5px] text-muted">
        <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Secrets — the inbound and outbound tokens, the sweep key — live in the deployment
        environment, not here. The mail worker posts to /api/tickets/inbound and the dispatcher
        empties /api/tickets/outbox.
      </p>
    </div>
  );
}
