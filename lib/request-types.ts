/**
 * Request types are master data, not code.
 *
 * The approval form used to offer four hard-coded kinds — change, access, patch
 * exception and purchase — and `approvals.category` was pinned to those words by
 * a check constraint. They now live in `public.request_types`, so a workspace can
 * add "Vendor onboarding" or retire "Purchase" without a deploy.
 *
 * The id is a slug and is what an approval stores; the name is what people read.
 * The four seeds keep the ids the register already holds, so no existing approval
 * changes meaning.
 */

export const REQUEST_TYPE_SEED: { id: string; name: string; sortOrder: number }[] = [
  { id: "change", name: "Change", sortOrder: 10 },
  { id: "access", name: "Access", sortOrder: 20 },
  { id: "patch", name: "Patch exception", sortOrder: 30 },
  { id: "purchase", name: "Purchase", sortOrder: 40 },
];

/** The ids the register shipped with — kept for the migration and old rows. */
export const REQUEST_TYPE_LEGACY_IDS = REQUEST_TYPE_SEED.map((type) => type.id);

export const REQUEST_TYPE_NAME_MIN = 2;
export const REQUEST_TYPE_NAME_MAX = 40;

type RequestType = { id: string; name: string };

/** Trims and collapses runs of whitespace — "  Vendor   onboarding " → "Vendor onboarding". */
export function normaliseRequestTypeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** "Vendor onboarding" → "vendor-onboarding". Empty when nothing usable remains. */
export function requestTypeSlug(rawName: string): string {
  return normaliseRequestTypeName(rawName)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * A slug that is not taken yet: the bare slug, or the first free `-2`, `-3`…
 * Renaming a type keeps its id, so a rename never rewrites old approvals.
 */
export function freeRequestTypeId(rawName: string, existing: { id: string }[] = []): string {
  const base = requestTypeSlug(rawName) || "request-type";
  const taken = new Set(existing.map((item) => item.id.toLowerCase()));
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export function requestTypeNameError(
  raw: string,
  existing: RequestType[] = [],
  options: { ignoreId?: string } = {},
): string | null {
  const name = normaliseRequestTypeName(raw);

  if (name.length < REQUEST_TYPE_NAME_MIN) {
    return "Give the request type a name of at least 2 characters.";
  }
  if (name.length > REQUEST_TYPE_NAME_MAX) {
    return `Keep the request type under ${REQUEST_TYPE_NAME_MAX} characters.`;
  }

  const clash = existing.find(
    (item) =>
      item.id !== options.ignoreId && item.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (clash) return `"${clash.name}" is already in the register.`;

  return null;
}

/** What the approval form offers: active types only, in register order. */
export function requestTypeOptions(types: { id: string; name: string; status: string }[]) {
  return types
    .filter((type) => type.status === "active")
    .map((type) => ({ value: type.id, label: type.name }));
}

/**
 * The label for a stored id. A type deleted from the register still has
 * approvals pointing at it, so an unknown id is humanised rather than blank.
 */
export function requestTypeLabel(id: string, types: RequestType[] = []): string {
  const match = types.find((type) => type.id === id);
  if (match) return match.name;
  const humanised = id
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!humanised) return "Request";
  return humanised.charAt(0).toUpperCase() + humanised.slice(1);
}

/** The label map a list needs, built once per request. */
export function requestTypeLabels(types: RequestType[] = []): Record<string, string> {
  return Object.fromEntries(types.map((type) => [type.id, type.name]));
}

/** Is this id one the form would offer right now? */
export function isActiveRequestType(id: string, types: { id: string; status: string }[]): boolean {
  return types.some((type) => type.id === id && type.status === "active");
}
