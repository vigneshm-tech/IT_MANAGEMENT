import Link from "next/link";

export type IisTab = "hub" | "applications" | "databases" | "mysql";

const TABS: { id: IisTab; label: string; href: string }[] = [
  { id: "hub", label: "Overview", href: "/modules/iis" },
  { id: "applications", label: "Applications", href: "/modules/iis/applications" },
  { id: "databases", label: "Databases", href: "/modules/iis/databases" },
  { id: "mysql", label: "MySQL", href: "/modules/iis/mysql" },
];

/** The same strip the ticket configuration and Settings use. */
export function IisTabs({ active }: { active: IisTab }) {
  return (
    <nav aria-label="IIS sections" className="-mx-1 overflow-x-auto">
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
