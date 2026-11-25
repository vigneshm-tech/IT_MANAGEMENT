import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Fingerprint, ImageUp, KeyRound, Mail, Plug, ShieldCheck } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { SettingsTabs } from "@/components/modules/settings-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

/** The settings hub: one row per section, each a page of its own. */
export default async function SettingsPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "settings")) {
    return <AccessDenied moduleTitle="Settings" />;
  }

  const sections = [
    {
      id: "profile",
      href: "/modules/settings/profile",
      icon: Fingerprint,
      title: "Profile",
      summary: "Your details, access level and account settings",
    },
    {
      id: "security",
      href: "/modules/settings/security",
      icon: ShieldCheck,
      title: "Security & sessions",
      summary: "Session, password and API keys",
    },
    {
      id: "integrations",
      href: "/modules/settings/integrations",
      icon: Plug,
      title: "Integrations",
      summary: "Connect Redmine and Action1",
    },
    {
      id: "developers",
      href: "/modules/settings/developers",
      icon: KeyRound,
      title: "Developers",
      summary: "API keys and connected apps",
    },
    {
      id: "email",
      href: "/modules/settings/email",
      icon: Mail,
      title: "Email & alerts",
      summary: "The mail server Monitoring sends alerts through",
    },
    {
      id: "branding",
      href: "/modules/settings/branding",
      icon: ImageUp,
      title: "Report logo",
      summary: "The logo printed on exported patching reports",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Settings">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <SettingsTabs active="hub" />
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
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-[#b9c4d6] transition-colors group-hover:text-navy"
              />
            </Link>
          </li>
        ))}
      </ul>


    </div>
  );
}
