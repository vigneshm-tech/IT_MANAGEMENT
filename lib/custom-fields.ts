import { ACTIVITY_MODULE_OPTIONS, activityModuleLabel, isActivityModule } from "./activity-types";

/**
 * Custom fields are master data too: each one is defined once here and filed
 * under exactly one module, so the register says where it belongs before any
 * module form starts offering it.
 */

export const CUSTOM_FIELD_NAME_MIN = 2;
export const CUSTOM_FIELD_NAME_MAX = 60;

/** Same module list the activity types use — one vocabulary for the workspace. */
export const CUSTOM_FIELD_MODULE_OPTIONS = ACTIVITY_MODULE_OPTIONS;

export function normaliseCustomFieldName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function customFieldNameError(
  raw: string,
  existing: { id: string; name: string; module?: string }[] = [],
  options: { module?: string; ignoreId?: string } = {},
): string | null {
  const name = normaliseCustomFieldName(raw);

  if (name.length < CUSTOM_FIELD_NAME_MIN) {
    return "Give the custom field a name of at least 2 characters.";
  }
  if (name.length > CUSTOM_FIELD_NAME_MAX) {
    return `Keep the custom field under ${CUSTOM_FIELD_NAME_MAX} characters.`;
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

/** A field must belong to a module — that is what "modules selection" means. */
export function customFieldModuleError(raw: string): string | null {
  if (!raw) return "Choose the module this custom field belongs to.";
  return isActivityModule(raw) ? null : "Choose a valid module.";
}
