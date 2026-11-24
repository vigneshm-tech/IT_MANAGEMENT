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


/* -------------------------------------------------------------------------- */
/*  Which list the Clients module opens on                                     */
/* -------------------------------------------------------------------------- */

/**
 * The Clients module holds two lists, because they answer two questions.
 *
 * The *register* is the accounts we manage — contacts, industry, owner. The
 * *captured* list is every client Redmine has ever had on a ticket, read from
 * the Client-eShopaid field. A workspace that raises tickets from day one has
 * the second before the first, so neither list can be hidden behind the other.
 */
export type ClientTab = "register" | "redmine";

export function isClientTab(value: string | undefined): value is ClientTab {
  return value === "register" || value === "redmine";
}

/**
 * What to show when the address says nothing.
 *
 * An empty register with a captured list would present the module as empty when
 * it is not, so the captured list wins in that one case. A single register row,
 * or an explicit `view`, overrides it.
 */
export function resolveClientTab(
  requested: string | undefined,
  registerCount: number,
  capturedCount: number,
): ClientTab {
  if (isClientTab(requested)) return requested;
  return registerCount === 0 && capturedCount > 0 ? "redmine" : "register";
}

/** The tab the module offers, and the address that opens it. */
export const CLIENT_TABS: { id: ClientTab; label: string; href: string }[] = [
  { id: "register", label: "Client register", href: "/modules/clients" },
  { id: "redmine", label: "From Redmine", href: "/modules/clients?view=redmine" },
];

/* -------------------------------------------------------------------------- */
/*  Client choices for other forms                                            */
/* -------------------------------------------------------------------------- */

/** One row of a client picker, shaped for `SearchSelect`. */
export type ClientChoice = {
  /** What the form submits — the client's display name. */
  value: string;
  label: string;
  /** Where the name came from, and what identifies it. */
  hint: string;
};

type ChoiceSource = {
  name: string;
  code?: string;
  industry?: string;
  status?: string;
};

type CapturedSource = {
  name: string;
  codes?: string[];
};

/** Names are compared the way a person reads them, not byte for byte. */
function choiceKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The list a task's *Client name* picker offers.
 *
 * Two sources, because a workspace can have either first: the **register**
 * (accounts we maintain, with their code and industry) and the **captured
 * Redmine list** (clients that only exist on a ticket). The register wins a
 * tie — the same name with an account behind it is the better record.
 *
 * Inactive register rows are dropped: a task should not start against an
 * account we have retired. A captured client that is not in the register is
 * still offered, because for most teams that is the whole client list.
 */
export function clientChoices(
  register: ChoiceSource[],
  captured: CapturedSource[] = [],
): ClientChoice[] {
  const seen = new Set<string>();
  const choices: ClientChoice[] = [];

  for (const client of register) {
    const name = client.name.replace(/\s+/g, " ").trim();
    const key = choiceKey(name);
    if (!key || seen.has(key) || client.status === "inactive") continue;
    seen.add(key);

    const detail = [client.code?.trim(), client.industry?.trim()].filter(Boolean).join(" · ");
    choices.push({
      value: name,
      label: name,
      hint: detail ? `Client register · ${detail}` : "Client register",
    });
  }

  for (const client of captured) {
    const name = client.name.replace(/\s+/g, " ").trim();
    const key = choiceKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const codes = (client.codes ?? []).map((code) => code.trim()).filter(Boolean);
    choices.push({
      value: name,
      label: name,
      hint: codes.length > 0 ? `Redmine · ${codes.join(", ")}` : "Redmine",
    });
  }

  return choices.sort(
    (left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" }) ||
      left.hint.localeCompare(right.hint),
  );
}
