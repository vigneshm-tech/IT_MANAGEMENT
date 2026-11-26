import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { PageHeader } from "@/components/ui/page-header";
import { TicketAdminTabs } from "@/components/modules/ticket-admin-tabs";
import { canAccessModule, canAccessPage } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { canReadTicketAdmin } from "@/lib/tickets/admin";
import {
  listKbCategories,
  listTicketCalendars,
  listTicketMacros,
  listTicketQueues,
  listTicketSlas,
  listTicketTextModules,
  listTicketTriggers,
} from "@/lib/records/repository";

export const metadata: Metadata = { title: "Ticket masters" };

/**
 * The ticket registers, in one place.
 *
 * Each row is a register the desk can add to and change: queues, the promises
 * and the clock they run on, the triggers that fire as tickets move, the
 * one-click macros, the reply snippets and the knowledge-base shelves.
 */
export default async function TicketMastersPage() {
  const user = await requireUser();
  if (!canAccessPage(user.role, "tickets", "masters")) {
    return <AccessDenied moduleTitle="Ticket masters" />;
  }

  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }
  if (!canReadTicketAdmin(user.role)) {
    return <AccessDenied moduleTitle="Ticket masters" />;
  }

  const [queues, slas, calendars, triggers, macros, textModules, kbCategories] = await Promise.all([
    listTicketQueues(true),
    listTicketSlas(true),
    listTicketCalendars(true),
    listTicketTriggers(true),
    listTicketMacros(true),
    listTicketTextModules(true),
    listKbCategories(true),
  ]);

  const registers = [
    {
      id: "queues",
      title: "Queues",
      summary: "Who a ticket belongs to",
      href: "/modules/tickets/masters/queues",
      count: queues.length,
      noun: "queues",
      detail: `${queues.filter((queue) => queue.isPublic).length} public`,
    },
    {
      id: "targets",
      title: "Targets & shifts",
      summary: "Reply targets and office hours",
      href: "/modules/tickets/masters/service-targets",
      count: slas.length,
      noun: "targets",
      detail: `${calendars.length} ${calendars.length === 1 ? "shift" : "shifts"}`,
    },
    {
      id: "triggers",
      title: "Triggers",
      summary: "Automatic changes when a ticket is raised or answered",
      href: "/modules/tickets/masters/triggers",
      count: triggers.length,
      noun: "triggers",
      detail: `${triggers.filter((trigger) => trigger.status === "active").length} active`,
    },
    {
      id: "macros",
      title: "Macros",
      summary: "One-click bundles of state, priority, queue and tags",
      href: "/modules/tickets/masters/macros",
      count: macros.length,
      noun: "macros",
      detail: `${macros.filter((macro) => macro.status === "active").length} active`,
    },
    {
      id: "text-modules",
      title: "Text modules",
      summary: "Reply snippets an agent inserts instead of retyping",
      href: "/modules/tickets/masters/text-modules",
      count: textModules.length,
      noun: "snippets",
      detail: `${textModules.filter((item) => item.status === "active").length} active`,
    },
    {
      id: "kb-categories",
      title: "KB categories",
      summary: "Groups for knowledge base articles",
      href: "/modules/tickets/masters/kb-categories",
      count: kbCategories.length,
      noun: "categories",
      detail: `${kbCategories.filter((category) => category.status === "active").length} active`,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ticket masters"
        actions={
          <Link
            href="/modules/tickets"
            className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-[12px] font-medium text-navy hover:bg-[#f2f5fa]"
          >
            Back to the board
          </Link>
        }
      >
        <div className="pb-4">
          <TicketAdminTabs active="hub" />
        </div>
      </PageHeader>

      <ul className="divide-y divide-line border-y border-line bg-surface">
        {registers.map((register) => (
          <li key={register.id}>
            <Link
              href={register.href}
              className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-[#f4f7fc] focus-visible:bg-[#f4f7fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/70 sm:px-5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-navy">{register.title}</span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">
                  {register.summary}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[15px] font-medium tabular-nums text-navy">
                  {register.count}
                </span>
                <span className="block text-[11px] uppercase tracking-[0.14em] text-muted">
                  {register.noun}
                </span>
              </span>
              <span className="hidden w-24 shrink-0 text-right text-[11.5px] text-muted sm:block">
                {register.detail}
              </span>
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-[#b9c4d6] transition-colors group-hover:text-navy"
              />
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-[11.5px] text-muted">
        The public form, the knowledge base and the email channel are configured in{" "}
        <Link
          href="/modules/tickets/settings"
          className="text-navy underline-offset-2 hover:underline"
        >
          Ticket settings
        </Link>
        .
      </p>
    </div>
  );
}
