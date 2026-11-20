/**
 * Action1 REST API (v3.0) — managed endpoints.
 *
 * Contract taken from the published API reference
 * (https://app.na-2.action1.com/apidocs/):
 *
 *   POST {base}/oauth2/token     OAuth 2.0 client credentials → access_token
 *   GET  {base}/organizations    organizations the credential can see
 *   GET  {base}/endpoints/managed/{orgId}?from=0&limit=50&fields=*
 *   GET  {base}/endpoints/managed/{orgId}/{endpointId}?fields=*
 *
 * Every call carries `Authorization: Bearer <access_token>`. Collection
 * responses are `ResultPage` objects: `{ items, total_items, limit, next_page }`
 * where `next_page` is a ready-made absolute URL. Endpoint dates arrive as
 * `YYYY-MM-DD_HH-mm-ss` in UTC.
 */

export type Action1Config = {
  /** Full API base URL, e.g. "https://app.action1.com/api/3.0". */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Organization id. When blank the first organization is used. */
  orgId?: string;
};

export class Action1Error extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "Action1Error";
    this.status = status;
  }
}

/** A managed endpoint as the inventory shows it. */
export type Action1Endpoint = {
  id: string;
  name: string;
  /** "Connected", "Disconnected", "Pending Uninstall", … */
  status: string;
  os: string;
  platform: string;
  /** Normalised from "2026-11-03_09-15-22" to ISO 8601. */
  lastSeen: string;
  ipAddress: string;
  externalAddress: string;
  agentVersion: string;
  agentInstallDate: string;
  subscriptionStatus: string;
  user: string;
  comment: string;
  /** Missing OS/app patches, split by severity in the API. */
  missingCritical: number | null;
  missingOther: number | null;
  rebootRequired: string;
  updateStatus: string;
  vulnerabilityStatus: string;
  /** Detail-only hardware fields (present with `fields=*`). */
  manufacturer: string;
  model: string;
  serial: string;
  cpu: string;
  ram: string;
  disk: string;
  mac: string;
  lastBootTime: string;
  organizationId: string;
  /** Absolute link into the Action1 console. */
  url: string;
};

export type Action1Organization = {
  id: string;
  name: string;
};

const DEFAULT_BASE_URL = "https://app.action1.com/api/3.0";
export const ACTION1_LIMIT_MAX = 50;
const TIMEOUT_MS = 12_000;

/**
 * Accepts "app.action1.com", "https://app.na-2.action1.com/" or the full
 * ".../api/3.0" and returns the API base URL.
 */
export function normaliseAction1BaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return DEFAULT_BASE_URL;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return /\/api\/\d+(\.\d+)?$/i.test(withScheme) ? withScheme : `${withScheme}/api/3.0`;
}

/** "https://app.action1.com/api/3.0" → "https://app.action1.com" for console links. */
export function action1ConsoleUrl(baseUrl: string): string {
  return baseUrl.replace(/\/api\/\d+(\.\d+)?\/?$/i, "");
}

export function action1EndpointUrl(baseUrl: string, endpointId: string): string {
  return `${action1ConsoleUrl(baseUrl)}/console/endpoints?endpoint=${encodeURIComponent(endpointId)}`;
}

