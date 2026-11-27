import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessModule } from "@/lib/access";
import type { ModuleId } from "@/lib/modules";
import type { SessionUser } from "@/lib/auth/token";

type CountKey = "activityTypes" | "industries" | "requestTypes" | "customFields";

/**
 * Master registers owned by this hub.
 *
 * Everything that configures ticketing — queues, targets and shifts, triggers,
 * macros, text modules, KB categories and the email channel — now lives inside
 * the Tickets module instead, so it is not listed here at all.
 */
const REGISTERS: {
  key: CountKey;
  title: string;
  summary: string;
  href: string;
  noun: string;
  /** Which module's access rule governs the register. */
  guard: ModuleId;
}[] = [
  {
    key: "activityTypes",
    title: "Activity types",
    summary: "Activity types offered in the task form",
    href: "/modules/masters/activity-types",
    noun: "types",
    guard: "masters",
  },
  {
    key: "industries",
    title: "Industries",
    summary: "Industries offered in the client form",
    href: "/modules/masters/industries",
    noun: "industries",
    guard: "masters",
  },
  {
    key: "requestTypes",
    title: "Request types",
    summary: "Request types offered in the approval form",
    href: "/modules/masters/request-types",
    noun: "types",
    guard: "masters",
  },
  {
    key: "customFields",
    title: "Custom fields",
    summary: "Extra fields for each module",
    href: "/modules/masters/custom-fields",
    noun: "fields",
    guard: "masters",
  },
];

export function MastersView({
  user,
  counts,
}: {
  user: SessionUser;
  counts: Record<CountKey, number>;
}) {
  const registers = REGISTERS.filter((register) => canAccessModule(user.role, register.guard));

  return (
    <div className="space-y-5">
      <PageHeader title="Masters" />

      <ul className="divide-y divide-line border-y border-line bg-surface">
        {registers.map(({ key, title, summary, href, noun }) => (
          <li key={key}>
            <Link
              href={href}
              className="group flex items-center gap-4 px-4 py-4 transition-colors duration-200 hover:bg-[#f4f7fc] focus-visible:bg-[#f4f7fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/70 sm:px-5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-navy">{title}</span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">{summary}</span>
              </span>

              <span className="shrink-0 text-right">
                <span className="block text-[15px] font-medium tabular-nums text-navy">
                  {counts[key]}
                </span>
                <span className="block text-[11px] uppercase tracking-[0.14em] text-muted">
                  {noun}
                </span>
              </span>

              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-[#b9c4d6] transition-colors duration-200 group-hover:text-navy"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
