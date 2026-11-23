import { randomBytes } from "node:crypto";
import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import {
  ENVIRONMENTS,
  isAppStatus,
  isDbStatus,
  isEngine,
  isEnvironment,
  type AppStatus,
  type ApplicationInput,
  type DatabaseInput,
  type DbStatus,
  type Engine,
  type Environment,
  type IisApplication,
  type IisDatabase,
} from "./constants";

export * from "./constants";

/* -------------------------------------------------------------------------- */
/*  Validation — the same rules the database enforces, in a sentence          */
/* -------------------------------------------------------------------------- */

const NAME_MIN = 2;
const NAME_MAX = 80;

export function applicationError(
  input: ApplicationInput,
  existing: { id: string; name: string; server: string }[],
  ignoreId?: string,
): string | null {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < NAME_MIN) return "Give the application a name of at least 2 characters.";
  if (name.length > NAME_MAX) return `Keep the application name under ${NAME_MAX} characters.`;
  if (input.notes.length > 500) return "Keep the notes under 500 characters.";
  if (input.binding.length > 200) return "Keep the binding under 200 characters.";

  const clash = existing.find(
    (row) =>
      row.id !== ignoreId &&
      row.name.trim().toLowerCase() === name.toLowerCase() &&
      (row.server ?? "").trim().toLowerCase() === input.server.trim().toLowerCase(),
  );
  if (clash) return `"${name}" already exists on ${input.server || "that server"}.`;
  return null;
}

export function databaseError(
  input: DatabaseInput,
  existing: { id: string; name: string; server: string }[],
  ignoreId?: string,
): string | null {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < NAME_MIN) return "Give the database a name of at least 2 characters.";
  if (name.length > NAME_MAX) return `Keep the database name under ${NAME_MAX} characters.`;
  if (input.sizeGb !== null && (!Number.isFinite(input.sizeGb) || input.sizeGb < 0)) {
    return "Size must be a number of gigabytes, or blank.";
  }
  if (input.sizeGb !== null && input.sizeGb > 1_000_000) return "That size is not credible.";
  if (input.lastBackupAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.lastBackupAt)) {
    return "Last backup must be a date.";
  }

  const clash = existing.find(
    (row) =>
      row.id !== ignoreId &&
      row.name.trim().toLowerCase() === name.toLowerCase() &&
      (row.server ?? "").trim().toLowerCase() === input.server.trim().toLowerCase(),
  );
  if (clash) return `"${name}" already exists on ${input.server || "that instance"}.`;
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Reading a register, in one shape                                          */
/* -------------------------------------------------------------------------- */

export type RegisterSummary = {
  total: number;
  active: number;
  attention: number;
  byEnvironment: { environment: Environment; count: number }[];
};

/** "Attention" means something a person must look at, not merely "not running". */
export function summariseApplications(rows: IisApplication[]): RegisterSummary {
  const live = rows.filter((row) => row.active);
  return {
    total: rows.length,
    active: live.length,
    attention: live.filter((row) => row.status === "stopped" || row.status === "degraded").length,
    byEnvironment: ENVIRONMENTS.map((environment) => ({
      environment,
      count: live.filter((row) => row.environment === environment).length,
    })),
  };
}

export function summariseDatabases(
  rows: IisDatabase[],
  now = new Date(),
): RegisterSummary {
  const live = rows.filter((row) => row.active);
  return {
    total: rows.length,
    active: live.length,
    attention: live.filter((row) => row.status !== "online" || backupOverdue(row, now)).length,
    byEnvironment: ENVIRONMENTS.map((environment) => ({
      environment,
      count: live.filter((row) => row.environment === environment).length,
    })),
  };
}

/** A backup older than seven days is a fact the page should say out loud. */
export const BACKUP_GRACE_DAYS = 7;

