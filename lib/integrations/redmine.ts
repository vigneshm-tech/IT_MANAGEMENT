/**
 * Redmine REST API client — https://www.redmine.org/projects/redmine/wiki/rest_api
 *
 * Authentication follows the documented API-key options; this client sends the
 * key in the `X-Redmine-API-Key` header, which never lands in a URL or a log.
 * JSON is requested explicitly and `Content-Type: application/json` is set on
 * writes, as the reference requires.
 *
 * Pure helpers (path building, mapping, URL building) are exported separately
 * from the network calls so they can be unit tested without a Redmine server.
 */

export type RedmineConfig = {
  /** Instance root, e.g. https://redmine.example.com (trailing slash optional). */
  baseUrl: string;
  apiKey: string;
};

export type RedmineRef = { id: number; name: string };

export type RedmineIssue = {
  id: number;
  subject: string;
  description: string;
  project: RedmineRef;
  tracker: RedmineRef;
  status: RedmineRef;
  priority: RedmineRef;
  author: RedmineRef;
  assignee: RedmineRef | null;
  createdOn: string;
  updatedOn: string;
  dueDate: string | null;
  doneRatio: number;
  /** Absolute link into the Redmine UI. */
  url: string;
};

export type RedmineIssuePage = {
  issues: RedmineIssue[];
  totalCount: number;
  offset: number;
  limit: number;
};

export type IssueFilters = {
  /** `me` resolves to the key's owner — no local user mapping needed. */
  assignedToMe?: boolean;
  projectId?: string | number;
  statusId?: "open" | "closed" | "*" | number;
  search?: string;
  offset?: number;
  limit?: number;
  sort?: string;
};

export type NewIssueInput = {
  projectId: string | number;
  subject: string;
  description?: string;
  priorityId?: number;
  trackerId?: number;
  assignedToId?: string | number;
};

export class RedmineError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "RedmineError";
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_LIMIT = 100;

export function normaliseBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed.replace(/\/wiki.*$/i, "");
}

export function redmineIssueUrl(baseUrl: string, issueId: number): string {
  return `${normaliseBaseUrl(baseUrl)}/issues/${issueId}`;
}

/** Redmine caps collections at 100 per page; anything else is clamped. */
export function clampLimit(value: number | undefined, fallback = 50): number {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value as number)));
}

/** Builds `/issues.json?…` for the documented query parameters. */
export function buildIssuesPath(filters: IssueFilters = {}): string {
  const params = new URLSearchParams();
  params.set("limit", String(clampLimit(filters.limit)));
  if (filters.offset && filters.offset > 0) params.set("offset", String(Math.trunc(filters.offset)));
  if (filters.assignedToMe) params.set("assigned_to_id", "me");
  if (filters.projectId !== undefined && filters.projectId !== "") {
    params.set("project_id", String(filters.projectId));
  }
  if (filters.statusId !== undefined) params.set("status_id", String(filters.statusId));
  if (filters.search?.trim()) params.set("subject", `~${filters.search.trim()}`);
  if (filters.sort) params.set("sort", filters.sort);

  return `/issues.json?${params.toString()}`;
}

function asRef(value: unknown, fallbackName = ""): RedmineRef {
  const candidate = (value ?? {}) as { id?: unknown; name?: unknown };
  return {
    id: Number(candidate.id) || 0,
    name: typeof candidate.name === "string" ? candidate.name : fallbackName,
  };
}

/** Maps one `/issues.json` entry onto the portal's shape. */
export function mapIssue(raw: unknown, baseUrl: string): RedmineIssue {
  const issue = (raw ?? {}) as Record<string, unknown>;
  const assignee = issue.assigned_to ? asRef(issue.assigned_to) : null;

  return {
    id: Number(issue.id) || 0,
    subject: String(issue.subject ?? "(no subject)"),
    description: String(issue.description ?? ""),
    project: asRef(issue.project),
    tracker: asRef(issue.tracker, "Tracker"),
    status: asRef(issue.status, "New"),
    priority: asRef(issue.priority, "Normal"),
    author: asRef(issue.author),
    assignee,
    createdOn: String(issue.created_on ?? ""),
    updatedOn: String(issue.updated_on ?? ""),
    dueDate: typeof issue.due_date === "string" ? issue.due_date : null,
    doneRatio: Number(issue.done_ratio) || 0,
    url: redmineIssueUrl(baseUrl, Number(issue.id) || 0),
  };
}

