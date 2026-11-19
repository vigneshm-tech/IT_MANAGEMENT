import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessModule } from "@/lib/access";
import { MODULE_BY_ID, type ModuleId } from "@/lib/modules";
import type { SessionUser } from "@/lib/auth/token";

/**
 * Master registers. The hub only lists what the signed-in role may open, and
 * every count is read from the same repository that feeds the register itself.
 */
const REGISTERS: { id: ModuleId; noun: string }[] = [
  { id: "clients", noun: "clients" },
  { id: "renewals", noun: "renewals" },
  { id: "patching", noun: "plans" },
];

export function MastersView({
  user,
  counts,
}: {
  user: SessionUser;
  counts: Record<"clients" | "renewals" | "patching", number>;
}) {
  const registers = REGISTERS.filter((register) => canAccessModule(user.role, register.id));

  return (
    <div className="space-y-5">
      <PageHeader title="Masters" />

      <ul className="divide-y divide-line border-y border-line bg-surface">
        {registers.map(({ id, noun }) => {
          const module = MODULE_BY_ID[id];
          const count = counts[id as "clients" | "renewals" | "patching"];

          return (
            <li key={id}>
              <Link
                href={module.href}
                className="group flex items-center gap-4 px-4 py-4 transition-colors duration-200 hover:bg-[#f4f7fc] focus-visible:bg-[#f4f7fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/70 sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-navy">{module.title}</span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">
                    {module.summary}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-medium tabular-nums text-navy">
                    {count}
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
          );
        })}
      </ul>
    </div>
  );
}
