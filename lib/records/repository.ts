import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import {
  ACTIVITY_TYPE_SEED,
  normaliseActivityTypeName,
  TASK_ACTIVITY_MODULE,
} from "../activity-types";
import type { SessionUser } from "../auth/token";
import { listDirectory } from "../users/repository";
import type { RoleId } from "../roles";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type ClientStatus = "active" | "inactive";
export type PatchStatus = "planned" | "in_progress" | "completed";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type RenewalStatus = "active" | "due" | "renewed" | "expired";

/** One of the two contacts a client record carries. */
export type ClientContact = {
  name: string;
  email: string;
  /** ISO-3166 alpha-2 of the mobile's country code, e.g. "IN". */
  mobileCountry: string;
  /** Digits only, so "+91 98400 12345" is stored as "9840012345". */
  mobile: string;
};

export type ClientRecord = {
  id: string;
  name: string;
  /** Short code / license code used across the workspace. */
  code: string;
  industry: string;
  primary: ClientContact;
  secondary: ClientContact;
  ownerRole: RoleId;
  assignedUserId: string;
  assignedUserName: string;
  status: ClientStatus;
  /** Captured by the database on insert. */
  createdAt: string;
  /** Captured by the database trigger on every update. */
  updatedAt: string;
};

/** What the client form submits; ids and timestamps are never client input. */
export type ClientInput = Omit<
  ClientRecord,
  "id" | "status" | "createdAt" | "updatedAt"
>;

/** Someone a client can be assigned to. */
export type AssignableUser = {
  id: string;
  name: string;
  role: string | null;
};

export type PatchPlanRecord = {
  id: string;
  title: string;
  clientName: string;
  windowDate: string;
  ring: "A" | "B" | "C";
  ownerRole: RoleId;
  status: PatchStatus;
  notes: string;
  createdAt: string;
};

export type ApprovalRecord = {
  id: string;
  title: string;
  category: "change" | "access" | "patch" | "purchase";
  requesterName: string;
  requesterRole: RoleId;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string;
  createdAt: string;
};

export type ActivityTypeStatus = "active" | "inactive";

export type ActivityTypeRecord = {
  id: string;
  name: string;
  /** Which module offers this type (tasks, tickets, …). */
  module: string;
  status: ActivityTypeStatus;
  createdAt: string;
};

