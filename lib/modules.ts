import type { RoleId } from "./roles";

/**
 * Module registry and permission rules. This is the single source of truth for
 * which pages exist, how they are grouped in the top navigation, and which
 * roles may open them.
 */
export type Capability = "view" | "create" | "edit" | "approve" | "admin";

export type ModuleId =
  | "dashboard"
  | "tasks"
  | "tickets"
  | "servers"
  | "clients"
  | "patching"
  | "approvals"
  | "renewals"
  | "masters"
  | "settings"
  | "users";

export type NavGroupId =
  | "overview"
  | "service"
  | "infrastructure"
  | "commercial"
  | "governance";

export type ModuleDefinition = {
  id: ModuleId;
  title: string;
  href: string;
  /** One short line used in navigation and empty states. */
  summary: string;
  icon: string;
  navGroup: NavGroupId;
  access: Record<"view", "all" | RoleId[]> &
    Partial<Record<Capability, "all" | RoleId[]>>;
};

export const SUPER = "super_admin" as RoleId;
export const IT = "it_manager" as RoleId;
export const IT_ENG = "it_engineer" as RoleId;
const L2_M = "l2_support_manager" as RoleId;
const L2_L = "l2_support_lead" as RoleId;
const IMPL_M = "implementation_manager" as RoleId;
const IMPL_L = "implementation_lead" as RoleId;
const DEV_M = "development_manager" as RoleId;
const DEV_L = "development_lead" as RoleId;
const QA_M = "testing_manager" as RoleId;
const QA_L = "testing_lead" as RoleId;
export const MGMT = "management" as RoleId;

/** Managers, leads and management — the leadership tier. */
export const LEADERSHIP: RoleId[] = [
  IT,
  L2_M,
  L2_L,
  IMPL_M,
  IMPL_L,
  DEV_M,
  DEV_L,
  QA_M,
  QA_L,
  MGMT,
];

export const MODULES: ModuleDefinition[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    href: "/modules/dashboard",
    summary: "Tasks, approvals and renewals at a glance",
    icon: "LayoutDashboard",
    navGroup: "overview",
    access: { view: "all", admin: [IT, MGMT] },
  },
  {
    id: "tasks",
    title: "Task Management",
    href: "/modules/tasks",
    summary: "Plan, assign and track work",
    icon: "ListChecks",
    navGroup: "service",
    access: { view: "all", create: "all", edit: [IT, ...LEADERSHIP] },
  },
  {
    id: "tickets",
    title: "Ticket Portal",
    href: "/modules/tickets",
    summary: "Your assigned Redmine issues",
    icon: "Ticket",
    navGroup: "service",
    access: { view: "all", create: "all", edit: "all" },
  },
  {
    id: "servers",
    title: "Servers",
    href: "/modules/servers",
    summary: "Endpoint inventory from Action1",
    icon: "Server",
    navGroup: "infrastructure",
    access: {
      view: [IT, IT_ENG, ...LEADERSHIP],
      edit: [IT, IT_ENG],
      admin: [IT],
    },
  },
  {
    id: "patching",
    title: "Patching Plans",
    href: "/modules/patching",
    summary: "Maintenance windows and progress",
    icon: "ShieldCheck",
    navGroup: "infrastructure",
    access: {
      view: [IT, IT_ENG, ...LEADERSHIP],
      edit: [IT, IT_ENG],
      approve: LEADERSHIP,
    },
  },
  {
    id: "clients",
    title: "Clients",
    href: "/modules/clients",
    summary: "Accounts, contacts and owners",
    icon: "Building2",
    navGroup: "commercial",
    access: { view: "all", edit: [IT, ...LEADERSHIP] },
  },
  {
    id: "renewals",
    title: "Renewals",
    href: "/modules/renewals",
    summary: "Contracts, licences and due dates",
    icon: "CalendarClock",
    navGroup: "commercial",
    access: { view: "all", edit: [IT, ...LEADERSHIP] },
  },
  {
    id: "masters",
    title: "Masters",
    href: "/modules/masters",
    summary: "Master data — activity types for tasks",
    icon: "Layers",
    navGroup: "commercial",
    access: { view: "all", edit: [IT, ...LEADERSHIP] },
  },
  {
    id: "approvals",
    title: "Approvals",
    href: "/modules/approvals",
    summary: "Requests waiting on a decision",
    icon: "BadgeCheck",
    navGroup: "governance",
    access: { view: "all", create: "all", approve: LEADERSHIP },
  },
  {
    id: "settings",
    title: "Settings",
    href: "/modules/settings",
    summary: "Profile, keys and session",
    icon: "Settings",
    navGroup: "governance",
    access: { view: "all", edit: "all", admin: [IT, MGMT] },
  },
  {
    id: "users",
    title: "Users",
    href: "/modules/users",
    summary: "Employee directory and access levels",
    icon: "Users",
    navGroup: "governance",
    // Hidden role only. Every other role — IT Manager included — is denied.
    access: { view: [SUPER], admin: [SUPER] },
  },
];

export const MODULE_BY_ID: Record<ModuleId, ModuleDefinition> = Object.fromEntries(
  MODULES.map((m) => [m.id, m]),
) as Record<ModuleId, ModuleDefinition>;

export const NAV_GROUPS: { id: NavGroupId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "service", label: "Service desk" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "commercial", label: "Commercial" },
  { id: "governance", label: "Governance" },
];

export function getModule(slug: string): ModuleDefinition | null {
  return MODULES.find((m) => m.id === slug) ?? null;
}

export function hasCapability(
  access: ModuleDefinition["access"],
  capability: Capability,
  role: RoleId,
): boolean {
  // The hidden platform role is not enumerated in every access list; it holds
  // every capability instead.
  if (role === SUPER) return true;

  const allowed = access[capability];
  if (!allowed) return false;
  if (allowed === "all") return true;
  return allowed.includes(role);
}
