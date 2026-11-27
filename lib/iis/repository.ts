import { randomBytes } from "node:crypto";
import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import {
  ENVIRONMENTS,
  isAppStatus,
  isDbStatus,
  isDirectoryBrowsing,
  isEngine,
  isEnvironment,
  isMysqlStatus,
  type AppStatus,
  type ApplicationInput,
  type DirectoryBrowsing,
  type DatabaseInput,
  type DbStatus,
  type Engine,
  type Environment,
  type IisApplication,
  type IisDatabase,
  type IisMysqlInstance,
  type MysqlInput,
  type MysqlStatus,
} from "./constants";
import type { AutomationApplication } from "./automation";

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
  if (input.server.length > 80) return "Keep the server host name under 80 characters.";
  if (input.bindingHost.length > 200) return "Keep the binding host name under 200 characters.";
  if (input.appPool.length > 80) return "Keep the application pool name under 80 characters.";
  if (input.appRoot.length > 260) return "Keep the root path under 260 characters.";
  if (
    input.bindingPort !== null &&
    (!Number.isInteger(input.bindingPort) || input.bindingPort < 1 || input.bindingPort > 65535)
  ) {
    return "Binding port must be a whole number between 1 and 65535.";
  }
  if (!isDirectoryBrowsing(input.directoryBrowsing)) {
    return "Directory browsing is either enabled or disabled.";
  }

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

export function mysqlError(
  input: MysqlInput,
  existing: { id: string; name: string; host: string }[],
  ignoreId?: string,
): string | null {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < NAME_MIN) return "Give the instance a name of at least 2 characters.";
  if (name.length > NAME_MAX) return `Keep the instance name under ${NAME_MAX} characters.`;
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    return "Port must be a whole number between 1 and 65535.";
  }
  if (input.sizeGb !== null && (!Number.isFinite(input.sizeGb) || input.sizeGb < 0)) {
    return "Size must be a number of gigabytes, or blank.";
  }
  if (input.sizeGb !== null && input.sizeGb > 1_000_000) return "That size is not credible.";
  if (input.lastBackupAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.lastBackupAt)) {
    return "Last backup must be a date.";
  }
  if (input.notes.length > 500) return "Keep the notes under 500 characters.";

  const clash = existing.find(
    (row) =>
      row.id !== ignoreId &&
      row.name.trim().toLowerCase() === name.toLowerCase() &&
      (row.host ?? "").trim().toLowerCase() === input.host.trim().toLowerCase(),
  );
  if (clash) return `"${name}" is already registered on ${input.host || "that host"}.`;
  return null;
}

