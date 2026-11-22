import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Fingerprint, KeyRound, Plug, ShieldCheck } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { SettingsTabs } from "@/components/modules/settings-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listApiKeys } from "@/lib/api/keys";
import { API_SCOPES, effectiveScopes } from "@/lib/api/scopes";
import { canManageAction1 } from "@/lib/integrations/access";
import { integrationStatus } from "@/lib/integrations/store";
import { ROLE_BY_ID } from "@/lib/roles";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Settings" };

/**
 * The settings hub.
 *
 * Four sections, each a page of its own, and each row says what state it is in
 * before you open it — which integration is connected, how many keys are live,
 * when the session ends. A settings index that only lists names makes you click
 * twice to learn anything.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "settings")) {
    return <AccessDenied moduleTitle="Settings" />;
  }

  const [redmine, action1, keys] = await Promise.all([
    integrationStatus(user.id, "redmine"),
    integrationStatus(user.id, "action1"),
    listApiKeys(user.id),
  ]);
  const role = ROLE_BY_ID[user.role];
  const activeKeys = keys.filter((key) => !key.revokedAt && (!key.expiresAt || new Date(key.expiresAt) > new Date()));
  const connected = [redmine.connected, action1.connected].filter(Boolean).length;
  const scopes = effectiveScopes(
    API_SCOPES.map((scope) => scope.id),
    user.role,
  );

  const sections = [
    {
      id: "profile",
      href: "/modules/settings/profile",
      icon: Fingerprint,
      title: "Profile",
      summary: "Who you are in this workspace, and what your access level can do",
      status: `${user.name} · ${role.label}`,
    },
    {
      id: "security",
      href: "/modules/settings/security",
      icon: ShieldCheck,
      title: "Security & sessions",
      summary: "How you sign in, when this session ends, and how to end it now",
      status:
        user.provider === "supabase" ? "Organisation account" : "Demo directory account",
    },
    {
      id: "integrations",
      href: "/modules/settings/integrations",
      icon: Plug,
      title: "Integrations",
      summary: "Redmine for your assigned tickets, Action1 for the server inventory",
      status: connected === 0 ? "None connected" : `${connected} of 2 connected`,
    },
    {
      id: "developers",
      href: "/modules/settings/developers",
      icon: KeyRound,
      title: "Developers",
      summary: "Personal API keys, the REST API at /api/v1 and the MCP endpoint",
      status:
        activeKeys.length === 0
          ? "No active keys"
          : `${activeKeys.length} active ${activeKeys.length === 1 ? "key" : "keys"}`,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Settings">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <SettingsTabs active="hub" />
          <p className="text-[12px] text-muted">
            {role.label} · session ends {formatDateTime(new Date(user.expiresAt * 1000))} ·{" "}
            {scopes.length} API {scopes.length === 1 ? "scope" : "scopes"} available to you
          </p>
        </div>
      </PageHeader>

      <ul className="divide-y divide-line border-y border-line bg-surface">
        {sections.map((section) => (
          <li key={section.id}>
            <Link
              href={section.href}
              className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-[#f4f7fc] focus-visible:bg-[#f4f7fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/70 sm:px-5"
            >
              <section.icon className="h-4 w-4 shrink-0 text-muted group-hover:text-navy" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-navy">{section.title}</span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">
                  {section.summary}
                </span>
              </span>
              <span className="hidden shrink-0 text-right text-[11.5px] text-muted sm:block">
                {section.status}
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
        Action1 credentials{" "}
        {canManageAction1(user.role) ? "can be changed by you" : "are managed by IT"} — the
        organisation shares one inventory, so one person connects it for everybody.
      </p>
    </div>
  );
}
