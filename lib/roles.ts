/**
 * TaskTornado role catalogue.
 *
 * Every employee account is assigned exactly one role. A role decides which
 * modules are visible and which of them can be written to; the per-module
 * matrix lives in the database (`access_roles` / `access_role_modules`, edited
 * from Settings → Roles) and these entries are the starting point a workspace
 * inherits.
 *
 * Two kinds of role exist:
 *  - the built-in set below, shipped with the product and present in every
 *    install, with access rules in `lib/modules.ts`;
 *  - workspace-defined roles, created in Settings → Roles, whose access comes
 *    only from what an administrator ticked. Their ids are slugs, so a role
 *    typed as "Warehouse Supervisor" is `warehouse_supervisor`.
 */

import { roleLabelOverride } from "./roles/labels";

export const ROLE_IDS = [
  /**
   * Platform owner. Hidden from every role catalogue, dropdown and report —
   * only the holder sees the matching "Users" module. Never assign it from
   * user metadata; it is provisioned by hand in the database.
   */
  "super_admin",
  "it_manager",
  "it_engineer",
  "l2_support_manager",
  "l2_support_lead",
  "l2_support_engineer",
  "implementation_manager",
  "implementation_lead",
  "implementation_engineer",
  "development_manager",
  "development_lead",
  "development_engineer",
  "testing_manager",
  "testing_lead",
  "testing_engineer",
  "management",
] as const;

/** One of the roles shipped with the product. */
export type BuiltinRoleId = (typeof ROLE_IDS)[number];

/**
 * A role key. Deliberately open: a workspace can define roles that this build
 * has never heard of. Anything that needs to know whether a key is real asks
 * `isRoleId`, which the registry answers once the catalogue has been read.
 */
export type RoleId = string;

export type RoleGroup =
  | "platform"
  | "it"
  | "l2_support"
  | "implementation"
  | "development"
  | "testing"
  | "management"
  | "custom";

export type RoleLevel = "manager" | "lead" | "engineer" | "executive";

export type Role = {
  id: RoleId;
  label: string;
  shortLabel: string;
  group: RoleGroup;
  level: RoleLevel;
  description: string;
  /** Accent used across cards, badges and avatars. */
  accent: string;
  /** Tailwind-friendly accent classes. */
  badgeClass: string;
  /** Can create tasks at any hour (false = 09:00–18:00 IST window). */
  unrestrictedTaskCreation: boolean;
  /** Hidden roles never appear in pickers, catalogues or reports. */
  hidden?: boolean;
};

export const ROLE_GROUPS: Record<
  RoleGroup,
  { label: string; accent: string; description: string }
> = {
  platform: {
    label: "Platform",
    accent: "#c6a96c",
    description: "Service ownership. Never shown in the role catalogue.",
  },
  it: {
    label: "IT",
    accent: "#7c5cff",
    description: "Owns infrastructure, servers and the tools stack.",
  },
  l2_support: {
    label: "L2 Support",
    accent: "#22d3ee",
    description: "Front line for tickets, escalations and customer issues.",
  },
  implementation: {
    label: "Implementation",
    accent: "#34d399",
    description: "Rolls out products and onboarding for clients.",
  },
  development: {
    label: "Development",
    accent: "#f472b6",
    description: "Builds and maintains the product surface.",
  },
  testing: {
    label: "Testing",
    accent: "#fbbf24",
    description: "Quality gates, regressions and release sign-off.",
  },
  management: {
    label: "Management",
    accent: "#94a3b8",
    description: "Cross-functional oversight and reporting.",
  },
  custom: {
    label: "Workspace roles",
    accent: "#64748b",
    description: "Roles this workspace defined for itself.",
  },
};

const role = (r: Omit<Role, "badgeClass"> & { badgeClass?: string }): Role => ({
  badgeClass: "text-white",
  ...r,
});