export function backupAgeDays(row: IisDatabase, now = new Date()): number | null {
  if (!row.lastBackupAt) return null;
  const at = new Date(`${row.lastBackupAt}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  return Math.floor((now.getTime() - at.getTime()) / 86_400_000);
}

export function backupOverdue(row: IisDatabase, now = new Date()): boolean {
  if (row.status === "offline") return false;
  const days = backupAgeDays(row, now);
  return days === null || days > BACKUP_GRACE_DAYS;
}

export function describeBackup(row: IisDatabase, now = new Date()): string {
  const days = backupAgeDays(row, now);
  if (days === null) return "Never backed up";
  if (days <= 0) return "Backed up today";
  return `Backed up ${days} day${days === 1 ? "" : "s"} ago`;
}

/* -------------------------------------------------------------------------- */
/*  Demo store                                                                */
/* -------------------------------------------------------------------------- */

type DemoStore = { applications: IisApplication[]; databases: IisDatabase[] };

const globalForIis = globalThis as unknown as { __taskTornadoIis?: DemoStore };

function newId(): string {
  return randomBytes(16).toString("hex");
}

function seed(): DemoStore {
  const now = new Date().toISOString();
  const app = (
    name: string,
    server: string,
    environment: Environment,
    appPool: string,
    binding: string,
    framework: string,
    owner: string,
    status: AppStatus,
  ): IisApplication => ({
    id: newId(),
    name,
    server,
    environment,
    appPool,
    binding,
    framework,
    owner,
    status,
    notes: "",
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  const db = (
    name: string,
    server: string,
    engine: Engine,
    environment: Environment,
    sizeGb: number,
    lastBackupAt: string | null,
    owner: string,
    status: DbStatus,
  ): IisDatabase => ({
    id: newId(),
    name,
    server,
    engine,
    environment,
    sizeGb,
    recoveryModel: engine === "sql_server" ? "FULL" : "wal",
    lastBackupAt,
    owner,
    status,
    notes: "",
    active: true,
    createdAt: now,
    updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
  });

  return {
    applications: [
      app("Portal", "WEB01", "production", "PortalPool", "https://portal.example.com", ".NET 8", "Arun Prakash", "running"),
      app("Intranet", "WEB01", "production", "IntranetPool", "https://intranet.example.com", ".NET Framework 4.8", "Arun Prakash", "running"),
      app("Orders API", "APP02", "staging", "OrdersPool", "https://orders-staging.example.com", ".NET 8", "Priya Nair", "degraded"),
      app("Legacy Reports", "WEB02", "production", "ReportsPool", "http://reports.example.com", ".NET Framework 4.7", "Meera Raghavan", "stopped"),
    ],
    databases: [
      db("PORTAL_DB", "SQL01", "sql_server", "production", 42.5, null, "Arun Prakash", "online"),
      db("ORDERS_DB", "SQL01", "sql_server", "production", 128.75, new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10), "Priya Nair", "online"),
      db("REPORTING", "SQL02", "sql_server", "staging", 76.2, new Date(Date.now() - 11 * 86_400_000).toISOString().slice(0, 10), "Meera Raghavan", "online"),
      db("audit", "PG01", "postgresql", "production", 12.4, new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), "Karthik Raman", "online"),
    ],
  };
}

function demo(): DemoStore {
  if (!globalForIis.__taskTornadoIis) globalForIis.__taskTornadoIis = seed();
  return globalForIis.__taskTornadoIis;
}

/* -------------------------------------------------------------------------- */
/*  Row mapping                                                               */
/* -------------------------------------------------------------------------- */

const APP_COLUMNS =
  "id, name, server, environment, app_pool, binding, framework, owner, status, notes, active, created_at, updated_at";
const DB_COLUMNS =
  "id, name, server, engine, environment, size_gb, recovery_model, last_backup_at, owner, status, notes, active, created_at, updated_at";

type AppRow = {
  id: string;
  name: string;
  server: string | null;
  environment: string;
  app_pool: string | null;
  binding: string | null;
  framework: string | null;
  owner: string | null;
  status: string;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

type DbRow = {
  id: string;
  name: string;
  server: string | null;
  engine: string;
  environment: string;
  size_gb: number | string | null;
  recovery_model: string | null;
  last_backup_at: string | null;
  owner: string | null;
  status: string;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

function mapApp(row: AppRow): IisApplication {
  return {
    id: row.id,
    name: row.name,
    server: row.server ?? "",
    environment: isEnvironment(row.environment) ? row.environment : "production",
    appPool: row.app_pool ?? "",
    binding: row.binding ?? "",
    framework: row.framework ?? "",
    owner: row.owner ?? "",
    status: isAppStatus(row.status) ? row.status : "running",
    notes: row.notes ?? "",
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

function mapDb(row: DbRow): IisDatabase {
  const size = row.size_gb === null ? null : Number(row.size_gb);
  return {
    id: row.id,
    name: row.name,
    server: row.server ?? "",
    engine: isEngine(row.engine) ? row.engine : "other",
    environment: isEnvironment(row.environment) ? row.environment : "production",
    sizeGb: size === null || Number.isNaN(size) ? null : size,
    recoveryModel: row.recovery_model ?? "",
    lastBackupAt: row.last_backup_at ? row.last_backup_at.slice(0, 10) : null,
    owner: row.owner ?? "",
    status: isDbStatus(row.status) ? row.status : "online",
    notes: row.notes ?? "",
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

function clean(input: ApplicationInput | DatabaseInput) {
  return {
    name: input.name.replace(/\s+/g, " ").trim(),
    server: input.server.replace(/\s+/g, " ").trim(),
    owner: input.owner.replace(/\s+/g, " ").trim(),
    notes: input.notes.trim(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Applications                                                              */
/* -------------------------------------------------------------------------- */

export async function listApplications(includeInactive = true): Promise<IisApplication[]> {
  if (!isSupabaseConfigured) {
    return demo()
      .applications.filter((row) => includeInactive || row.active)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("iis_applications").select(APP_COLUMNS).order("name");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as AppRow[]).map(mapApp);
}

export async function createApplication(input: ApplicationInput): Promise<IisApplication> {
  const now = new Date().toISOString();
  const base = clean(input);

  if (!isSupabaseConfigured) {
    const row: IisApplication = {
      id: newId(),
      ...base,
      environment: input.environment,
      appPool: input.appPool.trim(),
      binding: input.binding.trim(),
      framework: input.framework.trim(),
      status: input.status,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    demo().applications.push(row);
    return row;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("iis_applications")
    .insert({
      ...base,
      environment: input.environment,
      app_pool: input.appPool.trim(),
      binding: input.binding.trim(),
      framework: input.framework.trim(),
      status: input.status,
    })
    .select(APP_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "The application could not be saved.");
  return mapApp(data as AppRow);
}

export async function updateApplication(
  id: string,
  input: ApplicationInput,
): Promise<boolean> {
  const base = clean(input);
  const now = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const row = demo().applications.find((item) => item.id === id);
    if (!row) return false;
    Object.assign(row, base, {
      environment: input.environment,
      appPool: input.appPool.trim(),
      binding: input.binding.trim(),
      framework: input.framework.trim(),
      status: input.status,
      updatedAt: now,
    });
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("iis_applications")
    .update({
      ...base,
      environment: input.environment,
      app_pool: input.appPool.trim(),
      binding: input.binding.trim(),
      framework: input.framework.trim(),
      status: input.status,
      updated_at: now,
    })
    .eq("id", id);
  if (error) console.error("[iis] application update failed", error.message);
  return !error;
}

export async function setApplicationActive(id: string, active: boolean): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const row = demo().applications.find((item) => item.id === id);
    if (!row) return false;
    row.active = active;
    row.updatedAt = new Date().toISOString();
    return true;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("iis_applications")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

export async function deleteApplication(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demo();
    const index = store.applications.findIndex((item) => item.id === id);
    if (index < 0) return false;
    store.applications.splice(index, 1);
    return true;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("iis_applications").delete().eq("id", id);
  return !error;
}

/* -------------------------------------------------------------------------- */
/*  Databases                                                                 */
/* -------------------------------------------------------------------------- */

export async function listDatabases(includeInactive = true): Promise<IisDatabase[]> {
  if (!isSupabaseConfigured) {
    return demo()
      .databases.filter((row) => includeInactive || row.active)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("iis_databases").select(DB_COLUMNS).order("name");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as DbRow[]).map(mapDb);
}

export async function createDatabase(input: DatabaseInput): Promise<IisDatabase> {
  const now = new Date().toISOString();
  const base = clean(input);

  if (!isSupabaseConfigured) {
    const row: IisDatabase = {
      id: newId(),
      ...base,
      engine: input.engine,
      environment: input.environment,
      sizeGb: input.sizeGb,
      recoveryModel: input.recoveryModel.trim(),
      lastBackupAt: input.lastBackupAt,
      status: input.status,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    demo().databases.push(row);
    return row;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("iis_databases")
    .insert({
      ...base,
      engine: input.engine,
      environment: input.environment,
      sizeGb: input.sizeGb,
      recovery_model: input.recoveryModel.trim(),
      last_backup_at: input.lastBackupAt,
      status: input.status,
    })
    .select(DB_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "The database could not be saved.");
  return mapDb(data as DbRow);
}

export async function updateDatabase(id: string, input: DatabaseInput): Promise<boolean> {
  const base = clean(input);
  const now = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const row = demo().databases.find((item) => item.id === id);
    if (!row) return false;
    Object.assign(row, base, {
      engine: input.engine,
      environment: input.environment,
      sizeGb: input.sizeGb,
      recoveryModel: input.recoveryModel.trim(),
      lastBackupAt: input.lastBackupAt,
      status: input.status,
      updatedAt: now,
    });
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("iis_databases")
    .update({
      ...base,
      engine: input.engine,
      environment: input.environment,
      sizeGb: input.sizeGb,
      recovery_model: input.recoveryModel.trim(),
      last_backup_at: input.lastBackupAt,
      status: input.status,
      updated_at: now,
    })
    .eq("id", id);
  if (error) console.error("[iis] database update failed", error.message);
  return !error;
}

export async function setDatabaseActive(id: string, active: boolean): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const row = demo().databases.find((item) => item.id === id);
    if (!row) return false;
    row.active = active;
    row.updatedAt = new Date().toISOString();
    return true;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("iis_databases")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

export async function deleteDatabase(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demo();
    const index = store.databases.findIndex((item) => item.id === id);
    if (index < 0) return false;
    store.databases.splice(index, 1);
    return true;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("iis_databases").delete().eq("id", id);
  return !error;
}
