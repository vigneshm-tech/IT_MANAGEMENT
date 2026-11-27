import type { ModuleId } from "../modules";
import type { AccessLevel, ModuleLevels } from "./permissions";
import { pageKey, type PageOverride, type PageOverrides } from "./pages";

/**
 * The last role catalogue this process read.
 *
 * Access checks are synchronous and run in dozens of places — a page guard, a
 * server action, a nav item, a button. Making each of them await a database read
 * would be both slow and a large rewrite, so the catalogue is read once and held
 * here: the server fills it in after each request's `requireUser()`, and every
 * `can()` afterwards is a map lookup.
 *
 * Two separate things live here:
 *  - `overrides`, the levels an administrator has actually saved;
 *  - `known`, the ids of workspace-defined roles, so `isRoleId` can answer for
 *    a role this build has never heard of.
 *
 * Nothing here touches Supabase or Next.js, which is what lets `lib/access.ts`
 * stay importable from a client component.
 */

let overrides: Record<string, Partial<ModuleLevels>> = {};
let pages: Record<string, PageOverrides> = {};
let known: string[] = [];

export function setRoleCatalogue(
  next: { id: string; modules: Partial<ModuleLevels>; pages?: PageOverrides }[],
): void {
  const nextOverrides: Record<string, Partial<ModuleLevels>> = {};
  const nextPages: Record<string, PageOverrides> = {};
  for (const role of next) {
    nextOverrides[role.id] = role.modules;
    nextPages[role.id] = role.pages ?? {};
  }
  overrides = nextOverrides;
  pages = nextPages;
  known = next.map((role) => role.id);
}

export function clearRoleCatalogue(): void {
  overrides = {};
  pages = {};
  known = [];
}

export function knownRoleIds(): string[] {
  return known;
}

/**
 * The level an administrator set for this role and module, or null when they
 * have never saved this role. Null is not "no access" — it means the built-in
 * rules in `lib/modules.ts` still decide.
 */
export function roleAccessFor(roleId: string, moduleId: ModuleId): AccessLevel | null {
  return overrides[roleId]?.[moduleId] ?? null;
}

export function roleOverrides(roleId: string): Partial<ModuleLevels> {
  return overrides[roleId] ?? {};
}

/** A page an administrator closed (or reopened) inside a module, if any. */
export function rolePageFor(roleId: string, moduleId: string, pageId: string): PageOverride | undefined {
  return pages[roleId]?.[pageKey(moduleId, pageId)];
}

export function rolePages(roleId: string): PageOverrides {
  return pages[roleId] ?? {};
}
