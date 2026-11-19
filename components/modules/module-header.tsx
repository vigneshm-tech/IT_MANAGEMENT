import clsx from "clsx";
import { ArrowLeft, Check, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { ModuleGlyph } from "@/components/module-glyph";
import { RoleBadge } from "@/components/role-badge";
import { accessMap } from "@/lib/access";
import type { ModuleDefinition } from "@/lib/modules";
import type { RoleId } from "@/lib/roles";

export function ModuleHeader({
  module,
  role,
  status = "live",
}: {
  module: ModuleDefinition;
  role: RoleId;
  status?: "live" | "setup" | "planned";
}) {
  const access = accessMap(role)[module.id];
  const grants = [
    access.view && "View",
    access.edit && "Edit",
    access.approve && "Approve",
    access.admin && "Admin",
  ].filter(Boolean) as string[];

  const statusMeta = {
    live: { label: "Live", className: "border-success/25 bg-success/10 text-success", icon: Check },
    setup: { label: "Needs setup", className: "border-warning/25 bg-warning/10 text-warning", icon: Sparkles },
    planned: { label: "Next milestone", className: "border-line bg-surface-2 text-muted", icon: Lock },
  }[status];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-line/80 bg-surface/60 p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full blur-3xl"
        style={{ backgroundColor: `${module.accent}22` }}
      />

      <Link
        href="/modules/dashboard"
        className="relative inline-flex items-center gap-1.5 text-[11.5px] text-muted transition hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All modules
      </Link>

      <div className="relative mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"
            style={{ color: module.accent, boxShadow: `0 16px 40px -24px ${module.accent}` }}
          >
            <ModuleGlyph name={module.icon} className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[22px] font-semibold tracking-tight text-ink">{module.title}</h2>
              <span
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  statusMeta.className,
                )}
              >
                <statusMeta.icon className="h-3 w-3" aria-hidden />
                {statusMeta.label}
              </span>
            </div>
            <p className="mt-1 text-[13px] font-medium text-ink/80">{module.tagline}</p>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
              {module.description}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
          <RoleBadge role={role} size="sm" />
          {grants.map((grant) => (
            <span
              key={grant}
              className="rounded-md border border-line bg-surface-2/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted"
            >
              {grant}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
