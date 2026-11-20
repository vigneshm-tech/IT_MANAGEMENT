/**
 * Activity types are master data, not code: they live in `public.activity_types`
 * and the task form only ever offers what Masters holds.
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

export const ACTIVITY_TYPE_NAME_MIN = 2;
export const ACTIVITY_TYPE_NAME_MAX = 60;

/** Trims and collapses runs of whitespace — "  Patching   window " → "Patching window". */
export function normaliseActivityTypeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Validates a candidate name against the register. Returns the message to show,
 * or `null` when the name is usable.
 */
export function activityTypeNameError(
  raw: string,
  existing: { id: string; name: string }[] = [],
  ignoreId?: string,
): string | null {
  const name = normaliseActivityTypeName(raw);

  if (name.length < ACTIVITY_TYPE_NAME_MIN) {
    return "Give the activity type a name of at least 2 characters.";
  }
  if (name.length > ACTIVITY_TYPE_NAME_MAX) {
    return `Keep the activity type under ${ACTIVITY_TYPE_NAME_MAX} characters.`;
  }

  const clash = existing.find(
    (item) => item.id !== ignoreId && item.name.toLowerCase() === name.toLowerCase(),
  );

  return clash ? `"${clash.name}" already exists in the register.` : null;
}