export type RenewalRecord = {
  id: string;
  item: string;
  vendor: string;
  clientName: string;
  amount: number;
  currency: "INR" | "USD" | "EUR";
  renewalDate: string;
  noticeDays: number;
  ownerRole: RoleId;
  status: RenewalStatus;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/*  Demo store (used only when Supabase is not configured)                    */
/* -------------------------------------------------------------------------- */

type Store = {
  activityTypes: ActivityTypeRecord[];
  clients: ClientRecord[];
  patchPlans: PatchPlanRecord[];
  approvals: ApprovalRecord[];
  renewals: RenewalRecord[];
};

const globalForRecords = globalThis as unknown as { __taskTornadoRecords?: Store };

function iso(daysFromNow: number, hour = 10): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function seededActivityTypes(): ActivityTypeRecord[] {
  return ACTIVITY_TYPE_SEED.map((name, index) => ({
    id: `AT-${index + 1}`,
    name,
    module: TASK_ACTIVITY_MODULE,
    status: "active" as ActivityTypeStatus,
    createdAt: iso(-180 + index),
  }));
}

function demoStore(): Store {
  if (!globalForRecords.__taskTornadoRecords) {
    globalForRecords.__taskTornadoRecords = {
      activityTypes: seededActivityTypes(),
      clients: [
        {
          id: "CL-1001",
          name: "Acme Manufacturing",
          code: "ACME",
          industry: "Manufacturing",
          primary: {
            name: "Ritu Shah",
            email: "ritu.shah@acme.example",
            mobileCountry: "IN",
            mobile: "9840012345",
          },
          secondary: {
            name: "Vikram Rao",
            email: "vikram.rao@acme.example",
            mobileCountry: "IN",
            mobile: "9840098765",
          },
          ownerRole: "implementation_lead",
          assignedUserId: "u-impl-lead",
          assignedUserName: "Priya Nair",
          status: "active",
          createdAt: iso(-120),
          updatedAt: iso(-12),
        },
        {
          id: "CL-1002",
          name: "Northwind Logistics",
          code: "NWL",
          industry: "Logistics",
          primary: {
            name: "Daniel Roy",
            email: "daniel.roy@northwind.example",
            mobileCountry: "IN",
            mobile: "9940112233",
          },
          secondary: {
            name: "",
            email: "",
            mobileCountry: "IN",
            mobile: "",
          },
          ownerRole: "l2_support_lead",
          assignedUserId: "u-l2-lead",
          assignedUserName: "Karthik Raman",
          status: "active",
          createdAt: iso(-80),
          updatedAt: iso(-9),
        },
        {
          id: "CL-1003",
          name: "Sterling Health",
          code: "STH",
          industry: "Healthcare",
          primary: {
            name: "Meera Iyer",
            email: "meera.iyer@sterling.example",
            mobileCountry: "IN",
            mobile: "9845566778",
          },
          secondary: {
            name: "Rahul Deshpande",
            email: "rahul.d@sterling.example",
            mobileCountry: "IN",
            mobile: "9845566790",
          },
          ownerRole: "implementation_manager",
          assignedUserId: "u-impl-engineer",
          assignedUserName: "Vikram Shetty",
          status: "active",
          createdAt: iso(-45),
          updatedAt: iso(-4),
        },
        {
          id: "CL-1004",
          name: "Vantage Retail",
          code: "VTR",
          industry: "Retail",
          primary: {
            name: "Arjun Kapoor",
            email: "arjun.kapoor@vantage.example",
            mobileCountry: "IN",
            mobile: "9003344556",
          },
          secondary: {
            name: "",
            email: "",
            mobileCountry: "IN",
            mobile: "",
          },
          ownerRole: "development_lead",
          assignedUserId: "u-dev-engineer",
          assignedUserName: "Rahul Menon",
          status: "inactive",
          createdAt: iso(-200),
          updatedAt: iso(-150),
        },
      ],
      patchPlans: [
        {
          id: "PP-2041",
          title: "November security rollup",
          clientName: "Acme Manufacturing",
          windowDate: iso(3, 22),
          ring: "A",
          ownerRole: "it_engineer",
          status: "planned",
          notes: "Reboot approval confirmed by the client contact.",
          createdAt: iso(-6),
        },
        {
          id: "PP-2040",
          title: "Edge agent update",
          clientName: "Northwind Logistics",
          windowDate: iso(-2, 23),
          ring: "B",
          ownerRole: "it_engineer",
          status: "in_progress",
          notes: "Monitoring for endpoints that miss the window.",
          createdAt: iso(-12),
        },
        {
          id: "PP-2039",
          title: "October critical patches",
          clientName: "Sterling Health",
          windowDate: iso(-22, 21),
          ring: "A",
          ownerRole: "it_manager",
          status: "completed",
          notes: "42 of 42 endpoints compliant.",
          createdAt: iso(-30),
        },
      ],
      approvals: [
        {
          id: "AP-3301",
          title: "Emergency patch exception for radiology servers",
          category: "patch",
          requesterName: "Arun Prakash",
          requesterRole: "it_engineer",
          status: "pending",
          decidedBy: null,
          decidedAt: null,
          note: "Out-of-band patch needed before the vendor audit.",
          createdAt: iso(-1),
        },
        {
          id: "AP-3300",
          title: "Production database access for release 4.8",
          category: "access",
          requesterName: "Rahul Menon",
          requesterRole: "development_engineer",
          status: "pending",
          decidedBy: null,
          decidedAt: null,
          note: "Read-only access for two days during the release window.",
          createdAt: iso(-2),
        },
        {
          id: "AP-3299",
          title: "Change request: SSO certificate rotation",
          category: "change",
          requesterName: "Sneha Pillai",
          requesterRole: "development_lead",
          status: "pending",
          decidedBy: null,
          decidedAt: null,
          note: "Certificate expires in 9 days.",
          createdAt: iso(-3),
        },
        {
          id: "AP-3298",
          title: "Annual Action1 licence renewal",
          category: "purchase",
          requesterName: "Meera Raghavan",
          requesterRole: "it_manager",
          status: "approved",
          decidedBy: "Ramesh Subramanian",
          decidedAt: iso(-5),
          note: "Approved as part of the annual budget.",
          createdAt: iso(-9),
        },
      ],
      renewals: [
        {
          id: "RN-501",
          item: "Action1 endpoint licence",
          vendor: "Action1",
          clientName: "Internal",
          amount: 480000,
          currency: "INR",
          renewalDate: iso(12),
          noticeDays: 30,
          ownerRole: "it_manager",
          status: "due",
          createdAt: iso(-300),
        },
        {
          id: "RN-502",
          item: "Acme AMC — 2027",
          vendor: "Acme Support",
          clientName: "Acme Manufacturing",
          amount: 1250000,
          currency: "INR",
          renewalDate: iso(38),
          noticeDays: 45,
          ownerRole: "l2_support_manager",
          status: "active",
          createdAt: iso(-200),
        },
        {
          id: "RN-503",
          item: "Sterling private cloud",
          vendor: "Sterling Cloud",
          clientName: "Sterling Health",
          amount: 8900,
          currency: "USD",
          renewalDate: iso(74),
          noticeDays: 60,
          ownerRole: "implementation_manager",
          status: "active",
          createdAt: iso(-150),
        },
        {
          id: "RN-504",
          item: "Northwind monitoring add-on",
          vendor: "Northwind",
          clientName: "Northwind Logistics",
          amount: 260000,
          currency: "INR",
          renewalDate: iso(-18),
          noticeDays: 30,
          ownerRole: "l2_support_lead",
          status: "renewed",
          createdAt: iso(-400),
        },
      ],
    };
  }

  const store = globalForRecords.__taskTornadoRecords;
  // A long-lived dev process can still be holding a store created by an older
  // build; backfill registers that did not exist when it was seeded.
  if (!Array.isArray(store.activityTypes)) store.activityTypes = seededActivityTypes();
  // Records seeded before the module column existed belong to the task form.
  for (const type of store.activityTypes) {
    if (!type.module) type.module = TASK_ACTIVITY_MODULE;
  }

  return store;
}

function nextId(prefix: string, existing: { id: string }[]): string {
  const numbers = existing
    .map((item) => Number(item.id.split("-")[1]))
    .filter((value) => Number.isFinite(value));
  const next = Math.max(0, ...numbers) + 1;
  return `${prefix}-${next}`;
}

/* -------------------------------------------------------------------------- */
/*  Supabase helpers                                                          */
/* -------------------------------------------------------------------------- */

async function selectRows<T>(
  table: string,
  map: (row: Record<string, unknown>) => T,
): Promise<T[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row) => map(row as Record<string, unknown>));
}

