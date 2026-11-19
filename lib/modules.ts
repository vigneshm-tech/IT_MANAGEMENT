import type { RoleId } from "./roles";

/**
 * Modules that make up TaskTornado. `access` maps a capability to the roles
 * that hold it. "all" means every authenticated employee.
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
  | "settings";

export type ModuleDefinition = {
  id: ModuleId;
  title: string;
  href: string;
  tagline: string;
  description: string;
  icon: string;
  accent: string;
  access: Record<"view", "all" | RoleId[]> & Partial<Record<Capability, "all" | RoleId[]>>;
  /** Short bullets shown on the module landing page. */
  highlights: string[];
};

const IT = "it_manager" as RoleId;
const IT_ENG = "it_engineer" as RoleId;
const L2_M = "l2_support_manager" as RoleId;
const L2_L = "l2_support_lead" as RoleId;
const IMPL_M = "implementation_manager" as RoleId;
const IMPL_L = "implementation_lead" as RoleId;
const DEV_M = "development_manager" as RoleId;
const DEV_L = "development_lead" as RoleId;
const QA_M = "testing_manager" as RoleId;
const QA_L = "testing_lead" as RoleId;
const MGMT = "management" as RoleId;

/** Managers, leads and management — the leadership tier. */
const LEADERSHIP: RoleId[] = [
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

/** IT + leadership — the groups allowed near infrastructure. */
const INFRASTRUCTURE: RoleId[] = [IT, IT_ENG, ...LEADERSHIP];

export const MODULES: ModuleDefinition[] = [
  {
    id: "dashboard",
    title: "Dashboards",
    href: "/modules/dashboard",
    tagline: "Live pulse of the whole operation",
    description:
      "Role-aware KPIs for tickets, tasks, server health, renewals and approvals in one view.",
    icon: "LayoutDashboard",
    accent: "#7c5cff",
    access: {
      view: "all",
      admin: [IT, MGMT],
    },
    highlights: [
      "Open tickets and SLA at-risk counts",
      "Task load by team and engineer",
      "Server patch compliance, renewal deadlines",
    ],
  },
  {
    id: "tasks",
    title: "Task Management",
    href: "/modules/tasks",
    tagline: "Everyone tracks, engineers log 9AM–6PM",
    description:
      "Shared task board for every team. Engineers can raise new tasks between 09:00 and 18:00 IST; leads, managers, IT and management can raise tasks 24 hours a day.",
    icon: "ListChecks",
    accent: "#22d3ee",
    access: {
      view: "all",
      create: "all",
      edit: [IT, ...LEADERSHIP],
    },
    highlights: [
      "Everyone can view and work the board",
      "New task window enforced 09:00–18:00 IST for engineers",
      "Leads, managers, IT and management are unrestricted",
    ],
  },
  {
    id: "tickets",
    title: "Ticket Portal",
    href: "/modules/tickets",
    tagline: "Your Redmine queue, inside TaskTornado",
    description:
      "Connect Redmine with a personal API key from Settings. TaskTornado pulls the tickets assigned to you so you can read, filter and close them without leaving the app.",
    icon: "TicketIcon",
    accent: "#34d399",
    access: {
      view: "all",
      create: "all",
      edit: "all",
    },
    highlights: [
      "Personal Redmine API key, stored per user",
      "Assigned tickets with status, priority and SLA",
      "Close tickets with a resolution comment",
    ],
  },
  {
    id: "servers",
    title: "Servers",
    href: "/modules/servers",
    tagline: "Action1 estate at a glance",
    description:
      "IT configures the Action1 API key; TaskTornado lists every managed endpoint and server with OS, patch status and last seen time. Visible to IT, managers, leads and management.",
    icon: "Server",
    accent: "#a78bfa",
    access: {
      view: [IT, IT_ENG, ...LEADERSHIP],
      edit: [IT, IT_ENG],
      admin: [IT],
    },
    highlights: [
      "Action1 API key managed inside Settings",
      "Server inventory with patch and agent health",
      "Restricted to IT, managers, leads and management",
    ],
  },
  {
    id: "clients",
    title: "Clients Master",
    href: "/modules/clients",
    tagline: "One record per customer",
    description:
      "Single source of truth for client accounts, contacts, environments, contract owners and linked tickets, tasks and renewals.",
    icon: "Building2",
    accent: "#fbbf24",
    access: {
      view: "all",
      edit: [IT, ...LEADERSHIP],
    },
    highlights: [
      "Account, contact and environment details",
      "Linked tasks, tickets and renewals",
      "Ownership by implementation and support leads",
    ],
  },
  {
    id: "patching",
    title: "Patching Plans",
    href: "/modules/patching",
    tagline: "Patch windows that never get missed",
    description:
      "Plan monthly patching per client and server group, track compliance before and after each window, and escalate missed patches.",
    icon: "ShieldCheck",
    accent: "#38bdf8",
    access: {
      view: [IT, IT_ENG, ...LEADERSHIP],
      edit: [IT, IT_ENG],
      approve: LEADERSHIP,
    },
    highlights: [
      "Monthly patch plans per client",
      "Compliance tracking and exceptions",
      "Approval trail for emergency patches",
    ],
  },
  {
    id: "approvals",
    title: "Approvals",
    href: "/modules/approvals",
    tagline: "Requests that need a signature",
    description:
      "Change requests, access requests and patch exceptions raised by any team, approved by leads, managers, IT and management.",
    icon: "BadgeCheck",
    accent: "#f472b6",
    access: {
      view: "all",
      create: "all",
      approve: LEADERSHIP,
    },
    highlights: [
      "Unified inbox of pending approvals",
      "Approve or reject with a reason",
      "Full audit trail per request",
    ],
  },
  {
    id: "renewals",
    title: "Renewals Master",
    href: "/modules/renewals",
    tagline: "Never miss a contract date",
    description:
      "Track AMC, licence, subscription and support renewals with owners, cost and reminder schedules that fire before the date.",
    icon: "CalendarClock",
    accent: "#fb923c",
    access: {
      view: "all",
      edit: [IT, ...LEADERSHIP],
    },
    highlights: [
      "Renewals calendar with reminders",
      "Owner, vendor, cost and notice period",
      "Overdue and 30/60/90-day views",
    ],
  },
  {
    id: "settings",
    title: "Settings",
    href: "/modules/settings",
    tagline: "Keys, roles and preferences",
    description:
      "Personal Redmine and Action1 API keys, notification preferences, and — for IT and management — user roles and integration administration.",
    icon: "Settings",
    accent: "#94a3b8",
    access: {
      view: "all",
      edit: "all",
      admin: [IT, MGMT],
    },
    highlights: [
      "Personal Redmine and Action1 API keys",
      "Notification and timezone preferences",
      "Role administration for IT and management",
    ],
  },
];

export const MODULE_BY_ID: Record<ModuleId, ModuleDefinition> = Object.fromEntries(
  MODULES.map((m) => [m.id, m]),
) as Record<ModuleId, ModuleDefinition>;

export function getModule(slug: string): ModuleDefinition | null {
  return MODULES.find((m) => m.id === slug) ?? null;
}

export function hasCapability(
  access: ModuleDefinition["access"],
  capability: Capability,
  role: RoleId,
): boolean {
  const allowed = access[capability];
  if (!allowed) return false;
  if (allowed === "all") return true;
  return allowed.includes(role);
}
