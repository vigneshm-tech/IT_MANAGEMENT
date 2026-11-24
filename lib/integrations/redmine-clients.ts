/**
 * Reading the client list out of Redmine.
 *
 * Redmine has no endpoint that lists the values of a custom field; the values
 * only exist on tickets. The reliable way to learn them is therefore to walk the
 * project's issues and collect the distinct "Client-eShopaid" values — which is
 * what this module does, one page of a hundred tickets at a time.
 *
 * The scan is a *capture*, not a live lookup: it returns what it found and the
 * caller stores it (`lib/tickets/redmine-clients.ts`), because walking ten
 * thousand tickets is not something a page load may do.
 *
 * Everything except `scanClients` is pure, so the parsing rules can be tested
 * against payloads Redmine has actually returned.
 */

import { fetchJson, type RedmineConfig } from "./redmine";

/** Custom field 112 — "Client-eShopaid" on portal.wondersoft.in. */
export const CLIENT_FIELD_ID = 112;
/** The portal project the client field belongs to. */
export const CLIENT_PROJECT_ID = 674;
/** Redmine caps every collection at 100 rows per page. */
export const SCAN_PAGE_SIZE = 100;
/** A scan stops here rather than reading a decade of history. */
export const SCAN_MAX_TICKETS = 10_000;

