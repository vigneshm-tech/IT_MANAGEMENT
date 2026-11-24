import Link from "next/link";

const TABS = [
  { id: "users", label: "Manage Users", href: "/modules/users", audience: "directory" },
  { id: "groups", label: "Manage Groups", href: "/modules/users/groups", audience: "directory" },
  { id: "roles", label: "Roles & access", href: "/modules/users/roles", audience: "roles" },
] as const;

export type UsersTabId = (typeof TABS)[number]["id"];

/**
 * Sub-module tabs; the underline sits on the header's bottom rule.
 *
 * The audience flags exist because a Settings administrator may reach Roles
 * without holding the directory itself — offering them "Manage Users" would be
 * a tab that only answers Access denied.
 */
export function UsersTabs({
  active,
  canViewDirectory = true,
  canViewRoles = true,
}: {
  active: UsersTabId;
  canViewDirectory?: boolean;
  canViewRoles?: boolean;
}) {
  const tabs = TABS.filter((tab) =>
    tab.audience === "directory" ? canViewDirectory : canViewRoles,
  );

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
