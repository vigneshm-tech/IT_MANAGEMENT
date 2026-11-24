import { MODULES, NAV_GROUPS } from "../modules";
import { ACCESS_LEVEL_LABELS, type AccessLevel } from "./permissions";
import type { RoleDefinition } from "./registry";

export type GridModule = {
  id: (typeof MODULES)[number]["id"];
  title: string;
  summary: string;
  groupLabel: string;
  level: AccessLevel;
};

export type GridGroup = { id: string; label: string; modules: GridModule[] };

/**
 * The catalogue arranged the way the navigation arranges it.
 *
 * Thirteen rows in one list is a wall; thirteen rows under the headings a
 * person already knows from the top bar is a map.
 */
export function buildGridGroups(role: RoleDefinition): GridGroup[] {
  return NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    modules: MODULES.filter((module) => module.navGroup === group.id).map((module) => ({
      id: module.id,
      title: module.title,
      summary: module.summary,
      groupLabel: group.label,
      level: role.modules[module.id] ?? "none",
    })),
  })).filter((group) => group.modules.length > 0);
}

/** "9 modules · 6 writable · 3 read only · 4 hidden" — the one-line summary. */
export function summariseLevels(counts: {
  total: number;
  writable: number;
  readonly: number;
  hidden: number;
}): string {
  const parts = [`${counts.total} modules`];
  if (counts.writable) parts.push(`${counts.writable} writable`);
  if (counts.readonly) parts.push(`${counts.readonly} read only`);
  if (counts.hidden) parts.push(`${counts.hidden} hidden`);
  return parts.join(" · ");
}

export function levelWord(level: AccessLevel): string {
  return ACCESS_LEVEL_LABELS[level];
}
