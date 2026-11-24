import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { SettingsTabs } from "@/components/modules/settings-tabs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessModule, visibleModules } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/lib/auth/actions";
import { roleOf } from "@/lib/roles";

export const metadata: Metadata = { title: "Profile" };

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd className="mt-1 text-[13px] text-body">{value || "—"}</dd>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export default async function ProfileSettingsPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "settings")) {
    return <AccessDenied moduleTitle="Settings" />;
  }

  const role = roleOf(user.role);
  const modules = visibleModules(user.role);

  return (
    <div className="space-y-5">
      <PageHeader title="Profile">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <SettingsTabs active="profile" />
          <p className="text-[12px] text-muted">
            Read-only here: your name, title and access level belong to the directory, not to the
            page you happen to be on.
          </p>
        </div>
      </PageHeader>

      <section aria-labelledby="identity-heading">
        <h2 id="identity-heading" className="text-[13px] font-semibold text-navy">
          Identity
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-10 gap-y-5 border-y border-line py-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name" value={user.name} />
          <Field label="Email" value={user.email} hint="The address you sign in with" />
          <Field label="Job title" value={user.title} />
          <Field label="Access level" value={role.label} />
        </dl>
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          {role.description}
        </p>
      </section>

      <section aria-labelledby="access-heading">
        <h2 id="access-heading" className="text-[13px] font-semibold text-navy">
          What this access level opens
        </h2>
        <p className="mt-1 text-[11.5px] text-muted">
          {modules.length} {modules.length === 1 ? "module" : "modules"}. Permissions are the same
          ones the server enforces on every action — this list is a report, not a switch.
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {modules.map((module) => (
            <li key={module.id}>
              <Link
                href={module.href}
                className="inline-flex items-center border border-line bg-surface px-2 py-1 text-[11.5px] text-navy transition-colors hover:bg-[#f4f7fc]"
              >
                {module.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-line py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-navy-soft" aria-hidden />
            <div>
              <p className="text-[12.5px] text-body">
                Changes to your name, title or access level are made by whoever administers the
                directory
                {canAccessModule(user.role, "users") ? " — for you that is Users & groups" : ""}.
              </p>
              {canAccessModule(user.role, "users") && (
                <Link
                  href="/modules/users"
                  className="mt-1 inline-block text-[11.5px] text-navy underline underline-offset-2"
                >
                  Open Users & groups
                </Link>
              )}
            </div>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary" size="sm">
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
