import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, KeyRound, LogOut, Plug, ShieldCheck, UserRound } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { SettingsTabs } from "@/components/modules/settings-tabs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessModule, visibleModules } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/lib/auth/actions";
import { roleOf } from "@/lib/roles";

export const metadata: Metadata = { title: "Profile" };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd className="mt-1 text-[13px] text-body">{value || "—"}</dd>
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

  const shortcuts = [
    {
      href: "/modules/settings/security",
      icon: ShieldCheck,
      title: "Security & sessions",
      summary: "Password, session and sign-out",
    },
    {
      href: "/modules/settings/integrations",
      icon: Plug,
      title: "Integrations",
      summary: "Redmine and Action1",
    },
    {
      href: "/modules/settings/developers",
      icon: KeyRound,
      title: "Developers",
      summary: "API keys and connected apps",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Profile">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <SettingsTabs active="profile" />
        </div>
      </PageHeader>

      <section className="border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-4 sm:px-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#eaeef6] text-navy">
            <UserRound className="h-5 w-5" strokeWidth={1.7} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-navy">{user.name}</p>
            <p className="text-[12px] text-muted">
              {user.title && user.title !== role.label
                ? `${user.title} · ${role.label}`
                : role.label}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-x-10 gap-y-5 px-4 py-5 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
          <Field label="Name" value={user.name} />
          <Field label="Email" value={user.email} />
          <Field label="Job title" value={user.title} />
          <Field label="Access level" value={role.label} />
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold text-navy">Access</h2>
        <div className="flex flex-wrap gap-1.5">
          {modules.map((module) => (
            <Link
              key={module.id}
              href={module.href}
              className="inline-flex items-center border border-line bg-surface px-2 py-1 text-[11.5px] text-navy transition-colors hover:bg-[#f4f7fc]"
            >
              {module.title}
            </Link>
          ))}
        </div>
      </section>

      {canAccessModule(user.role, "users") && (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold text-navy">Account administration</h2>
          <Link
            href="/modules/users"
            className="group flex items-center gap-3 border border-line bg-surface px-4 py-3 transition-colors hover:bg-[#f4f7fc]"
          >
            <UserRound className="h-4 w-4 shrink-0 text-muted group-hover:text-navy" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-navy">Users & groups</span>
              <span className="block text-[11.5px] text-muted">
                Add accounts, set access levels, manage groups
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#b9c4d6]" aria-hidden />
          </Link>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold text-navy">Account settings</h2>
        <ul className="divide-y divide-line border-y border-line bg-surface">
          {shortcuts.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#f4f7fc] sm:px-5"
                >
                  <item.icon className="h-4 w-4 shrink-0 text-muted group-hover:text-navy" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-navy">{item.title}</span>
                    <span className="block text-[11.5px] text-muted">{item.summary}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#b9c4d6]" aria-hidden />
                </Link>
              </li>
          ))}
        </ul>
      </section>

      <form action={logoutAction}>
        <Button type="submit" variant="secondary" size="sm">
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sign out
        </Button>
      </form>
    </div>
  );
}
