"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  applicationError,
  createApplication,
  createDatabase,
  databaseError,
  deleteApplication,
  deleteDatabase,
  isAppStatus,
  isDbStatus,
  isEngine,
  isEnvironment,
  listApplications,
  listDatabases,
  setApplicationActive,
  setDatabaseActive,
  updateApplication,
  updateDatabase,
  type ApplicationInput,
  type DatabaseInput,
} from "@/lib/iis/repository";

function revalidate() {
  revalidatePath("/modules/iis");
  revalidatePath("/modules/iis/applications");
  revalidatePath("/modules/iis/databases");
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

  const input: ApplicationInput = {
    name: text(formData, "name"),
    server: text(formData, "server"),
    environment: isEnvironment(environment) ? environment : "production",
    appPool: text(formData, "appPool"),
    binding: text(formData, "binding"),
    framework: text(formData, "framework"),
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