/** A week-old client list is still true; older is worth refreshing. */
export const CLIENT_SYNC_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** "2 hours ago" — the one thing a reader needs to judge a captured list. */
export function describeSyncAge(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";

  const elapsed = Math.max(0, now - then);
  if (elapsed < 60_000) return "just now";
  const minutes = Math.round(elapsed / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function isSyncStale(sync: { syncedAt: string } | null, now = Date.now()): boolean {
  if (!sync) return true;
  const then = new Date(sync.syncedAt).getTime();
  if (Number.isNaN(then)) return true;
  return now - then > CLIENT_SYNC_MAX_AGE_MS;
}

/** One distinct value of the client field. */
export type RedmineClientValue = {
  /** The exact string Redmine stores — send it back unchanged. */
  value: string;
  /** The readable part, before the first pipe. */
  name: string;
  /** The short codes after the first pipe, in the order the ticket wrote them. */
  codes: string[];
};

export type RedmineClientFound = RedmineClientValue & {
  /** How many scanned tickets carried this value. */
  tickets: number;
  /** The newest ticket that carried it, for a link back into Redmine. */
  issueId: number | null;
};

/**
 * `"Skin | SK | SKIN"` → name `Skin`, codes `["SK", "SKIN"]`.
 *
 * The value itself is kept byte for byte: it is a key, not a label, and Redmine
 * matches it exactly. A blank value is not a client, so it is dropped.
 */
export function parseClientValue(raw: string): RedmineClientValue | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;

  const segments = raw.split("|").map((segment) => segment.trim());
  const codes: string[] = [];
  const seen = new Set<string>();

  for (const segment of segments.slice(1)) {
    if (!segment) continue;
    const key = segment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    codes.push(segment);
  }

  // "|" and " | " carry nothing a person could pick from a list.
  const name = segments[0] || codes[0] || raw.trim();
  if (!/[a-z0-9]/i.test(name)) return null;

  return { value: raw, name, codes };
}

/**
 * The client field's value(s) on one issue.
 *
 * Redmine answers a single-value custom field with a string and a multi-value
 * one with an array, so both are read; anything else (a number, an object) is
 * not a client name and is ignored.
 */
export function customFieldValues(issue: unknown, fieldId: number = CLIENT_FIELD_ID): string[] {
  const fields = (issue as { custom_fields?: unknown } | null)?.custom_fields;
  if (!Array.isArray(fields)) return [];

  const values: string[] = [];
  for (const field of fields) {
    const entry = (field ?? {}) as { id?: unknown; value?: unknown };
    if (Number(entry.id) !== fieldId) continue;

    if (typeof entry.value === "string") {
      values.push(entry.value);
    } else if (Array.isArray(entry.value)) {
      for (const item of entry.value) {
        if (typeof item === "string") values.push(item);
      }
    }
  }
  return values;
}

/**
 * Adds one page of issues to the running tally and answers how many tickets it
 * read. The scan walks newest first, so the first ticket that mentions a value
 * is the newest one and its id is the one worth linking to.
 */
export function accumulateClients(
  seen: Map<string, RedmineClientFound>,
  issues: unknown[],
  fieldId: number = CLIENT_FIELD_ID,
): number {
  let read = 0;

  for (const issue of issues) {
    read += 1;
    const rawId = Number((issue as { id?: unknown } | null)?.id);
    const issueId = Number.isFinite(rawId) && rawId > 0 ? rawId : null;

    for (const raw of customFieldValues(issue, fieldId)) {
      const parsed = parseClientValue(raw);
      if (!parsed) continue;

      const existing = seen.get(parsed.value);
      if (!existing) {
        seen.set(parsed.value, { ...parsed, tickets: 1, issueId });
        continue;
      }

      existing.tickets += 1;
      // A later ticket may spell a code differently; keep the extra spelling
      // rather than pretending the two are unrelated.
      for (const code of parsed.codes) {
        if (!existing.codes.some((known) => known.toLowerCase() === code.toLowerCase())) {
          existing.codes.push(code);
        }
      }
    }
  }

  return read;
}

/** Alphabetical by client name, then by the raw value so the order is stable. */
export function sortClients<T extends { name: string; value: string }>(clients: T[]): T[] {
  return [...clients].sort(
    (left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
      left.value.localeCompare(right.value),
  );
}

/** `GET /issues.json` for one page of the scan. */
export function buildClientScanPath(
  projectId: number = CLIENT_PROJECT_ID,
  offset = 0,
  limit: number = SCAN_PAGE_SIZE,
): string {
  const params = new URLSearchParams();
  params.set("project_id", String(Math.trunc(projectId)));
  // Closed tickets carry clients too — the oldest account may only have those.
  params.set("status_id", "*");
  params.set("sort", "updated_on:desc");
  params.set("limit", String(Math.min(SCAN_PAGE_SIZE, Math.max(1, Math.trunc(limit)))));
  if (offset > 0) params.set("offset", String(Math.trunc(offset)));
  return `/issues.json?${params.toString()}`;
}

export type ClientScan = {
  clients: RedmineClientFound[];
  /** Tickets read, which is `total` unless the cap stopped the scan early. */
  scanned: number;
  /** What Redmine said the project holds, when it said anything. */
  total: number | null;
  /** True when history beyond the cap was left unread. */
  truncated: boolean;
};

/**
 * Walks the project's tickets and returns every distinct client value.
 *
 * Throws `RedmineError` on the first failed page: half a list is worse than a
 * failed sync, because the caller would delete the clients it did not see.
 */
export async function scanClients(
  config: RedmineConfig,
  options: {
    projectId?: number;
    fieldId?: number;
    maxTickets?: number;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<ClientScan> {
  const projectId = options.projectId ?? CLIENT_PROJECT_ID;
  const fieldId = options.fieldId ?? CLIENT_FIELD_ID;
  const cap = Math.max(
    SCAN_PAGE_SIZE,
    Math.min(options.maxTickets ?? SCAN_MAX_TICKETS, SCAN_MAX_TICKETS),
  );

  const seen = new Map<string, RedmineClientFound>();
  let scanned = 0;
  let total: number | null = null;
  let offset = 0;
  let lastPageFull = false;

  for (;;) {
    if (scanned >= cap) break;

    const limit = Math.min(SCAN_PAGE_SIZE, cap - scanned);
    const payload = await fetchJson<{ issues?: unknown; total_count?: unknown }>(
      config,
      buildClientScanPath(projectId, offset, limit),
      { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs },
    );

    const issues = Array.isArray(payload.issues) ? payload.issues : [];
    const reported = Number(payload.total_count);
    if (Number.isFinite(reported) && reported >= 0) total = reported;

    scanned += accumulateClients(seen, issues, fieldId);
    offset += issues.length;
    lastPageFull = issues.length >= limit;

    if (!lastPageFull) break;
    if (total !== null && scanned >= total) break;
  }

  return {
    clients: sortClients([...seen.values()]),
    scanned,
    total,
    // Either Redmine reported more than was read, or the last page was full and
    // the server did not say how many tickets there are.
    truncated: total !== null ? scanned < total : lastPageFull,
  };
}

/* -------------------------------------------------------------------------- */
/*  Matching a captured value to a record in our own client register           */
/* -------------------------------------------------------------------------- */

export type RegisterCandidate = { id: string; name: string; code: string };

/** Case, spaces and punctuation are not what tells two clients apart. */
function matchKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Which client record, if any, this Redmine value is.
 *
 * Only an exact match on the short code or on the whole name counts — a fuzzy
 * match would quietly point a Redmine ticket at the wrong account, which is
 * worse than pointing at none. Everything else is left for a person to decide.
 */
export function matchRegisterClient(
  client: Pick<RedmineClientValue, "name" | "codes">,
  candidates: RegisterCandidate[],
): RegisterCandidate | null {
  const keys = new Set(
    [matchKey(client.name), ...client.codes.map(matchKey)].filter((key) => key.length > 0),
  );
  if (keys.size === 0) return null;

  for (const candidate of candidates) {
    const code = matchKey(candidate.code);
    const name = matchKey(candidate.name);
    if ((code && keys.has(code)) || (name && keys.has(name))) return candidate;
  }

  return null;
}