async function insertRow<T>(
  table: string,
  values: Record<string, unknown>,
  map: (row: Record<string, unknown>) => T,
): Promise<T> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from(table).insert(values).select("*").single();
  if (error || !data) throw error ?? new Error("Insert failed");
  return map(data as Record<string, unknown>);
}

async function patchRow(
  table: string,
  id: string,
  values: Record<string, unknown>,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from(table).update(values).eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

function s(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function n(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* -------------------------------------------------------------------------- */
/*  Clients                                                                   */
/* -------------------------------------------------------------------------- */

function mapClientContact(
  row: Record<string, unknown>,
  prefix: "primary" | "secondary",
): ClientContact {
  return {
    name: s(row[`${prefix}_contact_name`]),
    email: s(row[`${prefix}_contact_email`]),
    mobileCountry: s(row[`${prefix}_mobile_country`], "IN") || "IN",
    mobile: s(row[`${prefix}_mobile`]),
  };
}

function mapClient(row: Record<string, unknown>): ClientRecord {
  const createdAt = s(row.created_at, new Date().toISOString());
  return {
    id: s(row.id),
    name: s(row.name),
    code: s(row.code),
    industry: s(row.industry),
    primary: mapClientContact(row, "primary"),
    secondary: mapClientContact(row, "secondary"),
    ownerRole: s(row.owner_role, "implementation_lead") as RoleId,
    assignedUserId: s(row.assigned_user_id),
    assignedUserName: s(row.assigned_user_name),
    status: s(row.status, "active") as ClientStatus,
    createdAt,
    // The database trigger owns this; the fallback keeps older rows readable.
    updatedAt: s(row.updated_at, createdAt),
  };
}

export async function listClients(): Promise<ClientRecord[]> {
  if (!isSupabaseConfigured) return demoStore().clients;
  try {
    return await selectRows("clients", mapClient);
  } catch (error) {
    console.error("[records] clients select failed", error);
    return [];
  }
}

export async function createClientRecord(
  user: SessionUser,
  input: ClientInput,
): Promise<ClientRecord> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const now = new Date().toISOString();
    const record: ClientRecord = {
      ...input,
      id: nextId("CL", store.clients),
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    store.clients.unshift(record);
    return record;
  }

  return insertRow(
    "clients",
    {
      name: input.name,
      code: input.code,
      industry: input.industry,
      primary_contact_name: input.primary.name,
      primary_contact_email: input.primary.email,
      primary_mobile_country: input.primary.mobileCountry || "IN",
      primary_mobile: input.primary.mobile,
      secondary_contact_name: input.secondary.name,
      secondary_contact_email: input.secondary.email,
      secondary_mobile_country: input.secondary.mobileCountry || "IN",
      secondary_mobile: input.secondary.mobile,
      owner_role: input.ownerRole,
      assigned_user_id: input.assignedUserId || null,
      assigned_user_name: input.assignedUserName,
      status: "active",
      created_by: user.id,
    },
    mapClient,
  );
}

/**
 * People a client can be assigned to. Profiles are readable only by the super
 * admin, so the app calls the `assignable_users()` RPC (security definer, names
 * only). Any failure falls back to the directory the caller can already see.
 */
export async function listAssignableUsers(): Promise<AssignableUser[]> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.rpc("assignable_users");
      if (error) throw error;
      return ((data ?? []) as { id: string; full_name: string; role: string | null }[]).map(
        (row) => ({ id: row.id, name: row.full_name, role: row.role }),
      );
    } catch (error) {
      console.error("[records] assignable_users failed, falling back to the directory", error);
    }
  }

  const { users } = await listDirectory();
  return users
    .filter((person) => person.status === "active" && person.role)
    .map((person) => ({ id: person.id, name: person.name, role: person.role }));
}

