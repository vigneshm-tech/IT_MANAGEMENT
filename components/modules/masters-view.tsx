import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessModule } from "@/lib/access";
import type { ModuleId } from "@/lib/modules";
import type { SessionUser } from "@/lib/auth/token";

type CountKey = "activityTypes";

/**
 * Master registers owned by this hub. Clients, renewals and patching plans are
 * modules of their own and are not duplicated here.
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
    summary: "The vocabulary the task form offers for every request",
    href: "/modules/masters/activity-types",
    noun: "types",
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