export const ROLES: Role[] = [
  role({
    id: "super_admin",
    label: "Super Admin",
    shortLabel: "Super Admin",
    group: "platform",
    level: "executive",
    description:
      "Hidden platform owner. Full access to every module plus the user directory.",
    accent: "#c6a96c",
    unrestrictedTaskCreation: true,
    hidden: true,
  }),
  role({
    id: "it_manager",
    label: "IT Manager",
    shortLabel: "IT Manager",
    group: "it",
    level: "manager",
    description: "Administers TaskTornado, infrastructure integrations and access. Unrestricted task creation.",
    accent: "#a78bfa",
    unrestrictedTaskCreation: true,
  }),
  role({
    id: "it_engineer",
    label: "IT Engineer",
    shortLabel: "IT Eng",
    group: "it",
    level: "engineer",
    description: "Handles servers, patching execution and endpoint tooling.",
    accent: "#7c5cff",
    unrestrictedTaskCreation: false,
  }),
  role({
    id: "l2_support_manager",
    label: "L2 Support Manager",
    shortLabel: "L2 Manager",
    group: "l2_support",
    level: "manager",
    description: "Owns support SLAs, escalations and team capacity.",
    accent: "#67e8f9",
    unrestrictedTaskCreation: true,
  }),
  role({
    id: "l2_support_lead",
    label: "L2 Support Lead",
    shortLabel: "L2 Lead",
    group: "l2_support",
    level: "lead",
    description: "Runs the support shift and approves escalations.",
    accent: "#22d3ee",
    unrestrictedTaskCreation: true,
  }),
  role({
    id: "l2_support_engineer",
    label: "L2 Support Engineer",
    shortLabel: "L2 Eng",
    group: "l2_support",
    level: "engineer",
    description: "Works assigned tickets and customer issues.",
    accent: "#06b6d4",
    unrestrictedTaskCreation: false,
  }),
  role({
    id: "implementation_manager",
    label: "Implementation Manager",
    shortLabel: "Impl Manager",
    group: "implementation",
    level: "manager",
    description: "Owns delivery plans, client onboarding and rollout risk.",
    accent: "#6ee7b7",
    unrestrictedTaskCreation: true,
  }),
  role({
    id: "implementation_lead",
    label: "Implementation Lead",
    shortLabel: "Impl Lead",
    group: "implementation",
    level: "lead",
    description: "Coordinates implementation squads and client handovers.",
    accent: "#34d399",
    unrestrictedTaskCreation: true,
  }),
  role({
    id: "implementation_engineer",
    label: "Implementation Engineer",
    shortLabel: "Impl Eng",
    group: "implementation",
    level: "engineer",
    description: "Executes deployment and configuration tasks.",
    accent: "#10b981",
    unrestrictedTaskCreation: false,
  }),
  role({
    id: "development_manager",
    label: "Development Manager",
    shortLabel: "Dev Manager",
    group: "development",
    level: "manager",
    description: "Owns engineering roadmap and release commitments.",
    accent: "#f9a8d4",
    unrestrictedTaskCreation: true,
  }),
  role({
    id: "development_lead",
    label: "Development Lead",
    shortLabel: "Dev Lead",
    group: "development",
    level: "lead",
    description: "Guides code delivery and reviews change requests.",
    accent: "#f472b6",
    unrestrictedTaskCreation: true,
  }),
  role({
    id: "development_engineer",
    label: "Development Engineer",
    shortLabel: "Dev Eng",
    group: "development",
    level: "engineer",
    description: "Builds features and fixes defects.",
    accent: "#ec4899",
    unrestrictedTaskCreation: false,
  }),
  role({
    id: "testing_manager",
    label: "Testing Manager",
    shortLabel: "QA Manager",
    group: "testing",
    level: "manager",
    description: "Owns quality strategy, coverage and release sign-off.",
    accent: "#fcd34d",
    unrestrictedTaskCreation: true,
  }),
  role({
    id: "testing_lead",
    label: "Testing Lead",
    shortLabel: "QA Lead",
    group: "testing",
    level: "lead",
    description: "Plans test cycles and approves defect closures.",
    accent: "#fbbf24",
    unrestrictedTaskCreation: true,
  }),
  role({
    id: "testing_engineer",
    label: "Testing Engineer",
    shortLabel: "QA Eng",
    group: "testing",
    level: "engineer",
    description: "Executes test cases and logs defects.",
    accent: "#f59e0b",
    unrestrictedTaskCreation: false,
  }),
  role({
    id: "management",
    label: "Management",
    shortLabel: "Management",
    group: "management",
    level: "executive",
    description: "Read-only oversight across delivery, support and IT.",
    accent: "#cbd5e1",
    unrestrictedTaskCreation: true,
  }),
];