/** Action1 sends UTC as "2026-11-03_09-15-22"; anything else is passed through. */
export function parseAction1Date(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[_T ](\d{2})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function str(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  // Booleans arrive for reboot_required and friends.
  if (typeof value === "boolean") return value ? "true" : "false";
  return fallback;
}

/** Counts arrive as numbers, "3" or "" depending on the field set. */
function count(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function mapEndpoint(raw: unknown, baseUrl: string): Action1Endpoint {
  const endpoint = (raw ?? {}) as Record<string, unknown>;
  const id = str(endpoint.id);
  const cpuName = str(endpoint.CPU_name);
  const cpuSize = str(endpoint.CPU_size);

  return {
    id,
    name: str(endpoint.name) || str(endpoint.device_name) || id || "Unnamed endpoint",
    status: str(endpoint.status, "Unknown"),
    os: str(endpoint.OS),
    platform: str(endpoint.platform),
    lastSeen: parseAction1Date(endpoint.last_seen),
    ipAddress: str(endpoint.address),
    externalAddress: str(endpoint.external_address),
    agentVersion: str(endpoint.agent_version),
    agentInstallDate: parseAction1Date(endpoint.agent_install_date),
    subscriptionStatus: str(endpoint.subscription_status),
    user: str(endpoint.user),
    comment: str(endpoint.comment),
    missingCritical: count(endpoint.missing_critical_updates),
    missingOther: count(endpoint.missing_other_updates),
    rebootRequired: str(endpoint.reboot_required),
    updateStatus: str(endpoint.update_status),
    vulnerabilityStatus: str(endpoint.vulnerability_status),
    manufacturer: str(endpoint.manufacturer),
    model: str(endpoint.device_name),
    serial: str(endpoint.serial),
    cpu: [cpuName, cpuSize].filter(Boolean).join(" · "),
    ram: str(endpoint.RAM),
    disk: str(endpoint.disk),
    mac: str(endpoint.MAC),
    lastBootTime: parseAction1Date(endpoint.last_boot_time),
    organizationId: str(endpoint.organization_id),
    url: id
      ? action1EndpointUrl(baseUrl, id)
      : `${action1ConsoleUrl(baseUrl)}/console/endpoints`,
  };
}

export type Action1EndpointPage = {
  items: Action1Endpoint[];
  totalCount: number;
  limit: number;
  /** Absolute URL of the next page, as the API supplies it. */
  nextPage: string | null;
};

export function mapEndpointPage(payload: unknown, baseUrl: string): Action1EndpointPage {
  const page = (payload ?? {}) as Record<string, unknown>;
  const items = Array.isArray(page.items) ? page.items : [];

  return {
    items: items.map((item) => mapEndpoint(item, baseUrl)),
    totalCount: count(page.total_items) ?? items.length,
    limit: count(page.limit) ?? items.length,
    nextPage: typeof page.next_page === "string" && page.next_page ? page.next_page : null,
  };
}

export function mapOrganizations(payload: unknown): Action1Organization[] {
  const page = (payload ?? {}) as Record<string, unknown>;
  const items = Array.isArray(page.items) ? page.items : Array.isArray(payload) ? payload : [];

  return items
    .map((item) => {
      const organization = (item ?? {}) as Record<string, unknown>;
      return { id: str(organization.id), name: str(organization.name) || "Organization" };
    })
    .filter((organization) => organization.id !== "");
}

/** Human wording for the status codes Action1 returns. */
export function describeAction1Failure(status: number, body: string): string {
  const detail = body.trim().slice(0, 200);
  if (status === 400) return detail || "Action1 rejected the request.";
  if (status === 401) return "Action1 rejected the credentials. Check the client id and secret.";
  if (status === 403) return "These credentials do not have permission to read endpoints.";
  if (status === 404) return "Action1 could not find that organization or endpoint.";
  if (status === 429) return "Action1 is rate limiting requests. Try again in a moment.";
  if (status >= 500) return "Action1 reported a server error. Try again shortly.";
  return detail || `Action1 returned HTTP ${status}.`;
}

type RequestOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  method?: string;
  body?: BodyInit;
  form?: Record<string, string>;
  headers?: Record<string, string>;
};

async function request<T>(
  config: Action1Config,
  path: string,
  token: string | null,
  options: RequestOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options.headers ?? {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    let body = options.body;
    if (options.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(options.form).toString();
    }

    const response = await fetchImpl(
      path.startsWith("http") ? path : `${config.baseUrl}${path}`,
      {
        method: options.method ?? "GET",
        headers,
        body,
        signal: controller.signal,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Action1Error(describeAction1Failure(response.status, text), response.status);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (error) {
    if (error instanceof Action1Error) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Action1Error("Action1 did not answer in time. Check the API URL.", 0);
    }
    throw new Action1Error(
      error instanceof Error ? `Could not reach Action1: ${error.message}` : "Could not reach Action1.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

export type Action1Token = {
  accessToken: string;
  tokenType: string;
  /** Seconds the token stays valid, when the server says. */
  expiresIn: number | null;
};

/** OAuth 2.0 client-credentials grant against `/oauth2/token`. */
export async function fetchAccessToken(
  config: Action1Config,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<Action1Token> {
  const payload = await request<Record<string, unknown>>(config, "/oauth2/token", null, {
    ...options,
    method: "POST",
    form: {
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    },
  });

  const accessToken = str(payload?.access_token);
  if (!accessToken) {
    throw new Action1Error("Action1 did not return an access token.", 0);
  }

  return {
    accessToken,
    tokenType: str(payload?.token_type, "Bearer"),
    expiresIn: count(payload?.expires_in),
  };
}

/** Organizations the credential can see — used when no org id is configured. */
export async function fetchOrganizations(
  config: Action1Config,
  token: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<Action1Organization[]> {
  const payload = await request<unknown>(config, "/organizations", token, options);
  return mapOrganizations(payload);
}

async function resolveToken(
  config: Action1Config,
  options: { fetchImpl?: typeof fetch },
): Promise<string> {
  return (await fetchAccessToken(config, options)).accessToken;
}

/**
 * One page of managed endpoints. `fields=*` asks for the extended set, which is
 * what brings the missing-update counts and hardware details with it.
 */
export async function fetchEndpoints(
  config: Action1Config,
  params: { orgId: string; from?: number; limit?: number; status?: string; sortBy?: string },
  options: { fetchImpl?: typeof fetch; token?: string } = {},
): Promise<Action1EndpointPage> {
  const token = options.token ?? (await resolveToken(config, options));
  const limit = Math.min(Math.max(params.limit ?? ACTION1_LIMIT_MAX, 1), ACTION1_LIMIT_MAX);

  const query = new URLSearchParams({
    from: String(params.from ?? 0),
    limit: String(limit),
    fields: "*",
  });
  if (params.status) query.set("status", params.status);
  if (params.sortBy) query.set("sortby", params.sortBy);

  const payload = await request<unknown>(
    config,
    `/endpoints/managed/${encodeURIComponent(params.orgId)}?${query.toString()}`,
    token,
    options,
  );

  return mapEndpointPage(payload, config.baseUrl);
}

/** `GET /endpoints/managed/{orgId}/{endpointId}` — the endpoint detail record. */
export async function fetchEndpoint(
  config: Action1Config,
  params: { orgId: string; endpointId: string },
  options: { fetchImpl?: typeof fetch; token?: string } = {},
): Promise<Action1Endpoint> {
  const token = options.token ?? (await resolveToken(config, options));
  const payload = await request<unknown>(
    config,
    `/endpoints/managed/${encodeURIComponent(params.orgId)}/${encodeURIComponent(params.endpointId)}?fields=*`,
    token,
    options,
  );

  const endpoint = mapEndpoint(payload, config.baseUrl);
  if (!endpoint.id) throw new Action1Error("Action1 returned no endpoint for that id.", 0);
  return endpoint;
}

/** Uses the configured org, or the first one the credential can see. */
export async function resolveOrganizationId(
  config: Action1Config,
  options: { fetchImpl?: typeof fetch; token?: string } = {},
): Promise<string> {
  if (config.orgId?.trim()) return config.orgId.trim();
  const token = options.token ?? (await resolveToken(config, options));
  const organizations = await fetchOrganizations(config, token, options);
  if (organizations.length === 0) {
    throw new Action1Error("These credentials cannot see any organization.", 0);
  }
  return organizations[0].id;
}
