import type { ModuleId } from "../modules";
import type { RoleGroup, RoleLevel } from "../roles";
import type { AccessLevel } from "./permissions";
import type { PageOverrides } from "./pages";

/**
 * A role as it is stored: its name badge, its group, and whichever module
 * levels an administrator has actually set.
 *
 * `modules` is partial on purpose. A missing entry means "nobody has decided
 * this yet", which for a built-in role falls back to the rules in
 * `lib/modules.ts`, and for a workspace-defined role means not allowed.
 */
export type StoredRole = {
  id: string;
  label: string;
  description: string;
  group: RoleGroup;
  level: RoleLevel;
  accent: string;
  hidden: boolean;
  /** Shipped with the product; its id and hidden flag cannot be changed. */
  builtin: boolean;
  unrestrictedTaskCreation: boolean;
  modules: Partial<Record<ModuleId, AccessLevel>>;
  /** Pages closed or re-opened inside a module; an absent page follows its module. */
  pages: PageOverrides;
  updatedAt: string | null;
};

/** The minimum a picker needs to render a role. */
export type RoleOption = { id: string; label: string };

export const ROLE_LABEL_MAX = 48;
export const ROLE_DESCRIPTION_MAX = 160;

/** The roles every install starts with, before anybody edits anything. */
export const ROLE_GROUPS_FOR_PICKER: { id: RoleGroup; label: string }[] = [
  { id: "it", label: "IT" },
  { id: "l2_support", label: "L2 Support" },
  { id: "implementation", label: "Implementation" },
  { id: "development", label: "Development" },
  { id: "testing", label: "Testing" },
  { id: "management", label: "Management" },
  { id: "custom", label: "Other" },
];

export function validateRoleLabel(label: string): string | null {
  if (label.length < 2) return "Give the role a name.";
  if (label.length > ROLE_LABEL_MAX) {
    return `Keep the role name under ${ROLE_LABEL_MAX} characters.`;
  }
  return null;
}

export function validateRoleDescription(description: string): string | null {
  if (description.length > ROLE_DESCRIPTION_MAX) {
    return `Keep the description under ${ROLE_DESCRIPTION_MAX} characters.`;
  }
  return null;
}
