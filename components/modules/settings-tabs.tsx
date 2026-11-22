import Link from "next/link";

export type SettingsTab = "hub" | "profile" | "security" | "integrations" | "developers";

const TABS: { id: SettingsTab; label: string; href: string }[] = [
  { id: "hub", label: "Overview", href: "/modules/settings" },
  { id: "profile", label: "Profile", href: "/modules/settings/profile" },
  { id: "security", label: "Security & sessions", href: "/modules/settings/security" },
  { id: "integrations", label: "Integrations", href: "/modules/settings/integrations" },
  { id: "developers", label: "Developers", href: "/modules/settings/developers" },
];

/**
 * Settings used to be one long page: profile, connections, session and an API
 * section all stacked, which meant every visit scrolled past three things to
 * reach the fourth. The strip is the split — the same shape the ticket
 * configuration uses, so the workspace behaves the same way twice.
 */
export function SettingsTabs({ active }: { active: SettingsTab }) {
  return (
    <nav aria-label="Settings sections" className="-mx-1 overflow-x-auto">
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
