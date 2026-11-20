import type { Action1Endpoint, Action1MissingUpdate } from "../integrations/action1";

/**
 * Pure helpers for the server inventory: no network, no cookies, so they can
 * be unit-tested and reused by both the list and the endpoint detail page.
 */

export const MAX_ENDPOINTS = 200;
export const PAGE_SIZE = 50;

/** Fields Action1 needs before it will answer. */
export function missingAction1Settings(record: {
  secret: string;
  config?: Record<string, string>;
}): string[] {
  const missing: string[] = [];
  if (!record.config?.clientId?.trim()) missing.push("Client ID");
  if (!record.secret?.trim()) missing.push("Client Secret");
  return missing;
}

export type InventorySummary = {
  total: number;
  connected: number;
  disconnected: number;
  offline: number;
  rebootRequired: number;
  missingCritical: number;
  missingOther: number;
  /** Endpoints that have not checked in for a day or more. */
  stale: number;
};

const STALE_MS = 24 * 60 * 60 * 1000;

export function summariseEndpoints(
  endpoints: Action1Endpoint[],
  now: Date = new Date(),
): InventorySummary {
  const summary: InventorySummary = {
    total: endpoints.length,
    connected: 0,
    disconnected: 0,
    offline: 0,
    rebootRequired: 0,
    missingCritical: 0,
    missingOther: 0,
    stale: 0,
  };

  for (const endpoint of endpoints) {
    const status = endpoint.status.toLowerCase();
    if (status === "connected") summary.connected += 1;
    else if (status.includes("disconnect")) summary.disconnected += 1;

    if (!endpoint.lastSeen) summary.offline += 1;
    else if (now.getTime() - new Date(endpoint.lastSeen).getTime() > STALE_MS) summary.stale += 1;

    if (isRebootRequired(endpoint)) summary.rebootRequired += 1;

    summary.missingCritical += endpoint.missingCritical ?? 0;
    summary.missingOther += endpoint.missingOther ?? 0;
  }

  return summary;
}

/** Action1 reports this as true/false, yes/no or a plain string. */
export function isRebootRequired(endpoint: Pick<Action1Endpoint, "rebootRequired">): boolean {
  const value = endpoint.rebootRequired.trim().toLowerCase();
  return value === "true" || value === "yes" || value === "required";
}

/** "3 min ago" / "2 days ago" — the way the Action1 console words check-ins. */
export function describeLastSeen(iso: string, now: Date = new Date()): string {
  if (!iso) return "Never checked in";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never checked in";

  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

/** Patches an endpoint is missing, as "2 critical · 5 other". */
export function describeMissingUpdates(endpoint: Action1Endpoint): string {
  const parts: string[] = [];
  if (endpoint.missingCritical) parts.push(`${endpoint.missingCritical} critical`);
  if (endpoint.missingOther) parts.push(`${endpoint.missingOther} other`);
  if (parts.length === 0) {
    return endpoint.missingCritical === null && endpoint.missingOther === null
      ? "—"
      : "Up to date";
  }
  return parts.join(" · ");
}

/* -------------------------------------------------------------------------- */
/*  Missing updates                                                           */
/* -------------------------------------------------------------------------- */

export type UpdateSeverity = "critical" | "important" | "moderate" | "low" | "other";

export const SEVERITY_LABELS: Record<UpdateSeverity, string> = {
  critical: "Critical",
  important: "Important",
  moderate: "Moderate",
  low: "Low",
  other: "Other",
};

export const SEVERITY_ORDER: UpdateSeverity[] = [
  "critical",
  "important",
  "moderate",
  "low",
  "other",
];

/** Action1 severities fold into the five buckets the console shows. */
export function severityBucket(value: string): UpdateSeverity {
  const text = value.trim().toLowerCase();
  if (text === "critical") return "critical";
  if (text === "important" || text === "high") return "important";
  if (text === "moderate" || text === "medium") return "moderate";
  if (text === "low") return "low";
  return "other";
}

export type UpdateSummary = Record<UpdateSeverity, number> & { total: number };

export function summariseUpdates(updates: Action1MissingUpdate[]): UpdateSummary {
  const summary: UpdateSummary = {
    critical: 0,
    important: 0,
    moderate: 0,
    low: 0,
    other: 0,
    total: updates.length,
  };
  for (const update of updates) summary[severityBucket(update.severity)] += 1;
  return summary;
}

/** Where an update came from — OS patches first, then applications. */
export function updateCategory(update: Action1MissingUpdate): "Windows" | "Application" | "Other" {
  const text = `${update.updateType} ${update.name}`.toLowerCase();
  if (/windows|security update|kb\d|\.net|edge|office/.test(text)) return "Windows";
  if (update.updateType || update.vendor) return "Application";
  return "Other";
}

/**
 * "1.2.3 → 1.2.4" when both ends are known, "→ 1.2.4" when Action1 only says
 * what it would install, and the installed build when it only knows that.
 */
export function describeVersionMove(update: Action1MissingUpdate): string {
  const current = update.currentVersion;
  const available = update.availableVersion;
  if (current && available) return `${current} → ${available}`;
  if (available) return `→ ${available}`;
  if (current) return current;
  return "—";
}

/** One-line patch state for the endpoint header. */
export function describePatchHeadline(endpoint: Action1Endpoint): string {
  if (endpoint.missingCritical === null && endpoint.missingOther === null) {
    return "Patch data unavailable";
  }
  if (!endpoint.missingCritical && !endpoint.missingOther) return "Fully patched";
  return `${describeMissingUpdates(endpoint)} updates missing`;
}

export function rebootLabel(endpoint: Pick<Action1Endpoint, "rebootRequired">): string {
  if (isRebootRequired(endpoint)) return "Required";
  const value = endpoint.rebootRequired.trim().toLowerCase();
  if (value === "false" || value === "no") return "No";
  return endpoint.rebootRequired || "—";
}
