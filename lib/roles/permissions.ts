/**
 * What a role may do inside one module.
 *
 * Three answers, because that is as many as a person can hold in their head
 * when they are setting up an account:
 *
 *  - `none`  — the module is not theirs. It disappears from their navigation
 *              and its pages answer "not allowed" if they type the URL.
 *  - `read`  — they can look. Buttons that change something do not render, and
 *              the server refuses the action if one is forced.
 *  - `write` — they can look and change: create, edit and approve.
 *
 * The mapping to the five capabilities the rest of the app uses lives here, in
 * one place, so "read only" cannot quietly mean "read plus approve" in one
 * module and something else in another.
 *
 * This file is deliberately free of database and Next.js imports: the same
 * functions run in the browser (to paint the permission grid) and on the server
 * (to decide access), and the tests exercise them directly.
 */

import { MODULES, type Capability, type ModuleDefinition, type ModuleId } from "../modules";
import { ROLE_IDS, isBuiltinRole } from "../roles";

export const ACCESS_LEVELS = ["none", "read", "write"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  none: "Not allowed",
  read: "Read only",
  write: "Write",
};

export const ACCESS_LEVEL_HINTS: Record<AccessLevel, string> = {
  none: "Hidden from this role — no menu entry, no page, no actions.",
  read: "Can open the module and read it. Cannot add, edit or approve.",
  write: "Can open the module and change it: add, edit and approve.",
};

export type ModuleLevels = Record<ModuleId, AccessLevel>;

export function isAccessLevel(value: unknown): value is AccessLevel {
  return typeof value === "string" && (ACCESS_LEVELS as readonly string[]).includes(value);
}

/** The single place the three-level model turns into capabilities. */
export function levelAllows(level: AccessLevel, capability: Capability): boolean {
  if (level === "none") return false;
  if (level === "read") return capability === "view";
  return true;
}

/**
 * What each module looks like for a role that has never been saved through
 * Settings → Roles: the rules in `lib/modules.ts`, reduced to three levels.
 *
 * A role that could add or change anything counts as write; a role that could
 * only look counts as read. A module rule that grants nothing visible is `none`.
 * The registry keeps the precise legacy rules for untouched roles, so this is
 * only the picture shown to an administrator who opens the grid.
 */
export function levelFromRule(
  access: ModuleDefinition["access"],
  role: string,
): AccessLevel {
  const allowed = (capability: Capability): boolean => {
    const rule = access[capability];
    if (!rule) return false;
    if (rule === "all") return true;
    return rule.includes(role);
  };

  // The hidden platform role bypasses the enumerated lists, exactly as
  // `hasCapability` does.
  if (role === "super_admin") return "write";
  if (!allowed("view")) return "none";
  if (allowed("create") || allowed("edit") || allowed("approve") || allowed("admin")) {
    return "write";
  }
  return "read";
}

export function levelsFromRules(role: string): ModuleLevels {
  // A workspace-defined role appears in none of the compiled rules, so the
  // "view: all" entries would read as full access. It starts with nothing.
  if (!isBuiltinRole(role)) return emptyLevels();

  return Object.fromEntries(
    MODULES.map((module) => [module.id, levelFromRule(module.access, role)]),
  ) as ModuleLevels;
}

export function emptyLevels(): ModuleLevels {
  return Object.fromEntries(MODULES.map((module) => [module.id, "none"])) as ModuleLevels;
}

/** Rows read from the database, ignoring anything that is not a real module. */
export function levelsFromRows(
  rows: { moduleId: string; access: string }[],
): Partial<ModuleLevels> {
  const known = new Set<string>(MODULES.map((module) => module.id));
  const levels: Partial<ModuleLevels> = {};
  for (const row of rows) {
    if (known.has(row.moduleId) && isAccessLevel(row.access)) {
      levels[row.moduleId as ModuleId] = row.access;
    }
  }
  return levels;
}

/** Explicit levels laid over the legacy rules — what the registry stores per role. */
export function mergeLevels(base: ModuleLevels, overrides: Partial<ModuleLevels>): ModuleLevels {
  return { ...base, ...overrides } as ModuleLevels;
}

export type LevelCounts = {
  /** Modules the role cannot see at all. */
  hidden: number;
  /** Modules the role can open but not change. */
  readonly: number;
  /** Modules the role can change. */
  writable: number;
  total: number;
};

export function countLevels(levels: ModuleLevels): LevelCounts {
  const values = Object.values(levels);
  return {
    hidden: values.filter((level) => level === "none").length,
    readonly: values.filter((level) => level === "read").length,
    writable: values.filter((level) => level === "write").length,
    total: values.length,
  };
}

/** Which levels the role can reach, in the order the grid shows them. */
export function levelTone(level: AccessLevel): string {
  if (level === "write") return "text-success";
  if (level === "read") return "text-navy";
  return "text-muted";
}

/** Built-in roles, in catalogue order — the ones every workspace starts with. */
export const BUILTIN_ROLE_IDS: readonly string[] = ROLE_IDS;
