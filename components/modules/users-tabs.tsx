import Link from "next/link";

const TABS = [
  { id: "users", label: "Manage Users", href: "/modules/users", page: "directory" },
  { id: "groups", label: "Manage Groups", href: "/modules/users/groups", page: "groups" },
  { id: "roles", label: "Roles & access", href: "/modules/users/roles", page: "roles" },
] as const;

export type UsersTabId = (typeof TABS)[number]["id"];

/**
 * Sub-module tabs; the underline sits on the header's bottom rule.
 *
 * `visible` is the page ids this role was granted inside Users & Groups, from
 * `visiblePageIds`. A tab is drawn for exactly the pages that will open: a
 * closed page must not leave behind a tab whose only answer is "no access".
 */
export function UsersTabs({
  active,
  visible,
}: {
  active: UsersTabId;
  visible: string[];
}) {
  const tabs = TABS.filter((tab) => visible.includes(tab.page));

  return (
    <nav aria-label="Users & Groups" className="-mb-px flex flex-wrap items-center gap-1">
      {tabs.map((tab) => {
        const current = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "border-b-2 border-navy px-3 pb-2.5 text-[12.5px] font-medium text-navy"
                : "border-b-2 border-transparent px-3 pb-2.5 text-[12.5px] text-muted transition-colors hover:text-navy"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
