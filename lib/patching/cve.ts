/**
 * One update, several CVE ids.
 *
 * Action1 reports the security bulletins behind a missing update as a list, and
 * the client flattens that list into a single string ("CVE-2025-1234,
 * CVE-2025-5678"). Printed as one run of text it runs into the next column and
 * pushes the row out of shape, so both the screen and the PDF print one id per
 * line. This is the split both of them share.
 *
 * Ids are upper-cased and de-duplicated, because the same bulletin can be named
 * twice in one update. Anything that is not a CVE id is kept as written rather
 * than dropped — a truncated upstream value is still worth showing.
 */

const CVE_ID = /CVE-\d{4}-\d{4,}/gi;

export function splitCveIds(value: string | null | undefined): string[] {
  const text = (value ?? "").trim();
  if (!text) return [];

  const found = text.match(CVE_ID);
  if (found && found.length > 0) {
    return [...new Set(found.map((id) => id.toUpperCase()))];
  }

  return [
    ...new Set(
      text
        .split(/[,;/]+/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}