export async function setClientStatus(id: string, status: ClientStatus): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().clients.find((client) => client.id === id);
    if (!record) return false;
    record.status = status;
    return true;
  }
  return patchRow("clients", id, { status });
}

/* -------------------------------------------------------------------------- */
/*  Patching plans                                                            */
/* -------------------------------------------------------------------------- */

function mapPatchPlan(row: Record<string, unknown>): PatchPlanRecord {
  return {
    id: s(row.id),
    title: s(row.title),
    clientName: s(row.client_name),
    windowDate: s(row.window_date, new Date().toISOString()),
    ring: s(row.ring, "A") as PatchPlanRecord["ring"],
    ownerRole: s(row.owner_role, "it_engineer") as RoleId,
    status: s(row.status, "planned") as PatchStatus,
    notes: s(row.notes),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export async function listPatchPlans(): Promise<PatchPlanRecord[]> {
  if (!isSupabaseConfigured) return demoStore().patchPlans;
  try {
    return await selectRows("patch_plans", mapPatchPlan);
  } catch (error) {
    console.error("[records] patch plans select failed", error);
    return [];
  }
}

export async function createPatchPlan(
  user: SessionUser,
  input: Omit<PatchPlanRecord, "id" | "status" | "createdAt">,
): Promise<PatchPlanRecord> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: PatchPlanRecord = {
      ...input,
      id: nextId("PP", store.patchPlans),
      status: "planned",
      createdAt: new Date().toISOString(),
    };
    store.patchPlans.unshift(record);
    return record;
  }

  return insertRow(
    "patch_plans",
    {
      title: input.title,
      client_name: input.clientName,
      window_date: input.windowDate,
      ring: input.ring,
      owner_role: input.ownerRole,
      status: "planned",
      notes: input.notes,
      created_by: user.id,
    },
    mapPatchPlan,
  );
}

