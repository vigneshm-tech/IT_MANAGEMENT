import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import {
  ACTIVITY_TYPE_SEED,
  normaliseActivityTypeName,
  TASK_ACTIVITY_MODULE,
} from "../activity-types";
import { INDUSTRY_SEED, normaliseIndustryName } from "../industries";
import type { SessionUser } from "../auth/token";
import { listDirectory } from "../users/repository";
import { readCache, writeCache } from "../cache/ttl";
import type { RoleId } from "../roles";
import { isPatchOutcome, pendingForApprover } from "../patching/plan";
import type {
  PatchApprover,
  PatchOutcome,
  PatchScheduleRecord,
  SelectedEndpoint,
} from "../patching/plan";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type { PatchApprover, PatchOutcome, PatchScheduleRecord, SelectedEndpoint };

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
  /** Who raised it — `null` on rows written before the id was carried over. */
  requesterId: string | null;
  requesterName: string;
  requesterRole: RoleId;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string;
  createdAt: string;
};

export type ActivityTypeStatus = "active" | "inactive";

export type IndustryRecord = {
  id: string;
  name: string;
  status: ActivityTypeStatus;
  createdAt: string;
};

export type CustomFieldRecord = {
  id: string;
  name: string;
  /** Module the field belongs to (tasks, tickets, …). */
  module: string;
  status: ActivityTypeStatus;
  createdAt: string;
};

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
  industries: IndustryRecord[];
  customFields: CustomFieldRecord[];
  /** `fieldId\u0000recordId` → answer, mirroring `custom_field_values`. */
  customValues: Record<string, string>;
  clients: ClientRecord[];
  patchPlans: PatchPlanRecord[];
  patchSchedules: PatchScheduleRecord[];
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

function seededIndustries(): IndustryRecord[] {
  return INDUSTRY_SEED.map((name, index) => ({
    id: `IND-${index + 1}`,
    name,
    status: "active" as ActivityTypeStatus,
    createdAt: iso(-200 + index),
  }));
}

function demoStore(): Store {
  if (!globalForRecords.__taskTornadoRecords) {
    globalForRecords.__taskTornadoRecords = {
      activityTypes: seededActivityTypes(),
      industries: seededIndustries(),
      customFields: [],
      customValues: {},
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
      patchSchedules: [],
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
          requesterId: "u-it-engineer",
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
          requesterId: "u-dev-engineer",
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
          requesterId: "u-dev-lead",
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
          requesterId: "u-it-manager",
          requesterName: "Meera Raghavan",
          requesterRole: "it_manager",
          status: "approved",
          decidedBy: "Ramesh Subramanian",
          decidedAt: iso(-5),
          note: "Approved as part of the annual budget.",
          createdAt: iso(-9),
        },
        {
          id: "AP-3297",
          title: "Standby laptop for the design team",
          category: "purchase",
          requesterId: "u-super-admin",
          requesterName: "Vignesh",
          requesterRole: "super_admin",
          status: "approved",
          decidedBy: "Ramesh Subramanian",
          decidedAt: iso(-11),
          note: "One spare unit so a failure does not stall a delivery.",
          createdAt: iso(-16),
        },
        {
          id: "AP-3296",
          title: "Firewall rule for the new branch office",
          category: "change",
          requesterId: "u-it-engineer",
          requesterName: "Arun Prakash",
          requesterRole: "it_engineer",
          status: "rejected",
          decidedBy: "Meera Raghavan",
          decidedAt: iso(-13),
          note: "Raised before the branch circuit was provisioned — re-raise once it is.",
          createdAt: iso(-18),
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
  if (!Array.isArray(store.industries)) store.industries = seededIndustries();
  if (!Array.isArray(store.customFields)) store.customFields = [];
  if (!store.customValues || typeof store.customValues !== "object") store.customValues = {};
  if (!Array.isArray(store.patchSchedules)) store.patchSchedules = [];
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
/** People pickers appear on several forms; the directory moves slowly. */
const ASSIGNABLE_TTL_MS = 30_000;

export async function listAssignableUsers(): Promise<AssignableUser[]> {
  if (isSupabaseConfigured) {
    const cached = readCache<AssignableUser[]>("assignable-users");
    if (cached) return cached;

    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.rpc("assignable_users");
      if (error) throw error;
      const people = ((data ?? []) as { id: string; full_name: string; role: string | null }[]).map(
        (row) => ({ id: row.id, name: row.full_name, role: row.role }),
      );
      writeCache("assignable-users", people, ASSIGNABLE_TTL_MS);
      return people;
    } catch (error) {
      console.error("[records] assignable_users failed, falling back to the directory", error);
    }
  }

  const { users } = await listDirectory();
  return users
    .filter((person) => person.status === "active" && person.role)
    .map((person) => ({ id: person.id, name: person.name, role: person.role }));
}

/** Edits an existing client; ids, status and timestamps are never client input. */
export async function updateClientRecord(id: string, input: ClientInput): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().clients.find((client) => client.id === id);
    if (!record) return false;
    record.name = input.name;
    record.code = input.code;
    record.industry = input.industry;
    record.primary = input.primary;
    record.secondary = input.secondary;
    record.ownerRole = input.ownerRole;
    record.assignedUserId = input.assignedUserId;
    record.assignedUserName = input.assignedUserName;
    // Keep the demo stamp strictly after the created one, as the trigger does.
    const previous = new Date(record.updatedAt).getTime();
    record.updatedAt = new Date(Math.max(Date.now(), previous + 1000)).toISOString();
    return true;
  }

  return patchRow("clients", id, {
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
  });
}

