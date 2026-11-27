/**
 * How the IIS application register is narrowed.
 *
 * The register is a list somebody scans, not a list somebody reads: on a host
 * with three hundred sites the question is always "which of these is on WEB01",
 * "which are still on http", "which have directory browsing open". Filtering is
 * a pure function over the rows so it can be tested without a browser, and the
 * page keeps the filters in the URL so a narrowed view can be shared or
 * bookmarked.
 */

import {
  APP_STATUSES,
  ENVIRONMENTS,
  type AppStatus,
  type DirectoryBrowsing,
  type Environment,
  type IisApplication,
} from "./constants";

export type ApplicationFilters = {
  /** Free text: name, server, binding host, certificate, pool or path. */
  q: string;
  server: string;
  environment: Environment | "";
  ssl: "" | "mapped" | "unmapped";
  browsing: "" | DirectoryBrowsing;
  state: "" | AppStatus;
  active: "" | "live" | "retired";
};

export const EMPTY_FILTERS: ApplicationFilters = {
  q: "",
  server: "",
  environment: "",
  ssl: "",
  browsing: "",
  state: "",
  active: "",
};

type RawParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return (value ?? "").trim();
}

export function parseApplicationFilters(params: RawParams): ApplicationFilters {
  const ssl = one(params.ssl);
  const browsing = one(params.browsing);
  const active = one(params.active);
  const environment = one(params.environment);
  const state = one(params.state);

  // Junk in the URL must not read as "filtered to nothing" — it reads as "no filter".
  return {
    q: one(params.q).slice(0, 120),
    server: one(params.server).slice(0, 80),
    environment: (ENVIRONMENTS as readonly string[]).includes(environment)
      ? (environment as Environment)
      : "",
    ssl: ssl === "mapped" || ssl === "unmapped" ? ssl : "",
    browsing: browsing === "enabled" || browsing === "disabled" ? browsing : "",
    state: (APP_STATUSES as readonly string[]).includes(state) ? (state as AppStatus) : "",
    active: active === "live" || active === "retired" ? active : "",
  };
}

export function hasApplicationFilters(filters: ApplicationFilters): boolean {
  return (
    filters.q !== "" ||
    filters.server !== "" ||
    filters.environment !== "" ||
    filters.ssl !== "" ||
    filters.browsing !== "" ||
    filters.state !== "" ||
    filters.active !== ""
  );
}

/** Every word has to show up somewhere on the row — "web01 portal" narrows twice. */
function matchesText(row: IisApplication, query: string): boolean {
  if (!query) return true;
  const haystack = [
    row.name,
    row.server,
    row.bindingHost,
    row.appPool,
    row.appRoot,
    row.sslCertificate,
    row.sslThumbprint,
    row.owner,
    row.notes,
  ]
    .join(" ")
    .toLowerCase();

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function filterApplications(
  rows: IisApplication[],
  filters: ApplicationFilters,
): IisApplication[] {
  const server = filters.server.trim().toLowerCase();

  return rows
    .filter((row) => {
      if (server && row.server.trim().toLowerCase() !== server) return false;
      if (filters.environment && row.environment !== filters.environment) return false;
      if (filters.state && row.status !== filters.state) return false;
      if (filters.browsing && row.directoryBrowsing !== filters.browsing) return false;
      if (filters.ssl === "mapped" && !row.sslMapped) return false;
      if (filters.ssl === "unmapped" && row.sslMapped) return false;
      if (filters.active === "live" && !row.active) return false;
      if (filters.active === "retired" && row.active) return false;
      return matchesText(row, filters.q);
    })
    .sort(
      (a, b) =>
        a.server.toLowerCase().localeCompare(b.server.toLowerCase()) ||
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
}

/** The servers actually present — a dropdown of names nobody has is noise. */
export function serverOptions(rows: IisApplication[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const value = row.server.trim();
    if (value && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
  }
  return [...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** The filters as a query string, for links that keep the current view. */
export function applicationFilterQuery(filters: ApplicationFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.server) params.set("server", filters.server);
  if (filters.environment) params.set("environment", filters.environment);
  if (filters.ssl) params.set("ssl", filters.ssl);
  if (filters.browsing) params.set("browsing", filters.browsing);
  if (filters.state) params.set("state", filters.state);
  if (filters.active) params.set("active", filters.active);
  const query = params.toString();
  return query ? `?${query}` : "";
}