/** MySQL rows carry `host` where the other registers carry `server`. */
function cleanMysql(input: MysqlInput) {
  return {
    name: input.name.replace(/\s+/g, " ").trim(),
    host: input.host.replace(/\s+/g, " ").trim(),
    owner: input.owner.replace(/\s+/g, " ").trim(),
    notes: input.notes.trim(),
  };
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

export function summariseMysql(
  rows: IisMysqlInstance[],
  now = new Date(),
): RegisterSummary {
  const live = rows.filter((row) => row.active);
  return {
    total: rows.length,
    active: live.length,
    attention: live.filter(
      (row) => row.status !== "running" || backupOverdue(row, now),
    ).length,
    byEnvironment: ENVIRONMENTS.map((environment) => ({
      environment,
      count: live.filter((row) => row.environment === environment).length,
    })),
  };
}

/** A backup older than seven days is a fact the page should say out loud. */
export const BACKUP_GRACE_DAYS = 7;

export function backupAgeDays(
  row: { lastBackupAt: string | null },
  now = new Date(),
): number | null {
  if (!row.lastBackupAt) return null;
  const at = new Date(`${row.lastBackupAt}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  return Math.floor((now.getTime() - at.getTime()) / 86_400_000);
}

export function backupOverdue(
  row: { lastBackupAt: string | null; status: string },
  now = new Date(),
): boolean {
  // An instance that is already reported as down is counted once, as down.
  if (row.status === "offline" || row.status === "stopped") return false;
  const days = backupAgeDays(row, now);
  return days === null || days > BACKUP_GRACE_DAYS;
}

export function describeBackup(
  row: { lastBackupAt: string | null },
  now = new Date(),
): string {
  const days = backupAgeDays(row, now);
  if (days === null) return "Never backed up";
  if (days <= 0) return "Backed up today";
  return `Backed up ${days} day${days === 1 ? "" : "s"} ago`;
}

/* -------------------------------------------------------------------------- */
/*  Demo store                                                                */
/* -------------------------------------------------------------------------- */

type DemoStore = {
  applications: IisApplication[];
  databases: IisDatabase[];
  mysql: IisMysqlInstance[];
};

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
    bindingHost: string,
    bindingPort: number,
    sslMapped: boolean,
    sslCertificate: string,
    sslExpiresAt: string | null,
    directoryBrowsing: DirectoryBrowsing,
    appRoot: string,
    owner: string,
    status: AppStatus,
  ): IisApplication => ({
    id: newId(),
    name,
    server,
    environment,
    appPool,
    bindingHost,
    bindingPort,
    sslMapped,
    sslCertificate,
    sslThumbprint: "",
    sslExpiresAt,
    directoryBrowsing,
    appRoot,
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
      app("Portal", "WEB01", "production", "PortalPool", "portal.example.com", 443, true, "*.example.com", "2027-03-14", "disabled", "C:\\inetpub\\portal", "Arun Prakash", "running"),
      app("Intranet", "WEB01", "production", "IntranetPool", "intranet.example.com", 443, true, "*.example.com", "2027-03-14", "enabled", "C:\\inetpub\\intranet", "Arun Prakash", "running"),
      app("Orders API", "APP02", "staging", "OrdersPool", "orders-staging.example.com", 8443, true, "orders-staging.example.com", "2026-12-02", "disabled", "D:\\sites\\orders", "Priya Nair", "degraded"),
      app("Legacy Reports", "WEB02", "production", "ReportsPool", "", 8080, false, "", null, "enabled", "C:\\inetpub\\reports", "Meera Raghavan", "stopped"),
    ],
    databases: [
      db("PORTAL_DB", "SQL01", "sql_server", "production", 42.5, null, "Arun Prakash", "online"),
      db("ORDERS_DB", "SQL01", "sql_server", "production", 128.75, new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10), "Priya Nair", "online"),
      db("REPORTING", "SQL02", "sql_server", "staging", 76.2, new Date(Date.now() - 11 * 86_400_000).toISOString().slice(0, 10), "Meera Raghavan", "online"),
      db("audit", "PG01", "postgresql", "production", 12.4, new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), "Karthik Raman", "online"),
    ],
    mysql: [
      {
        id: newId(),
        name: "orders-mysql-01",
        host: "DB-MY01",
        port: 3306,
        version: "8.0.36",
        environment: "production",
        sizeGb: 96.4,
        charset: "utf8mb4 / utf8mb4_0900_ai_ci",
        lastBackupAt: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
        owner: "Karthik Raman",
        status: "running",
        notes: "",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: newId(),
        name: "billing-mysql-01",
        host: "DB-MY02",
        port: 3307,
        version: "5.7.44",
        environment: "production",
        sizeGb: 18.2,
        charset: "utf8mb4 / utf8mb4_general_ci",
        lastBackupAt: new Date(Date.now() - 9 * 86_400_000).toISOString().slice(0, 10),
        owner: "Priya Nair",
        status: "running",
        notes: "",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: newId(),
        name: "analytics-mysql",
        host: "DB-MY03",
        port: 3306,
        version: "8.4.2",
        environment: "staging",
        sizeGb: 7.8,
        charset: "utf8mb4 / utf8mb4_0900_ai_ci",
        lastBackupAt: null,
        owner: "Meera Raghavan",
        status: "stopped",
        notes: "",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
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
  "id, name, server, environment, app_pool, owner, status, notes, active, created_at, updated_at, binding_host, binding_port, ssl_mapped, ssl_certificate, ssl_thumbprint, ssl_expires_at, directory_browsing, app_root";
const DB_COLUMNS =
  "id, name, server, engine, environment, size_gb, recovery_model, last_backup_at, owner, status, notes, active, created_at, updated_at";

const MYSQL_COLUMNS =
  "id, name, host, port, version, environment, size_gb, charset, last_backup_at, owner, status, notes, active, created_at, updated_at";

type MysqlRow = {
  id: string;
  name: string;
  host: string | null;
  port: number | null;
  version: string | null;
  environment: string;
  size_gb: number | string | null;
  charset: string | null;
  last_backup_at: string | null;
  owner: string | null;
  status: string;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

type AppRow = {
  id: string;
  name: string;
  server: string | null;
  environment: string;
  app_pool: string | null;
  owner: string | null;
  status: string;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
  binding_host: string | null;
  binding_port: number | null;
  ssl_mapped: boolean | null;
  ssl_certificate: string | null;
  ssl_thumbprint: string | null;
  ssl_expires_at: string | null;
  directory_browsing: string | null;
  app_root: string | null;
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
    bindingHost: row.binding_host ?? "",
    bindingPort: row.binding_port ?? null,
    sslMapped: row.ssl_mapped ?? false,
    sslCertificate: row.ssl_certificate ?? "",
    sslThumbprint: row.ssl_thumbprint ?? "",
    sslExpiresAt: row.ssl_expires_at ?? null,
    directoryBrowsing: isDirectoryBrowsing(row.directory_browsing ?? "")
      ? (row.directory_browsing as DirectoryBrowsing)
      : "disabled",
    appRoot: row.app_root ?? "",
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

function mapMysql(row: MysqlRow): IisMysqlInstance {
  const size = row.size_gb === null ? null : Number(row.size_gb);
  return {
    id: row.id,
    name: row.name,
    host: row.host ?? "",
    port: row.port ?? 3306,
    version: row.version ?? "",
    environment: isEnvironment(row.environment) ? row.environment : "production",
    sizeGb: size === null || Number.isNaN(size) ? null : size,
    charset: row.charset ?? "",
    lastBackupAt: row.last_backup_at ? row.last_backup_at.slice(0, 10) : null,
    owner: row.owner ?? "",
    status: isMysqlStatus(row.status) ? row.status : "running",
    notes: row.notes ?? "",
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

/** The columns an IIS application writes, in one place so create/update agree. */
function appColumns(input: ApplicationInput) {
  return {
    environment: input.environment,
    app_pool: input.appPool.trim(),
    binding_host: input.bindingHost.trim(),
    binding_port: input.bindingPort,
    ssl_mapped: input.sslMapped,
    ssl_certificate: input.sslCertificate.trim(),
    ssl_thumbprint: input.sslThumbprint.trim(),
    ssl_expires_at: input.sslExpiresAt,
    directory_browsing: input.directoryBrowsing,
    app_root: input.appRoot.trim(),
    status: input.status,
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
      bindingHost: input.bindingHost.trim(),
      bindingPort: input.bindingPort,
      sslMapped: input.sslMapped,
      sslCertificate: input.sslCertificate.trim(),
      sslThumbprint: input.sslThumbprint.trim(),
      sslExpiresAt: input.sslExpiresAt,
      directoryBrowsing: input.directoryBrowsing,
      appRoot: input.appRoot.trim(),
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
    .insert({ ...base, ...appColumns(input) })
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
      bindingHost: input.bindingHost.trim(),
      bindingPort: input.bindingPort,
      sslMapped: input.sslMapped,
      sslCertificate: input.sslCertificate.trim(),
      sslThumbprint: input.sslThumbprint.trim(),
      sslExpiresAt: input.sslExpiresAt,
      directoryBrowsing: input.directoryBrowsing,
      appRoot: input.appRoot.trim(),
      status: input.status,
      updatedAt: now,
    });
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("iis_applications")
    .update({ ...base, ...appColumns(input), updated_at: now })
    .eq("id", id);
  if (error) console.error("[iis] application update failed", error.message);
  return !error;
}

/** One row as the automation writes it, with the fields a person owns kept. */
export type IngestResult = {
  server: string;
  created: number;
  updated: number;
  /** Rows the server reported that the register already held, word for word. */
  unchanged: number;
  /** The first few changes, for a person reading the response — not all of them. */
  applications: { id: string; name: string; action: "created" | "updated" }[];
};

/** A 400-site run changes 400 rows; the response lists the first few and counts. */
const INGEST_DETAIL_LIMIT = 50;

/** Same eight fields, same certificate, same state — nothing to write. */
function unchanged(
  row: IisApplication,
  app: AutomationApplication,
  environment: Environment,
): boolean {
  return (
    row.environment === environment &&
    row.bindingHost === app.bindingHost &&
    row.bindingPort === app.bindingPort &&
    row.sslMapped === app.sslMapped &&
    row.sslCertificate === app.sslCertificate &&
    row.sslThumbprint === app.sslThumbprint &&
    row.sslExpiresAt === app.sslExpiresAt &&
    row.appPool === app.appPool &&
    row.directoryBrowsing === app.directoryBrowsing &&
    row.appRoot === app.appRoot &&
    row.status === app.status
  );
}

/**
 * Upserts what a Windows server reported.
 *
 * Matching is by name on the same server — the same key the unique index uses —
 * so a nightly collector is idempotent: the second run updates what the first
 * created. Only the eight collected fields are written; owner, notes and the
 * chosen environment stay as the person left them, because a script has no
 * opinion about who answers for an application.
 *
 * A row that exists but was retired comes back to life: the server just proved
 * the application is still there.
 */
export async function ingestApplications(
  server: string,
  environment: Environment,
  applications: AutomationApplication[],
): Promise<IngestResult> {
  const host = server.replace(/\s+/g, " ").trim();
  const now = new Date().toISOString();
  const existing = await listApplications(true);
  const result: IngestResult = {
    server: host,
    created: 0,
    updated: 0,
    unchanged: 0,
    applications: [],
  };

  for (const app of applications) {
    const match = existing.find(
      (row) =>
        row.server.trim().toLowerCase() === host.toLowerCase() &&
        row.name.trim().toLowerCase() === app.name.toLowerCase(),
    );

    const input: ApplicationInput = {
      name: app.name,
      server: host,
      environment,
      bindingHost: app.bindingHost,
      bindingPort: app.bindingPort,
      sslMapped: app.sslMapped,
      sslCertificate: app.sslCertificate,
      sslThumbprint: app.sslThumbprint,
      sslExpiresAt: app.sslExpiresAt,
      appPool: app.appPool,
      directoryBrowsing: app.directoryBrowsing,
      appRoot: app.appRoot,
      owner: match?.owner ?? "",
      status: app.status,
      notes: match?.notes ?? "",
    };

    if (match) {
      // A nightly run over four hundred sites must not rewrite four hundred rows
      // to say nothing changed — and it must still bring a retired row back.
      if (match.active && unchanged(match, app, environment)) {
        result.unchanged += 1;
        continue;
      }
      const written = await updateApplication(match.id, input);
      if (!written) throw new Error(`"${app.name}" could not be updated.`);
      if (!match.active) await setApplicationActive(match.id, true);
      result.updated += 1;
      if (result.applications.length < INGEST_DETAIL_LIMIT) {
        result.applications.push({ id: match.id, name: match.name, action: "updated" });
      }
      continue;
    }

    const row = await createApplication(input);
    result.created += 1;
    if (result.applications.length < INGEST_DETAIL_LIMIT) {
      result.applications.push({ id: row.id, name: row.name, action: "created" });
    }
  }

  return result;
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

/* -------------------------------------------------------------------------- */
/*  MySQL instances                                                           */
/* -------------------------------------------------------------------------- */

export async function listMysqlInstances(
  includeInactive = true,
): Promise<IisMysqlInstance[]> {
  if (!isSupabaseConfigured) {
    return demo()
      .mysql.filter((row) => includeInactive || row.active)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("iis_mysql_instances").select(MYSQL_COLUMNS).order("name");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as MysqlRow[]).map(mapMysql);
}

export async function createMysqlInstance(input: MysqlInput): Promise<IisMysqlInstance> {
  const now = new Date().toISOString();
  const base = cleanMysql(input);

  if (!isSupabaseConfigured) {
    const row: IisMysqlInstance = {
      id: newId(),
      ...base,
      port: input.port,
      version: input.version.trim(),
      environment: input.environment,
      sizeGb: input.sizeGb,
      charset: input.charset.trim(),
      lastBackupAt: input.lastBackupAt,
      status: input.status,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    demo().mysql.push(row);
    return row;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("iis_mysql_instances")
    .insert({
      ...base,
      port: input.port,
      version: input.version.trim(),
      environment: input.environment,
      size_gb: input.sizeGb,
      charset: input.charset.trim(),
      last_backup_at: input.lastBackupAt,
      status: input.status,
    })
    .select(MYSQL_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "The instance could not be saved.");
  return mapMysql(data as MysqlRow);
}

export async function updateMysqlInstance(id: string, input: MysqlInput): Promise<boolean> {
  const base = cleanMysql(input);
  const now = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const row = demo().mysql.find((item) => item.id === id);
    if (!row) return false;
    Object.assign(row, base, {
      port: input.port,
      version: input.version.trim(),
      environment: input.environment,
      sizeGb: input.sizeGb,
      charset: input.charset.trim(),
      lastBackupAt: input.lastBackupAt,
      status: input.status,
      updatedAt: now,
    });
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("iis_mysql_instances")
    .update({
      ...base,
      port: input.port,
      version: input.version.trim(),
      environment: input.environment,
      size_gb: input.sizeGb,
      charset: input.charset.trim(),
      last_backup_at: input.lastBackupAt,
      status: input.status,
      updated_at: now,
    })
    .eq("id", id);
  if (error) console.error("[iis] mysql update failed", error.message);
  return !error;
}

export async function setMysqlActive(id: string, active: boolean): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const row = demo().mysql.find((item) => item.id === id);
    if (!row) return false;
    row.active = active;
    row.updatedAt = new Date().toISOString();
    return true;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("iis_mysql_instances")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

export async function deleteMysqlInstance(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demo();
    const index = store.mysql.findIndex((item) => item.id === id);
    if (index < 0) return false;
    store.mysql.splice(index, 1);
    return true;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("iis_mysql_instances").delete().eq("id", id);
  return !error;
}