export const ROLE_BY_ID: Record<string, Role> = Object.fromEntries(
  ROLES.map((r) => [r.id, r]),
);

/** Everything a role picker, catalogue or report is allowed to list. */
export const VISIBLE_ROLES: Role[] = ROLES.filter((r) => !r.hidden);

export function isHiddenRole(id: RoleId): boolean {
  return ROLE_BY_ID[id]?.hidden === true;
}


/* ------------------------------------------------------------------ custom */

/**
 * The role keys this process knows about beyond the built-ins.
 *
 * A workspace-defined role lives in the database, but a lot of synchronous code
 * asks "is this a real role?" while rendering. The registry (server) fills this
 * in once the catalogue has been read; the browser keeps the built-in set only,
 * which is why anything shown to a person carries its label through props rather
 * than re-deriving it client-side.
 */
let knownCustomRoles = new Set<string>();

export function rememberKnownRoles(ids: string[]): void {
  knownCustomRoles = new Set(ids.filter((id) => !ROLE_BY_ID[id]));
}

export function forgetKnownRoles(): void {
  knownCustomRoles = new Set();
}

export function isBuiltinRole(id: string): boolean {
  return (ROLE_IDS as readonly string[]).includes(id);
}

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === "string" && (isBuiltinRole(value) || knownCustomRoles.has(value));
}

/** Role keys have to survive a URL, a cookie and a database column. */
export const ROLE_ID_PATTERN = /^[a-z][a-z0-9_]{2,39}$/;

/** "Warehouse Supervisor" → "warehouse_supervisor". */
export function roleSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
}

/** "warehouse_supervisor" → "Warehouse Supervisor", for a role we have no row for. */
export function roleLabelFromId(id: string): string {
  const words = id.split(/[_\s]+/).filter(Boolean);
  if (words.length === 0) return id || "Unassigned";
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

/** The neutral definition used when a role exists in the data but not in code. */
export function customRole(id: string): Role {
  const label = roleLabelOverride(id) ?? roleLabelFromId(id);
  return {
    id,
    label,
    shortLabel: label,
    group: "custom",
    level: "engineer",
    description: "Workspace-defined role.",
    accent: "#64748b",
    badgeClass: "text-white",
    unrestrictedTaskCreation: false,
  };
}

/** A role for display: the built-in label when we have one, the slug otherwise. */
export function roleOf(id: string | null | undefined): Role {
  if (!id) return customRole("unassigned");
  return ROLE_BY_ID[id] ?? customRole(id);
}

export function isAssignableRole(value: unknown): value is RoleId {
  return isRoleId(value) && value !== "super_admin" && !isHiddenRole(value);
}

export function getRole(id: string | null | undefined): Role | null {
  return isRoleId(id) ? roleOf(id) : null;
}

export function rolesInGroup(group: RoleGroup): Role[] {
  return VISIBLE_ROLES.filter((r) => r.group === group);
}

/** Manager, lead and executive tiers bypass time-based restrictions. */
export function isLeadership(roleId: RoleId): boolean {
  return ["manager", "lead", "executive"].includes(roleOf(roleId).level);
}
