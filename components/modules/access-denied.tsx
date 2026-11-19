import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ModuleGlyph } from "@/components/module-glyph";
import { RoleBadge } from "@/components/role-badge";
import { ROLE_BY_ID } from "@/lib/roles";
import type { ModuleDefinition } from "@/lib/modules";
import type { RoleId } from "@/lib/roles";

export function AccessDenied({
  module,
  role,
}: {
  module: ModuleDefinition;
  role: RoleId;
}) {
  const allowed =
    module.access.view === "all" ? [] : module.access.view.map((id) => ROLE_BY_ID[id]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative overflow-hidden rounded-3xl border border-danger/20 bg-surface/70 p-8 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-danger/15 blur-3xl"
        />

        <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-danger/25 bg-danger/10 text-danger">
          <Lock className="h-7 w-7" aria-hidden />
        </span>

        <h2 className="relative mt-5 text-[22px] font-semibold tracking-tight text-ink">
          This module is restricted
        </h2>
        <p className="relative mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
          <span className="font-medium text-ink">{module.title}</span> isn’t available for your role.
          Your access is checked again on the server, so a direct link never bypasses the rule.
        </p>

        <div className="relative mt-4 flex justify-center">
          <RoleBadge role={role} />
        </div>

        {allowed.length > 0 && (
          <div className="relative mt-6 rounded-2xl border border-line/70 bg-base/40 p-4 text-left">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Roles with access
            </p>
            <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {allowed.map((allowedRole) => (
                <li key={allowedRole.id} className="flex items-center gap-2 text-[12px] text-muted">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: allowedRole.accent }}
                    aria-hidden
                  />
                  {allowedRole.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="relative mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/modules/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-2/70 px-4 py-2.5 text-[12.5px] font-medium text-ink transition hover:border-white/20 hover:bg-surface-3"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
          <Link
            href="/modules/settings"
            className="inline-flex items-center gap-2 rounded-xl border border-brand/35 bg-brand/10 px-4 py-2.5 text-[12.5px] font-medium text-brand-soft transition hover:bg-brand/20"
          >
            <ModuleGlyph name="Settings" className="h-4 w-4" />
            Request access
          </Link>
        </div>
      </div>
    </div>
  );
}
