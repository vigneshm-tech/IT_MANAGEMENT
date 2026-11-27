import Link from "next/link";

export type TicketAdminTab =
  | "hub"
  | "queues"
  | "targets"
  | "triggers"
  | "macros"
  | "text-modules"
  | "kb-categories"
  | "settings";

const TABS: { id: TicketAdminTab; label: string; href: string }[] = [
  { id: "hub", label: "Overview", href: "/modules/tickets/masters" },
  { id: "queues", label: "Queues", href: "/modules/tickets/masters/queues" },
  { id: "targets", label: "Targets & shifts", href: "/modules/tickets/masters/service-targets" },
  { id: "triggers", label: "Triggers", href: "/modules/tickets/masters/triggers" },
  { id: "macros", label: "Macros", href: "/modules/tickets/masters/macros" },
  { id: "text-modules", label: "Text modules", href: "/modules/tickets/masters/text-modules" },
  { id: "kb-categories", label: "KB categories", href: "/modules/tickets/masters/kb-categories" },
  { id: "settings", label: "Settings", href: "/modules/tickets/settings" },
];

/**
 * The strip that keeps ticket configuration inside the tickets module.
 *
 * Everything here used to be scattered through Masters and Settings; the strip
 * is the reason it now reads as one place — the same shape as the ticket list's
 * own tabs.
 */
export function TicketAdminTabs({ active }: { active: TicketAdminTab }) {
  return (
    <nav aria-label="Ticket configuration" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 px-1">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "inline-flex h-8 items-center rounded-md border border-navy bg-navy px-3 text-[12px] font-medium text-white"
                    : "inline-flex h-8 items-center rounded-md border border-transparent px-3 text-[12px] text-body transition-colors hover:border-line hover:bg-[#f4f7fc] hover:text-navy"
                }
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
