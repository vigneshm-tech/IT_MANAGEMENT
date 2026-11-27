/**
 * The vocabulary of the IIS register: environments, states, engines and the
 * records themselves.
 *
 * Kept apart from the repository because the add/edit forms are client
 * components — they need these lists and types, and nothing here may import the
 * server Supabase client.
 */

export const ENVIRONMENTS = ["production", "staging", "development", "dr"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const APP_STATUSES = ["running", "stopped", "degraded", "maintenance"] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export const DB_STATUSES = ["online", "offline", "maintenance"] as const;
export type DbStatus = (typeof DB_STATUSES)[number];

/** Directory browsing is a switch a person has to be able to read at a glance. */
export const DIRECTORY_BROWSING = ["disabled", "enabled"] as const;
export type DirectoryBrowsing = (typeof DIRECTORY_BROWSING)[number];

export function isDirectoryBrowsing(value: string): value is DirectoryBrowsing {
  return (DIRECTORY_BROWSING as readonly string[]).includes(value);
}

export const MYSQL_STATUSES = ["running", "stopped", "degraded", "maintenance"] as const;
export type MysqlStatus = (typeof MYSQL_STATUSES)[number];

export const ENGINES = ["sql_server", "postgresql", "mysql", "oracle", "other"] as const;
export type Engine = (typeof ENGINES)[number];

export const ENVIRONMENT_LABELS: Record<Environment, string> = {
  production: "Production",
  staging: "Staging",
  development: "Development",
  dr: "Disaster recovery",
};

export const ENGINE_LABELS: Record<Engine, string> = {
  sql_server: "SQL Server",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  oracle: "Oracle",
  other: "Other",
};

/**
 * One IIS application, as the Windows server describes it.
 *
 * The eight fields a person needs to answer "what is this and where does it
 * live": the host, the application, the binding (host, port, TLS), the pool, the
 * directory-browsing switch and the root path on disk. The rest — environment,
 * owner, state, notes — is what a person adds around them.
 */
export type IisApplication = {
  id: string;
  /** Server Host Name — the machine, e.g. WEB01. */
  server: string;
  /** Application Name — the IIS site name. */
  name: string;
  environment: Environment;
  /** Binding Host Name — the host header, e.g. portal.example.com. */
  bindingHost: string;
  /** Binding Port — 80, 443, 8080… */
  bindingPort: number | null;
  /** SSL Mapped — the binding speaks https. */
  sslMapped: boolean;
  /**
   * Which certificate is mapped: its common name as the server reports it
   * (`*.eshopaid.com`), the thumbprint that pins it, and the day it expires.
   * "Mapped: true" says a TLS binding exists; this says what is on it, which is
   * the thing a person renewing it needs.
   */
  sslCertificate: string;
  sslThumbprint: string;
  /** ISO date (`YYYY-MM-DD`) or null. */
  sslExpiresAt: string | null;
  /** Application Pool. */
  appPool: string;
  directoryBrowsing: DirectoryBrowsing;
  /** Application Root Path — the physicalPath on the server. */
  appRoot: string;
  owner: string;
  status: AppStatus;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IisDatabase = {
  id: string;
  name: string;
  server: string;
  engine: Engine;
  environment: Environment;
  sizeGb: number | null;
  recoveryModel: string;
  /** ISO date (`YYYY-MM-DD`) or null. */
  lastBackupAt: string | null;
  owner: string;
  status: DbStatus;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationInput = {
  name: string;
  server: string;
  environment: Environment;
  bindingHost: string;
  bindingPort: number | null;
  sslMapped: boolean;
  sslCertificate: string;
  sslThumbprint: string;
  sslExpiresAt: string | null;
  appPool: string;
  directoryBrowsing: DirectoryBrowsing;
  appRoot: string;
  owner: string;
  status: AppStatus;
  notes: string;
};

/** "portal.example.com:443 · https" — the one-line form of a binding. */
export function describeBinding(row: {
  bindingHost: string;
  bindingPort: number | null;
  sslMapped: boolean;
}): string {
  const host = row.bindingHost.trim() || "(any host)";
  const port = row.bindingPort ?? (row.sslMapped ? 443 : 80);
  return `${host}:${port}${row.sslMapped ? " · https" : ""}`;
}

/** "*.eshopaid.com · to 2027-03-14" — the one-line form of a certificate. */
export function describeCertificate(row: {
  sslCertificate: string;
  sslExpiresAt: string | null;
}): string {
  const name = row.sslCertificate.trim();
  const expiry = row.sslExpiresAt ? `to ${row.sslExpiresAt}` : "";
  if (name && expiry) return `${name} · ${expiry}`;
  return name || expiry;
}

export type DatabaseInput = {
  name: string;
  server: string;
  engine: Engine;
  environment: Environment;
  sizeGb: number | null;
  recoveryModel: string;
  lastBackupAt: string | null;
  owner: string;
  status: DbStatus;
  notes: string;
};

export function isEnvironment(value: string): value is Environment {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}

export function isAppStatus(value: string): value is AppStatus {
  return (APP_STATUSES as readonly string[]).includes(value);
}

export function isDbStatus(value: string): value is DbStatus {
  return (DB_STATUSES as readonly string[]).includes(value);
}

export function isEngine(value: string): value is Engine {
  return (ENGINES as readonly string[]).includes(value);
}

/**
 * A MySQL instance is its own register because it is administered as a server,
 * not as one schema: the host, the port, the version and the charset are
 * properties of the instance, while the `Database` register tracks the schemas
 * that live inside it.
 */
export type IisMysqlInstance = {
  id: string;
  name: string;
  host: string;
  port: number;
  version: string;
  environment: Environment;
  sizeGb: number | null;
  charset: string;
  /** ISO date (`YYYY-MM-DD`) or null. */
  lastBackupAt: string | null;
  owner: string;
  status: MysqlStatus;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MysqlInput = {
  name: string;
  host: string;
  port: number;
  version: string;
  environment: Environment;
  sizeGb: number | null;
  charset: string;
  lastBackupAt: string | null;
  owner: string;
  status: MysqlStatus;
  notes: string;
};

export const DEFAULT_MYSQL_PORT = 3306;

export function isMysqlStatus(value: string): value is MysqlStatus {
  return (MYSQL_STATUSES as readonly string[]).includes(value);
}
