/**
 * Industries are master data: the client form offers this register instead of a
 * free-text field, so the same industry is spelled the same way everywhere.
 *
 * The seed mirrors the industries the client register already used, so no
 * existing record loses its wording.
 */

export const INDUSTRY_SEED = [
  "Manufacturing",
  "Logistics",
  "Healthcare",
  "Retail",
  "Banking",
  "Insurance",
  "Education",
  "Hospitality",
  "Automotive",
  "Construction",
  "Energy",
  "Pharmaceuticals",
  "Telecommunications",
  "Information technology",
  "Government",
  "Other",
] as const;

export const INDUSTRY_NAME_MIN = 2;
export const INDUSTRY_NAME_MAX = 60;

/** Trims and collapses runs of whitespace — "  Health   care " → "Health care". */
export function normaliseIndustryName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function industryNameError(
  raw: string,
  existing: { id: string; name: string }[] = [],
  options: { ignoreId?: string } = {},
): string | null {
  const name = normaliseIndustryName(raw);

  if (name.length < INDUSTRY_NAME_MIN) return "Give the industry a name of at least 2 characters.";
  if (name.length > INDUSTRY_NAME_MAX) {
    return `Keep the industry under ${INDUSTRY_NAME_MAX} characters.`;
  }

  const clash = existing.find(
    (item) => item.id !== options.ignoreId && item.name.toLowerCase() === name.toLowerCase(),
  );

  return clash ? `"${clash.name}" is already in the industry register.` : null;
}