export async function setPatchPlanStatus(id: string, status: PatchStatus): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().patchPlans.find((plan) => plan.id === id);
    if (!record) return false;
    record.status = status;
    return true;
  }
  return patchRow("patch_plans", id, { status });
}

/* -------------------------------------------------------------------------- */
/*  Approvals                                                                 */
/* -------------------------------------------------------------------------- */

function mapApproval(row: Record<string, unknown>): ApprovalRecord {
  return {
    id: s(row.id),
    title: s(row.title),
    category: s(row.category, "change") as ApprovalRecord["category"],
    requesterName: s(row.requester_name),
    requesterRole: s(row.requester_role, "management") as RoleId,
    status: s(row.status, "pending") as ApprovalStatus,
    decidedBy: typeof row.decided_by === "string" ? row.decided_by : null,
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
    note: s(row.note),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export async function listApprovals(): Promise<ApprovalRecord[]> {
  if (!isSupabaseConfigured) return demoStore().approvals;
  try {
    return await selectRows("approvals", mapApproval);
  } catch (error) {
    console.error("[records] approvals select failed", error);
    return [];
  }
}

export async function createApproval(
  user: SessionUser,
  input: { title: string; category: ApprovalRecord["category"]; note: string },
): Promise<ApprovalRecord> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: ApprovalRecord = {
      ...input,
      id: nextId("AP", store.approvals),
      requesterName: user.name,
      requesterRole: user.role,
      status: "pending",
      decidedBy: null,
      decidedAt: null,
      createdAt: new Date().toISOString(),
    };
    store.approvals.unshift(record);
    return record;
  }

  return insertRow(
    "approvals",
    {
      title: input.title,
      category: input.category,
      note: input.note,
      requester_name: user.name,
      requester_role: user.role,
      status: "pending",
      created_by: user.id,
    },
    mapApproval,
  );
}

export async function decideApproval(
  id: string,
  decision: Exclude<ApprovalStatus, "pending">,
  user: SessionUser,
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().approvals.find((approval) => approval.id === id);
    if (!record || record.status !== "pending") return false;
    record.status = decision;
    record.decidedBy = user.name;
    record.decidedAt = new Date().toISOString();
    return true;
  }
  return patchRow("approvals", id, {
    status: decision,
    decided_by: user.name,
    decided_at: new Date().toISOString(),
  });
}

/* -------------------------------------------------------------------------- */
/*  Renewals                                                                  */
/* -------------------------------------------------------------------------- */

function mapRenewal(row: Record<string, unknown>): RenewalRecord {
  return {
    id: s(row.id),
    item: s(row.item),
    vendor: s(row.vendor),
    clientName: s(row.client_name),
    amount: n(row.amount),
    currency: s(row.currency, "INR") as RenewalRecord["currency"],
    renewalDate: s(row.renewal_date, new Date().toISOString()),
    noticeDays: n(row.notice_days, 30),
    ownerRole: s(row.owner_role, "it_manager") as RoleId,
    status: s(row.status, "active") as RenewalStatus,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export async function listRenewals(): Promise<RenewalRecord[]> {
  if (!isSupabaseConfigured) return demoStore().renewals;
  try {
    return await selectRows("renewals", mapRenewal);
  } catch (error) {
    console.error("[records] renewals select failed", error);
    return [];
  }
}

export async function createRenewal(
  user: SessionUser,
  input: Omit<RenewalRecord, "id" | "status" | "createdAt">,
): Promise<RenewalRecord> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: RenewalRecord = {
      ...input,
      id: nextId("RN", store.renewals),
      status: "active",
      createdAt: new Date().toISOString(),
    };
    store.renewals.unshift(record);
    return record;
  }

  return insertRow(
    "renewals",
    {
      item: input.item,
      vendor: input.vendor,
      client_name: input.clientName,
      amount: input.amount,
      currency: input.currency,
      renewal_date: input.renewalDate,
      notice_days: input.noticeDays,
      owner_role: input.ownerRole,
      status: "active",
      created_by: user.id,
    },
    mapRenewal,
  );
}