/** Removes a client row. Its custom-field answers cascade with it. */
export async function deleteClientRecord(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.clients.findIndex((client) => client.id === id);
    if (index === -1) return false;
    store.clients.splice(index, 1);
    for (const key of Object.keys(store.customValues)) {
      if (key.endsWith(`${VALUE_KEY}${id}`)) delete store.customValues[key];
    }
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("clients").delete().eq("id", id).select("id");
  if (error) {
    console.error("[records] client delete failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
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
/*  Industries (master data for the client form)                              */
/* -------------------------------------------------------------------------- */

function mapIndustry(row: Record<string, unknown>): IndustryRecord {
  return {
    id: s(row.id),
    name: s(row.name),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

/** Every industry, active first, then alphabetically. */
export async function listIndustries(): Promise<IndustryRecord[]> {
  if (!isSupabaseConfigured) {
    return [...demoStore().industries].sort(byStatusThenName);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("industries")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);

    if (error) throw error;
    return (data ?? []).map((row) => mapIndustry(row as Record<string, unknown>));
  } catch (error) {
    console.error("[records] falling back to the demo industries", error);
    return [...demoStore().industries].sort(byStatusThenName);
  }
}

/** Exactly what the client form offers. */
export async function listActiveIndustries(): Promise<string[]> {
  return (await listIndustries())
    .filter((industry) => industry.status === "active")
    .map((industry) => industry.name);
}

export async function createIndustry(
  user: SessionUser,
  rawName: string,
): Promise<IndustryRecord> {
  const name = normaliseIndustryName(rawName);

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: IndustryRecord = {
      id: nextId("IND", store.industries),
      name,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    store.industries.push(record);
    return record;
  }

  return insertRow(
    "industries",
    { name, status: "active", sort_order: 100, created_by: user.id },
    mapIndustry,
  );
}

export async function updateIndustry(id: string, rawName: string): Promise<boolean> {
  const name = normaliseIndustryName(rawName);

  if (!isSupabaseConfigured) {
    const record = demoStore().industries.find((industry) => industry.id === id);
    if (!record) return false;
    record.name = name;
    return true;
  }

  return patchRow("industries", id, { name });
}

export async function setIndustryStatus(
  id: string,
  status: ActivityTypeStatus,
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().industries.find((industry) => industry.id === id);
    if (!record) return false;
    record.status = status;
    return true;
  }
  return patchRow("industries", id, { status });
}

export async function deleteIndustry(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.industries.findIndex((industry) => industry.id === id);
    if (index < 0) return false;
    store.industries.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("industries").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*  Custom fields (master data, filed per module)                             */
/* -------------------------------------------------------------------------- */

function mapCustomField(row: Record<string, unknown>): CustomFieldRecord {
  return {
    id: s(row.id),
    name: s(row.name),
    module: s(row.module, TASK_ACTIVITY_MODULE),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export async function listCustomFields(): Promise<CustomFieldRecord[]> {
  if (!isSupabaseConfigured) {
    return [...demoStore().customFields].sort(byStatusThenName);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("custom_fields")
      .select("*")
      .order("module", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);

    if (error) throw error;
    return (data ?? []).map((row) => mapCustomField(row as Record<string, unknown>));
  } catch (error) {
    console.error("[records] falling back to the demo custom fields", error);
    return [...demoStore().customFields].sort(byStatusThenName);
  }
}

export async function createCustomField(
  user: SessionUser,
  rawName: string,
  module: string,
): Promise<CustomFieldRecord> {
  const name = rawName.replace(/\s+/g, " ").trim();

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: CustomFieldRecord = {
      id: nextId("CF", store.customFields),
      name,
      module,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    store.customFields.push(record);
    return record;
  }

  return insertRow(
    "custom_fields",
    { name, module, status: "active", sort_order: 100, created_by: user.id },
    mapCustomField,
  );
}

export async function updateCustomField(
  id: string,
  rawName: string,
  module: string,
): Promise<boolean> {
  const name = rawName.replace(/\s+/g, " ").trim();

  if (!isSupabaseConfigured) {
    const record = demoStore().customFields.find((field) => field.id === id);
    if (!record) return false;
    record.name = name;
    record.module = module;
    return true;
  }

  return patchRow("custom_fields", id, { name, module });
}

export async function setCustomFieldStatus(
  id: string,
  status: ActivityTypeStatus,
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().customFields.find((field) => field.id === id);
    if (!record) return false;
    record.status = status;
    return true;
  }
  return patchRow("custom_fields", id, { status });
}

export async function deleteCustomField(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.customFields.findIndex((field) => field.id === id);
    if (index < 0) return false;
    store.customFields.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("custom_fields").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*  Custom field answers, read by whichever module the field points at        */
/* -------------------------------------------------------------------------- */

const VALUE_KEY = "\u0000";

function valueKey(fieldId: string, recordId: string) {
  return `${fieldId}${VALUE_KEY}${recordId}`;
}

/** Active fields filed under one module, A→Z — this is what a module form renders. */
export async function listModuleCustomFields(module: string): Promise<CustomFieldRecord[]> {
  const fields = await listCustomFields();
  return fields
    .filter((field) => field.module === module && field.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Answers already recorded for one record, keyed by field id. */
export async function listCustomFieldValues(recordId: string): Promise<Record<string, string>> {
  if (!recordId) return {};

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(store.customValues)) {
      const [fieldId, id] = key.split(VALUE_KEY);
      if (id === recordId) values[fieldId] = value;
    }
    return values;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("custom_field_values")
      .select("field_id, value")
      .eq("record_id", recordId)
      .limit(200);

    if (error) throw error;
    return Object.fromEntries(
      (data ?? []).map((row) => [s((row as Record<string, unknown>).field_id), s((row as Record<string, unknown>).value)]),
    );
  } catch (error) {
    console.error("[records] custom field values could not be read", error);
    return {};
  }
}

/**
 * Writes the answers a module form submitted. Empty answers are stored as ""
 * rather than deleted, so clearing a field is a real edit.
 */
export async function saveCustomFieldValues(
  recordId: string,
  values: Record<string, string>,
): Promise<void> {
  const entries = Object.entries(values);
  if (!recordId || entries.length === 0) return;

  if (!isSupabaseConfigured) {
    const store = demoStore();
    for (const [fieldId, value] of entries) {
      store.customValues[valueKey(fieldId, recordId)] = value;
    }
    return;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("custom_field_values").upsert(
      entries.map(([fieldId, value]) => ({ field_id: fieldId, record_id: recordId, value })),
      { onConflict: "field_id,record_id" },
    );
    if (error) throw error;
  } catch (error) {
    // A failed answer must not lose the record the operator just saved.
    console.error("[records] custom field values could not be saved", error);
  }
}

/** Reads `custom:<fieldId>` entries off a submitted form. */
export function readCustomFieldForm(formData: FormData, fields: CustomFieldRecord[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const raw = formData.get(`custom:${field.id}`);
    if (raw !== null) values[field.id] = String(raw).trim().slice(0, 240);
  }
  return values;
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
    requesterId: typeof row.created_by === "string" ? row.created_by : null,
    requesterName: s(row.requester_name),
    requesterRole: s(row.requester_role, "management") as RoleId,
    status: s(row.status, "pending") as ApprovalStatus,
    decidedBy: typeof row.decided_by === "string" ? row.decided_by : null,
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
    note: s(row.note),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

/**
 * The nav badge needs the pending titles on every page. It is the only reader
 * of this cached copy — the Approvals page always calls `listApprovals()` — so a
 * decision, which clears the key, shows up immediately.
 */
const PENDING_APPROVALS_TTL_MS = 30_000;

export async function listPendingApprovals(): Promise<ApprovalRecord[]> {
  const cached = readCache<ApprovalRecord[]>("pending-approvals");
  if (cached) return cached;

  const pending = (await listApprovals()).filter((approval) => approval.status === "pending");
  if (isSupabaseConfigured) writeCache("pending-approvals", pending, PENDING_APPROVALS_TTL_MS);
  return pending;
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
      requesterId: user.id,
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

function byStatusThenName<T extends { name: string; status: ActivityTypeStatus }>(
  a: T,
  b: T,
): number {
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

/* -------------------------------------------------------------------------- */
/*  Patching plans, one per endpoint                                          */
/* -------------------------------------------------------------------------- */

function mapApprover(row: Record<string, unknown>): PatchApprover {
  const status = s(row.status, "pending");
  return {
    approverId: s(row.approver_id),
    approverName: s(row.approver_name),
    status: status === "approved" || status === "rejected" ? status : "pending",
    verificationName: s(row.verification_name),
    note: s(row.note),
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
  };
}

/** Rows written before migration 0022 have no outcome column — they read as not run. */
function outcomeFrom(value: unknown): PatchOutcome {
  const text = typeof value === "string" ? value : "";
  return isPatchOutcome(text) ? text : "pending";
}

function mapSchedule(
  row: Record<string, unknown>,
  approvers: PatchApprover[],
): PatchScheduleRecord {
  return {
    id: s(row.id),
    endpointId: s(row.endpoint_id),
    endpointName: s(row.endpoint_name),
    missingCount: n(row.missing_count),
    otherCount: n(row.other_count),
    plannedDate: s(row.planned_date).slice(0, 10),
    handlerId: s(row.handler_id),
    handlerName: s(row.handler_name),
    approvers,
    outcome: outcomeFrom(row.outcome),
    outcomeByName: s(row.outcome_by_name),
    outcomeAt: typeof row.outcome_at === "string" ? row.outcome_at : null,
    note: s(row.note),
    createdByName: s(row.created_by_name),
    createdAt: s(row.created_at, new Date().toISOString()),
    updatedAt: s(row.updated_at, s(row.created_at, new Date().toISOString())),
  };
}

/**
 * Every plan with its approvers. Read by the register, the report, the
 * Approvals inbox and the nav badge, so it is cached for thirty seconds — every
 * patching action clears `patch-schedules` before it revalidates.
 */
const PATCH_SCHEDULES_TTL_MS = 30_000;

export async function listPatchSchedules(): Promise<PatchScheduleRecord[]> {
  if (!isSupabaseConfigured) {
    return [...demoStore().patchSchedules].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  }

  const cached = readCache<PatchScheduleRecord[]>("patch-schedules");
  if (cached) return cached;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("patch_schedules")
      .select("*")
      .order("planned_date", { ascending: true })
      .limit(500);
    if (error) throw error;

    const schedules = (data ?? []) as Record<string, unknown>[];
    if (schedules.length === 0) return [];

    const ids = schedules.map((row) => s(row.id)).filter(Boolean);
    const { data: approverRows, error: approverError } = await supabase
      .from("patch_schedule_approvers")
      .select("*")
      .in("schedule_id", ids);
    if (approverError) throw approverError;

    const bySchedule = new Map<string, PatchApprover[]>();
    for (const row of (approverRows ?? []) as Record<string, unknown>[]) {
      const key = s(row.schedule_id);
      const list = bySchedule.get(key) ?? [];
      list.push(mapApprover(row));
      bySchedule.set(key, list);
    }

    const plans = schedules.map((row) => mapSchedule(row, bySchedule.get(s(row.id)) ?? []));
    writeCache("patch-schedules", plans, PATCH_SCHEDULES_TTL_MS);
    return plans;
  } catch (error) {
    console.error("[records] patch schedules select failed", error);
    return [];
  }
}

/**
 * The patch plans waiting for one person's decision — the source of the
 * "Patching sign-offs" section on Approvals and of the bell's patch entries.
 */
export async function listPatchInbox(userId: string): Promise<PatchScheduleRecord[]> {
  if (!userId) return [];
  return pendingForApprover(await listPatchSchedules(), userId);
}

export type PatchScheduleInput = {
  endpoints: SelectedEndpoint[];
  plannedDate: string;
  handlerId: string;
  handlerName: string;
  approvers: { id: string; name: string }[];
  note: string;
};

/**
 * Writes one plan per endpoint. Scheduling an endpoint that already has a plan
 * replaces its date, handler and approvers, and resets every decision to
 * pending — a changed plan has to be signed off again.
 */
export async function savePatchSchedules(
  user: SessionUser,
  input: PatchScheduleInput,
): Promise<PatchScheduleRecord[]> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const saved: PatchScheduleRecord[] = [];

    for (const endpoint of input.endpoints) {
      const existing = store.patchSchedules.find((plan) => plan.endpointId === endpoint.id);
      const approvers: PatchApprover[] = input.approvers.map((approver) => ({
        approverId: approver.id,
        approverName: approver.name,
        status: "pending",
        verificationName: "",
        note: "",
        decidedAt: null,
      }));

      if (existing) {
        Object.assign(existing, {
          endpointName: endpoint.name,
          missingCount: endpoint.missing,
          otherCount: endpoint.other,
          plannedDate: input.plannedDate,
          handlerId: input.handlerId,
          handlerName: input.handlerName,
          approvers,
          // A new date means the old result no longer applies.
          outcome: "pending",
          outcomeByName: "",
          outcomeAt: null,
          note: input.note,
          updatedAt: now,
        });
        saved.push(existing);
      } else {
        const record: PatchScheduleRecord = {
          id: nextId("PS", store.patchSchedules),
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          missingCount: endpoint.missing,
          otherCount: endpoint.other,
          plannedDate: input.plannedDate,
          handlerId: input.handlerId,
          handlerName: input.handlerName,
          approvers,
          outcome: "pending",
          outcomeByName: "",
          outcomeAt: null,
          note: input.note,
          createdByName: user.name,
          createdAt: now,
          updatedAt: now,
        };
        store.patchSchedules.unshift(record);
        saved.push(record);
      }
    }

    return saved;
  }

  const supabase = await createSupabaseServerClient();
  const saved: PatchScheduleRecord[] = [];

  for (const endpoint of input.endpoints) {
    const { data: existingRows, error: findError } = await supabase
      .from("patch_schedules")
      .select("id")
      .eq("endpoint_id", endpoint.id)
      .limit(1);
    if (findError) throw findError;

    const values = {
      endpoint_id: endpoint.id,
      endpoint_name: endpoint.name,
      missing_count: endpoint.missing,
      other_count: endpoint.other,
      planned_date: input.plannedDate,
      handler_id: input.handlerId || null,
      handler_name: input.handlerName,
      outcome: "pending",
      outcome_by_name: "",
      outcome_at: null,
      note: input.note,
    };

    let scheduleId = s((existingRows?.[0] as Record<string, unknown> | undefined)?.id);

    if (scheduleId) {
      const { error } = await supabase
        .from("patch_schedules")
        .update(values)
        .eq("id", scheduleId);
      if (error) throw error;

      const { error: clearError } = await supabase
        .from("patch_schedule_approvers")
        .delete()
        .eq("schedule_id", scheduleId);
      if (clearError) throw clearError;
    } else {
      const { data: inserted, error } = await supabase
        .from("patch_schedules")
        .insert({ ...values, created_by: user.id, created_by_name: user.name })
        .select("id")
        .single();
      if (error || !inserted) throw error ?? new Error("Schedule insert failed");
      scheduleId = s((inserted as Record<string, unknown>).id);
    }

    const { error: approverError } = await supabase.from("patch_schedule_approvers").insert(
      input.approvers.map((approver) => ({
        schedule_id: scheduleId,
        approver_id: approver.id,
        approver_name: approver.name,
      })),
    );
    if (approverError) throw approverError;

    saved.push({
      id: scheduleId,
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      missingCount: endpoint.missing,
      otherCount: endpoint.other,
      plannedDate: input.plannedDate,
      handlerId: input.handlerId,
      handlerName: input.handlerName,
      approvers: input.approvers.map((approver) => ({
        approverId: approver.id,
        approverName: approver.name,
        status: "pending",
        verificationName: "",
        note: "",
        decidedAt: null,
      })),
      outcome: "pending",
      outcomeByName: "",
      outcomeAt: null,
      note: input.note,
      createdByName: user.name,
      createdAt: now,
      updatedAt: now,
    });
  }

  return saved;
}

/**
 * Records the signed-in person's decision on a plan. The verification name is
 * collected here, at approval time, and printed on the report.
 */
export async function decidePatchSchedule(input: {
  scheduleId: string;
  approverId: string;
  decision: "approved" | "rejected";
  verificationName: string;
  note: string;
}): Promise<boolean> {
  const decidedAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const plan = demoStore().patchSchedules.find((item) => item.id === input.scheduleId);
    const approver = plan?.approvers.find((item) => item.approverId === input.approverId);
    if (!plan || !approver) return false;
    approver.status = input.decision;
    approver.verificationName = input.verificationName;
    approver.note = input.note;
    approver.decidedAt = decidedAt;
    plan.updatedAt = decidedAt;
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patch_schedule_approvers")
    .update({
      status: input.decision,
      verification_name: input.verificationName,
      note: input.note,
      decided_at: decidedAt,
    })
    .eq("schedule_id", input.scheduleId)
    .eq("approver_id", input.approverId)
    .select("schedule_id");

  if (error) {
    console.error("[records] patch decision failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Records what happened when the patching ran: success, failed, partial — or
 * back to "not run" when a result was entered against the wrong row. The name
 * of the person recording it travels with the value so the report can print it.
 */
export async function setPatchOutcome(input: {
  scheduleId: string;
  outcome: PatchOutcome;
  byName: string;
}): Promise<boolean> {
  const at = new Date().toISOString();
  const recorded = input.outcome === "pending";

  if (!isSupabaseConfigured) {
    const plan = demoStore().patchSchedules.find((item) => item.id === input.scheduleId);
    if (!plan) return false;
    plan.outcome = input.outcome;
    plan.outcomeByName = recorded ? "" : input.byName;
    plan.outcomeAt = recorded ? null : at;
    plan.updatedAt = at;
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patch_schedules")
    .update({
      outcome: input.outcome,
      outcome_by_name: recorded ? "" : input.byName,
      outcome_at: recorded ? null : at,
    })
    .eq("id", input.scheduleId)
    .select("id");

  if (error) {
    console.error("[records] patch outcome failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