export function mapIssuePage(payload: unknown, baseUrl: string): RedmineIssuePage {
  const body = (payload ?? {}) as Record<string, unknown>;
  const list = Array.isArray(body.issues) ? body.issues : [];

  return {
    issues: list.map((entry) => mapIssue(entry, baseUrl)),
    totalCount: Number(body.total_count) || list.length,
    offset: Number(body.offset) || 0,
    limit: Number(body.limit) || list.length,
  };
}

export function mapProjects(payload: unknown): { id: number; name: string; identifier: string }[] {
  const body = (payload ?? {}) as Record<string, unknown>;
  const list = Array.isArray(body.projects) ? body.projects : [];

  return list.map((entry) => {
    const project = (entry ?? {}) as Record<string, unknown>;
    return {
      id: Number(project.id) || 0,
      name: String(project.name ?? "(unnamed)"),
      identifier: String(project.identifier ?? ""),
    };
  });
}

/** Turns a Redmine error body into something a human can act on. */
export function describeFailure(status: number, body: string): string {
  const detail = body
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  if (status === 401) return "Redmine rejected the API key (401). Check the key in Settings.";
  if (status === 403) return "This Redmine account is not allowed to read that (403).";
  if (status === 404) return "Redmine could not find the API at that URL (404). Check the instance URL.";
  if (status === 422) return detail || "Redmine rejected the change (422).";
  if (status >= 500) return `Redmine returned ${status}. Try again in a moment.`;
  return detail || `Redmine returned ${status}.`;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

async function request<T>(
  config: RedmineConfig,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const base = normaliseBaseUrl(config.baseUrl);
  if (!base) throw new RedmineError("No Redmine URL is configured.", 0);
  if (!config.apiKey) throw new RedmineError("No Redmine API key is configured.", 0);

  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await doFetch(`${base}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "X-Redmine-API-Key": config.apiKey,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new RedmineError(
      aborted
        ? "Redmine did not answer in time. Check the instance URL."
        : "Could not reach Redmine. Check the instance URL and network access.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();

  if (!response.ok) {
    throw new RedmineError(describeFailure(response.status, text), response.status);
  }

  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RedmineError("Redmine returned something that is not JSON.", response.status);
  }
}

export async function fetchIssues(
  config: RedmineConfig,
  filters: IssueFilters = {},
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<RedmineIssuePage> {
  const payload = await request<unknown>(config, buildIssuesPath(filters), options);
  return mapIssuePage(payload, config.baseUrl);
}

export async function fetchProjects(
  config: RedmineConfig,
  options: { fetchImpl?: typeof fetch; limit?: number } = {},
): Promise<{ id: number; name: string; identifier: string }[]> {
  const limit = clampLimit(options.limit, 100);
  const payload = await request<unknown>(config, `/projects.json?limit=${limit}`, options);
  return mapProjects(payload);
}

export async function fetchCurrentUser(
  config: RedmineConfig,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<{ id: number; login: string; firstname: string; lastname: string }> {
  const payload = await request<{ user?: Record<string, unknown> }>(
    config,
    "/users/current.json",
    options,
  );
  const user = payload.user ?? {};
  return {
    id: Number(user.id) || 0,
    login: String(user.login ?? ""),
    firstname: String(user.firstname ?? ""),
    lastname: String(user.lastname ?? ""),
  };
}

export async function createIssue(
  config: RedmineConfig,
  input: NewIssueInput,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<RedmineIssue> {
  const payload = await request<{ issue?: unknown }>(config, "/issues.json", {
    ...options,
    method: "POST",
    body: {
      issue: {
        project_id: input.projectId,
        subject: input.subject,
        ...(input.description ? { description: input.description } : {}),
        ...(input.priorityId ? { priority_id: input.priorityId } : {}),
        ...(input.trackerId ? { tracker_id: input.trackerId } : {}),
        ...(input.assignedToId ? { assigned_to_id: input.assignedToId } : {}),
      },
    },
  });

  return mapIssue(payload.issue ?? {}, config.baseUrl);
}

/** Cheap credential check used by the portal before it renders a list. */
export async function verifyConnection(
  config: RedmineConfig,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true; login: string } | { ok: false; error: string }> {
  try {
    const user = await fetchCurrentUser(config, options);
    return { ok: true, login: user.login || user.firstname || "connected" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not reach Redmine.",
    };
  }
}