export async function markRenewalRenewed(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().renewals.find((renewal) => renewal.id === id);
    if (!record) return false;
    record.status = "renewed";
    return true;
  }
  return patchRow("renewals", id, { status: "renewed" });
}

/* -------------------------------------------------------------------------- */
/*  Activity types (master data for the task form)                            */
/* -------------------------------------------------------------------------- */

function mapActivityType(row: Record<string, unknown>): ActivityTypeRecord {
  return {
    id: s(row.id),
    name: s(row.name),
    module: s(row.module, TASK_ACTIVITY_MODULE),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

/** Every type, active first, then alphabetically. */
export async function listActivityTypes(): Promise<ActivityTypeRecord[]> {
  if (!isSupabaseConfigured) {
    return [...demoStore().activityTypes].sort(byStatusThenName);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("activity_types")
      .select("*")
      .order("module", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(200);

    if (error) throw error;
    return (data ?? []).map((row) => mapActivityType(row as Record<string, unknown>));
  } catch (error) {
    console.error("[records] falling back to the demo activity types", error);
    return [...demoStore().activityTypes].sort(byStatusThenName);
  }
}

/** Exactly what a module's form may offer — the task form asks for "tasks". */
export async function listActiveActivityTypes(
  module: string = TASK_ACTIVITY_MODULE,
): Promise<string[]> {
  const types = await listActivityTypes();
  return types
    .filter((type) => type.status === "active" && type.module === module)
    .map((type) => type.name);
}

function byStatusThenName(a: ActivityTypeRecord, b: ActivityTypeRecord): number {
  if (a.status !== b.status) return a.status === "active" ? -1 : 1;
  return a.name.localeCompare(b.name, "en");
}

export async function createActivityType(
  user: SessionUser,
  rawName: string,
  module: string = TASK_ACTIVITY_MODULE,
): Promise<ActivityTypeRecord> {
  const name = normaliseActivityTypeName(rawName);

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: ActivityTypeRecord = {
      id: nextId("AT", store.activityTypes),
      name,
      module,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    store.activityTypes.push(record);
    return record;
  }

  return insertRow(
    "activity_types",
    {
      name,
      module,
      status: "active",
      sort_order: 100,
      created_by: user.id,
    },
    mapActivityType,
  );
}

/** Renames a type, or moves it to another module. Uniqueness is per module. */
export async function updateActivityType(
  id: string,
  rawName: string,
  module: string,
): Promise<boolean> {
  const name = normaliseActivityTypeName(rawName);

  if (!isSupabaseConfigured) {
    const record = demoStore().activityTypes.find((type) => type.id === id);
    if (!record) return false;
    record.name = name;
    record.module = module;
    return true;
  }

  return patchRow("activity_types", id, { name, module });
}

export async function setActivityTypeStatus(
  id: string,
  status: ActivityTypeStatus,
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().activityTypes.find((type) => type.id === id);
    if (!record) return false;
    record.status = status;
    return true;
  }
  return patchRow("activity_types", id, { status });
}

export async function deleteActivityType(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.activityTypes.findIndex((type) => type.id === id);
    if (index < 0) return false;
    store.activityTypes.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("activity_types").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*  Derived helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Days from today until an ISO date (negative when past). */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const target = new Date(isoDate);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}
