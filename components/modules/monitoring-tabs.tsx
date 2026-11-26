import Link from "next/link";

export type MonitoringTab = "board" | "settings";

/** Same strip as Settings and IIS, so the workspace behaves the same way twice. */
export function MonitoringTabs({
  active,
  canConfigure,
  visible,
}: {
  active: MonitoringTab;
  canConfigure: boolean;
  /** Page ids this role may open; omitted means the module decides. */
  visible?: string[];
}) {
  const allowed = (id: MonitoringTab) => !visible || visible.includes(id);
  const tabs: { id: MonitoringTab; label: string; href: string }[] = [
    ...(allowed("board")
      ? [{ id: "board" as const, label: "Live status", href: "/modules/monitoring" }]
      : []),
    ...(canConfigure && allowed("settings")
      ? [{ id: "settings" as const, label: "Settings", href: "/modules/monitoring/settings" }]
      : []),
  ];

  return (
    <nav aria-label="Monitoring sections" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 px-1">
        {tabs.map((tab) => {
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
