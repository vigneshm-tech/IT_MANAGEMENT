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

export type IisApplication = {
  id: string;
  name: string;
  server: string;
  environment: Environment;
  appPool: string;
  binding: string;
  framework: string;
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
  appPool: string;
  binding: string;
  framework: string;
  owner: string;
  status: AppStatus;
  notes: string;
};

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
