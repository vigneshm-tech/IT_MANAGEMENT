/**
 * TaskTornado role catalogue.
 *
 * Every employee account is assigned exactly one role from this list. The role
 * decides which modules are visible and which actions are allowed. Keep this
 * file as the single source of truth — the database enum in
 * `supabase/migrations/0001_rbac.sql` mirrors these ids.
 */

export const ROLE_IDS = [
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

export type RoleId = (typeof ROLE_IDS)[number];

export type RoleGroup =
  | "it"
  | "l2_support"
  | "implementation"
  | "development"
  | "testing"
  | "management";

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
};

export const ROLE_GROUPS: Record<
  RoleGroup,
  { label: string; accent: string; description: string }
> = {
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
};

const role = (r: Omit<Role, "badgeClass"> & { badgeClass?: string }): Role => ({
  badgeClass: "text-white",
  ...r,
});

export const ROLES: Role[] = [
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

export const ROLE_BY_ID: Record<RoleId, Role> = Object.fromEntries(
  ROLES.map((r) => [r.id, r]),
) as Record<RoleId, Role>;

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === "string" && (ROLE_IDS as readonly string[]).includes(value);
}

export function getRole(id: string | null | undefined): Role | null {
  return isRoleId(id) ? ROLE_BY_ID[id] : null;
}

export function rolesInGroup(group: RoleGroup): Role[] {
  return ROLES.filter((r) => r.group === group);
}

/** Manager, lead and executive tiers bypass time-based restrictions. */
export function isLeadership(roleId: RoleId): boolean {
  return ["manager", "lead", "executive"].includes(ROLE_BY_ID[roleId].level);
}
