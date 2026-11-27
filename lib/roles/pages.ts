import type { ModuleId } from "../modules";

/**
 * The pages inside a module — what the tab strip under a module header lists.
 *
 * A module is the thing a person is given; a page is the part of it they can be
 * trusted with. Settings is the clearest case: everybody needs their own
 * profile, almost nobody needs the mail server. So access is granted twice —
 * the module, then, inside it, the pages — and a page can only ever narrow the
 * module, never widen it.
 *
 * This file is free of database and Next.js imports: the grid paints from it in
 * the browser, `canAccessPage()` answers from it on the server, and the tests
 * exercise it directly.
 */

export type SubPage = { id: string; label: string; href: string };

export const SUB_PAGES: Partial<Record<ModuleId, SubPage[]>> = {
  settings: [
    { id: "profile", label: "Profile", href: "/modules/settings/profile" },
    { id: "security", label: "Security & sessions", href: "/modules/settings/security" },
    { id: "integrations", label: "Integrations", href: "/modules/settings/integrations" },
    { id: "developers", label: "Developers", href: "/modules/settings/developers" },
    { id: "email", label: "Email & alerts", href: "/modules/settings/email" },
    { id: "branding", label: "Report logo", href: "/modules/settings/branding" },
  ],
  users: [
    { id: "directory", label: "Manage Users", href: "/modules/users" },
    { id: "groups", label: "Manage Groups", href: "/modules/users/groups" },
    { id: "roles", label: "Roles & access", href: "/modules/users/roles" },
  ],
  iis: [
    { id: "applications", label: "Applications", href: "/modules/iis/applications" },
    { id: "databases", label: "Databases", href: "/modules/iis/databases" },
    { id: "mysql", label: "MySQL", href: "/modules/iis/mysql" },
  ],
  monitoring: [
    { id: "board", label: "Live status", href: "/modules/monitoring" },
    { id: "settings", label: "Settings", href: "/modules/monitoring/settings" },
  ],
  tickets: [
    { id: "masters", label: "Ticket masters", href: "/modules/tickets/masters" },
    { id: "settings", label: "Ticket settings", href: "/modules/tickets/settings" },
    { id: "kb", label: "Knowledge base", href: "/modules/tickets/kb" },
    { id: "reports", label: "Reports", href: "/modules/tickets/reports" },
    { id: "redmine", label: "Redmine", href: "/modules/tickets/redmine" },
  ],
};

/** `allow` or `none`; an absent entry means "the module decides". */
export type PageOverride = "allow" | "none";
export type PageOverrides = Partial<Record<string, PageOverride>>;

/** `settings/email` — the key a page override is stored under. */
export function pageKey(moduleId: string, pageId: string): string {
  return `${moduleId}/${pageId}`;
}

export function subPagesFor(moduleId: ModuleId): SubPage[] {
  return SUB_PAGES[moduleId] ?? [];
}

export function isPageOverride(value: unknown): value is PageOverride {
  return value === "allow" || value === "none";
}

/** Keeps only keys that name a real page, and only the two answers. */
export function sanitisePageOverrides(input: unknown): PageOverrides {
  if (!input || typeof input !== "object") return {};
  const known = new Set(
    Object.entries(SUB_PAGES).flatMap(([moduleId, pages]) =>
      (pages ?? []).map((page) => pageKey(moduleId, page.id)),
    ),
  );
  const out: PageOverrides = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (known.has(key) && isPageOverride(value)) out[key] = value;
  }
  return out;
}

/**
 * Is this page reachable?
 *
 * The module is the gate: no module, no page. Inside a module that is open, an
 * explicit "none" closes one page and anything else leaves it open. A page can
 * never be opened inside a module the role cannot see.
 */
export function pageIsAllowed(moduleLevel: string, override: PageOverride | undefined): boolean {
  if (moduleLevel === "none") return false;
  return override !== "none";
}

export function allowedPageIds(
  moduleId: ModuleId,
  moduleLevel: string,
  overrides: PageOverrides,
): string[] {
  if (moduleLevel === "none") return [];
  return subPagesFor(moduleId)
    .filter((page) => pageIsAllowed(moduleLevel, overrides[pageKey(moduleId, page.id)]))
    .map((page) => page.id);
}

/** How many pages a role can open inside each module — the grid's counters. */
export function countPages(
  moduleLevels: Record<string, string>,
  overrides: PageOverrides,
): { open: number; total: number } {
  let open = 0;
  let total = 0;
  for (const [moduleId, pages] of Object.entries(SUB_PAGES)) {
    const level = moduleLevels[moduleId] ?? "none";
    total += pages?.length ?? 0;
    open += allowedPageIds(moduleId as ModuleId, level, overrides).length;
  }
  return { open, total };
}
