"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  applicationError,
  createApplication,
  createDatabase,
  createMysqlInstance,
  databaseError,
  deleteApplication,
  deleteDatabase,
  deleteMysqlInstance,
  isMysqlStatus,
  isAppStatus,
  isDbStatus,
  isDirectoryBrowsing,
  isEngine,
  isEnvironment,
  listApplications,
  listDatabases,
  listMysqlInstances,
  mysqlError,
  setApplicationActive,
  setDatabaseActive,
  setMysqlActive,
  updateApplication,
  updateDatabase,
  updateMysqlInstance,
  type ApplicationInput,
  type DatabaseInput,
  type MysqlInput,
} from "@/lib/iis/repository";

function revalidate() {
  revalidatePath("/modules/iis");
  revalidatePath("/modules/iis/applications");
  revalidatePath("/modules/iis/databases");
  revalidatePath("/modules/iis/mysql");
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function number(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

async function editor(): Promise<{ userId: string; allowed: boolean }> {
  const user = await requireUser();
  return { userId: user.id, allowed: can(user.role, "iis", "edit") };
}

export async function saveApplicationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { allowed } = await editor();
  if (!allowed) return { error: "Your role cannot change the IIS register." };

  const id = text(formData, "id");
  const environment = text(formData, "environment");
  const status = text(formData, "status");
  const browsing = text(formData, "directoryBrowsing");
  const port = Math.trunc(Number(text(formData, "bindingPort")));

  const input: ApplicationInput = {
    name: text(formData, "name"),
    server: text(formData, "server"),
    environment: isEnvironment(environment) ? environment : "production",
    bindingHost: text(formData, "bindingHost"),
    bindingPort: Number.isFinite(port) && port > 0 ? port : null,
    sslMapped: formData.get("sslMapped") !== null,
    appPool: text(formData, "appPool"),
    directoryBrowsing: isDirectoryBrowsing(browsing) ? browsing : "disabled",
    appRoot: text(formData, "appRoot"),
    owner: text(formData, "owner"),
    status: isAppStatus(status) ? status : "running",
    notes: text(formData, "notes"),
  };

  const existing = await listApplications(true);
  const problem = applicationError(input, existing, id || undefined);
  if (problem) return { error: problem };

  try {
    if (id) await updateApplication(id, input);
    else await createApplication(input);
  } catch (cause) {
    console.error("[iis] application save failed", cause);
    return { error: cause instanceof Error ? cause.message : "The application could not be saved." };
  }

  revalidate();
  return {
    ok: true,
    message: id
      ? `"${input.name}" updated.`
      : `"${input.name}" added to the register.`,
  };
}

export async function saveDatabaseAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { allowed } = await editor();
  if (!allowed) return { error: "Your role cannot change the database register." };

  const id = text(formData, "id");
  const engine = text(formData, "engine");
  const environment = text(formData, "environment");
  const status = text(formData, "status");
  const backup = text(formData, "lastBackupAt");

  const input: DatabaseInput = {
    name: text(formData, "name"),
    server: text(formData, "server"),
    engine: isEngine(engine) ? engine : "other",
    environment: isEnvironment(environment) ? environment : "production",
    sizeGb: number(formData, "sizeGb"),
    recoveryModel: text(formData, "recoveryModel"),
    lastBackupAt: backup || null,
    owner: text(formData, "owner"),
    status: isDbStatus(status) ? status : "online",
    notes: text(formData, "notes"),
  };

  const existing = await listDatabases(true);
  const problem = databaseError(input, existing, id || undefined);
  if (problem) return { error: problem };

  try {
    if (id) await updateDatabase(id, input);
    else await createDatabase(input);
  } catch (cause) {
    console.error("[iis] database save failed", cause);
    return { error: cause instanceof Error ? cause.message : "The database could not be saved." };
  }

  revalidate();
  return {
    ok: true,
    message: id ? `"${input.name}" updated.` : `"${input.name}" added to the register.`,
  };
}

/** Activate, deactivate or delete one row — the three things a register row does. */
export async function applicationRowAction(formData: FormData): Promise<void> {
  const { allowed } = await editor();
  if (!allowed) return;

  const id = text(formData, "id");
  const intent = text(formData, "intent");
  if (!id) return;

  if (intent === "delete") await deleteApplication(id);
  else await setApplicationActive(id, intent === "activate");

  revalidate();
}

export async function databaseRowAction(formData: FormData): Promise<void> {
  const { allowed } = await editor();
  if (!allowed) return;

  const id = text(formData, "id");
  const intent = text(formData, "intent");
  if (!id) return;

  if (intent === "delete") await deleteDatabase(id);
  else await setDatabaseActive(id, intent === "activate");

  revalidate();
}

export async function saveMysqlAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { allowed } = await editor();
  if (!allowed) return { error: "Your role cannot change the MySQL register." };

  const id = text(formData, "id");
  const environment = text(formData, "environment");
  const status = text(formData, "status");
  const backup = text(formData, "lastBackupAt");
  const port = Number(text(formData, "port") || "3306");

  const input: MysqlInput = {
    name: text(formData, "name"),
    host: text(formData, "host"),
    port: Number.isFinite(port) ? Math.trunc(port) : 0,
    version: text(formData, "version"),
    environment: isEnvironment(environment) ? environment : "production",
    sizeGb: number(formData, "sizeGb"),
    charset: text(formData, "charset"),
    lastBackupAt: backup || null,
    owner: text(formData, "owner"),
    status: isMysqlStatus(status) ? status : "running",
    notes: text(formData, "notes"),
  };

  const existing = await listMysqlInstances(true);
  const problem = mysqlError(input, existing, id || undefined);
  if (problem) return { error: problem };

  try {
    if (id) await updateMysqlInstance(id, input);
    else await createMysqlInstance(input);
  } catch (cause) {
    console.error("[iis] mysql save failed", cause);
    return { error: cause instanceof Error ? cause.message : "The instance could not be saved." };
  }

  revalidate();
  return {
    ok: true,
    message: id ? `"${input.name}" updated.` : `"${input.name}" added to the register.`,
  };
}

export async function mysqlRowAction(formData: FormData): Promise<void> {
  const { allowed } = await editor();
  if (!allowed) return;

  const id = text(formData, "id");
  const intent = text(formData, "intent");
  if (!id) return;

  if (intent === "delete") await deleteMysqlInstance(id);
  else await setMysqlActive(id, intent === "activate");

  revalidate();
}
