import { EMAIL_PATTERN } from "./forms";
import { countryIsoError, mobileError } from "./countries";

/**
 * Validation for the client register. Pure functions, so the rules can be
 * tested without a browser or a database — the server action and the form use
 * the same limits.
 */

export const CLIENT_NAME_MIN = 2;
export const CLIENT_NAME_MAX = 160;
export const CLIENT_CODE_MAX = 20;
export const CLIENT_INDUSTRY_MAX = 80;
export const CLIENT_CONTACT_NAME_MAX = 80;

export function normaliseClientName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Short codes are upper case and limited to characters that survive a URL. */
export function normaliseClientCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9/._-]+/g, "")
    .slice(0, CLIENT_CODE_MAX);
}

/** "Acme Manufacturing" → "ACME" when no code was typed. */
export function deriveClientCode(name: string): string {
  const word = normaliseClientName(name).split(" ")[0] ?? "";
  return normaliseClientCode(word).slice(0, 6) || "CLIENT";
}

export function clientNameError(raw: string): string | null {
  const name = normaliseClientName(raw);
  if (name.length < CLIENT_NAME_MIN) return "Enter the client name (at least 2 characters).";
  if (name.length > CLIENT_NAME_MAX) return `Keep the client name under ${CLIENT_NAME_MAX} characters.`;
  return null;
}

export function clientCodeError(raw: string): string | null {
  const code = normaliseClientCode(raw);
  if (!code && !raw.trim()) return null; // derived from the name instead
  if (code.length > CLIENT_CODE_MAX) return `Keep the short code under ${CLIENT_CODE_MAX} characters.`;
  if (!/^[A-Z0-9][A-Z0-9/._-]*$/.test(raw.trim().toUpperCase())) {
    return "Use letters, digits, and - _ . / only for the short code.";
  }
  return null;
}

export function industryError(raw: string): string | null {
  if (raw.trim().length > CLIENT_INDUSTRY_MAX) {
    return `Keep the industry under ${CLIENT_INDUSTRY_MAX} characters.`;
  }
  return null;
}

export type ContactInput = {
  name: string;
  email: string;
  mobileCountry: string;
  mobile: string;
};

/** Label used in messages: "primary" / "secondary". */
function contactLabel(which: "primary" | "secondary"): string {
  return which === "primary" ? "Primary contact" : "Secondary contact";
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/**
 * Contacts are optional as a whole (a client may be run through the account
 * owner only), but any part that is filled in must be valid — and a mobile
 * number always needs its country code.
 */
export function contactError(
  which: "primary" | "secondary",
  contact: ContactInput,
): string | null {
  const label = contactLabel(which);
  const name = contact.name.trim();

  if (name.length > CLIENT_CONTACT_NAME_MAX) {
    return `${label} name: keep it under ${CLIENT_CONTACT_NAME_MAX} characters.`;
  }
  if (contact.email.trim() && !EMAIL_PATTERN.test(contact.email.trim())) {
    return `${label}: enter a valid email address.`;
  }

  if (contact.mobile.trim()) {
    const isoError = countryIsoError(contact.mobileCountry);
    if (isoError) return `${label}: ${lowerFirst(isoError)}`;
    const error = mobileError(contact.mobile);
    if (error) return `${label}: ${lowerFirst(error)}`;
  }

  return null;
}

/** Everything the form posts, validated in one place. */
export function clientFormError(input: {
  name: string;
  code: string;
  industry: string;
  primary: ContactInput;
  secondary: ContactInput;
}): string | null {
  return (
    clientNameError(input.name) ??
    clientCodeError(input.code) ??
    industryError(input.industry) ??
    contactError("primary", input.primary) ??
    contactError("secondary", input.secondary)
  );
}

/** Timestamps arrive as ISO strings; the register shows the same wording. */
export function clientTimestamps(createdAt: string, updatedAt: string): {
  created: string;
  updated: string;
  touched: boolean;
} {
  const format = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const touched =
    Boolean(createdAt && updatedAt) &&
    new Date(updatedAt).getTime() > new Date(createdAt).getTime();

  return { created: format(createdAt), updated: format(updatedAt), touched };
}

