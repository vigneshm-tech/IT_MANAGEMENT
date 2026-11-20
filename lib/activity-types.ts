import { MODULE_BY_ID, type ModuleId } from "./modules";

/**
 * Activity types are master data, not code: they live in `public.activity_types`
 * and the task form only ever offers what Masters holds for its module.
 *
 * The seed below mirrors the types that used to be hard-coded, so the register
 * starts populated and existing boards keep their vocabulary.
 */

export const ACTIVITY_TYPE_SEED = [
  "Patching",
  "Incident",
  "Service request",
  "Change request",
  "Preventive maintenance",
  "Onboarding",
  "Audit",
  "Other",
] as const;

/**
 * Modules that own activities. A type is filed under exactly one of these, and
 * that is what decides where it is offered (the task form asks for "tasks").
 */
export const ACTIVITY_MODULES = [
  "tasks",
  "tickets",
  "servers",
  "patching",
  "clients",
  "renewals",
  "approvals",
] as const;

export type ActivityModule = (typeof ACTIVITY_MODULES)[number];

export const ACTIVITY_MODULE_OPTIONS: { value: ActivityModule; label: string }[] =
  ACTIVITY_MODULES.map((id) => ({ value: id, label: MODULE_BY_ID[id as ModuleId].title }));

/** The module the task form draws its Activity type options from. */
export const TASK_ACTIVITY_MODULE: ActivityModule = "tasks";

export function isActivityModule(value: string): value is ActivityModule {
  return (ACTIVITY_MODULES as readonly string[]).includes(value);
}

export function activityModuleLabel(value: string): string {
  return isActivityModule(value) ? MODULE_BY_ID[value as ModuleId].title : value;
}

export const ACTIVITY_TYPE_NAME_MIN = 2;
export const ACTIVITY_TYPE_NAME_MAX = 60;

/** Trims and collapses runs of whitespace — "  Patching   window " → "Patching window". */
export function normaliseActivityTypeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Validates a candidate name against the register. Returns the message to show,
 * or `null` when the name is usable. Names only have to be unique inside their
 * own module, so "Service request" can exist for tasks and for tickets.
 */
export function activityTypeNameError(
  raw: string,
  existing: { id: string; name: string; module?: string }[] = [],
  options: { module?: string; ignoreId?: string } = {},
): string | null {
  const name = normaliseActivityTypeName(raw);

  if (name.length < ACTIVITY_TYPE_NAME_MIN) {
    return "Give the activity type a name of at least 2 characters.";
  }
  if (name.length > ACTIVITY_TYPE_NAME_MAX) {
    return `Keep the activity type under ${ACTIVITY_TYPE_NAME_MAX} characters.`;
  }

  const clash = existing.find(
    (item) =>
      item.id !== options.ignoreId &&
      item.name.toLowerCase() === name.toLowerCase() &&
      (options.module === undefined || item.module === options.module),
  );

  return clash
    ? `"${clash.name}" already exists${
        options.module ? ` for ${activityModuleLabel(options.module)}` : ""
      }.`
    : null;
}

/** Required-module validation for the add form. */
export function activityTypeModuleError(raw: string): string | null {
  if (!raw) return "Choose the module this activity type belongs to.";
  return isActivityModule(raw) ? null : "Choose a valid module.";
}
