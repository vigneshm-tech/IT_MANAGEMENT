import Link from "next/link";
import { CLIENT_TABS, type ClientTab } from "@/lib/clients";

/**
 * The two lists in the Clients module.
 *
 * Same strip as Settings and the ticket configuration, so "there is another
 * view of this page" looks the same wherever it appears.
 */
export function ClientTabs({ active }: { active: ClientTab }) {
  return (
    <nav aria-label="Client lists" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 px-1">
        {CLIENT_TABS.map((tab) => {
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
