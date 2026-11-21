import {
  ACTION1_PATCH_FIELDS,
  Action1Error,
  fetchAccessToken,
  fetchEndpoint,
  fetchEndpointMissingUpdates,
  fetchEndpoints,
  normaliseAction1BaseUrl,
  resolveOrganizationId,
  type Action1Config,
  type Action1Endpoint,
  type Action1EndpointPage,
  type Action1MissingUpdate,
} from "../integrations/action1";
import { getIntegration } from "../integrations/store";
import { readCache, writeCache } from "../cache/ttl";
import { MAX_ENDPOINTS, missingAction1Settings, PAGE_SIZE } from "./endpoint";

export {
  describeLastSeen,
  describeMissingUpdates,
  describePatchHeadline,
  isRebootRequired,
  MAX_ENDPOINTS,
  missingAction1Settings,
  PAGE_SIZE,
  rebootLabel,
  summariseEndpoints,
  type InventorySummary,
} from "./endpoint";

/**
 * Server inventory, read straight from Action1.
 *
 * The Servers module has no local table: every load signs in with the
 * organisation's client credentials and pages `/endpoints/managed/{orgId}`
 * until the inventory is complete (or `MAX_ENDPOINTS` is reached, so one
 * enormous tenant cannot stall the page).
 */

export type ServersInventory =
  | { kind: "not_connected" }
  | { kind: "unconfigured"; missing: string[] }
  | { kind: "error"; message: string; status: number }
  | {
      kind: "ready";
      endpoints: Action1Endpoint[];
      total: number;
      truncated: boolean;
      /** False when Action1 returned no patch fields at all. */
      patchData: boolean;
      organizationId: string;
      apiHost: string;
      fetchedAt: string;
    };

export function action1Config(record: {
  secret: string;
  baseUrl?: string;
  config?: Record<string, string>;
}): Action1Config {
  return {
    baseUrl: normaliseAction1BaseUrl(record.baseUrl ?? ""),
    clientId: record.config?.clientId?.trim() ?? "",
    clientSecret: record.secret,
    orgId: record.config?.orgId?.trim() || undefined,
  };
}

function failure(error: unknown): ServersInventory {
  if (error instanceof Action1Error) {
    return { kind: "error", message: error.message, status: error.status };
  }
  return {
    kind: "error",
    message:
      error instanceof Error ? error.message : "Action1 could not be reached.",
    status: 0,
  };
}

/**
 * Budget for one cold inventory read. Action1 allows 50 endpoints per page, so a
 * 200-endpoint tenant needs four pages; without a ceiling a slow tenant could
 * hold a page render for a minute (each request also has a 12 s timeout).
 */
const INVENTORY_BUDGET_MS = 12_000;
const INVENTORY_CONCURRENCY = 4;

/** A ready inventory is reused for a minute; a failure is never cached. */
const INVENTORY_TTL_MS = 60_000;
const DETAIL_TTL_MS = 45_000;
const TOKEN_TTL_MS = 25 * 60_000;
const ORGANIZATION_TTL_MS = 10 * 60_000;

/** Identifies the connection so a credential or organization change busts it. */
function cacheKey(record: {
  baseUrl?: string;
  config?: Record<string, string>;
  updatedAt: string;
}): string {
  return [
    record.baseUrl ?? "",
    record.config?.clientId ?? "",
    record.config?.orgId ?? "",
    record.updatedAt,
  ].join("|");
}

/** The OAuth token lasts ~30 minutes; fetching it for every page load was one
 *  avoidable round trip per navigation. */
async function accessTokenFor(config: Action1Config): Promise<string> {
  const key = `action1-token:${config.baseUrl}|${config.clientId}`;
  const cached = readCache<string>(key);
  if (cached) return cached;

  const token = await fetchAccessToken(config);
  const lifetime = token.expiresIn
    ? Math.min(token.expiresIn * 1000 - 60_000, TOKEN_TTL_MS)
    : TOKEN_TTL_MS;
  if (lifetime > 0) writeCache(key, token.accessToken, lifetime);
  return token.accessToken;
}

async function organizationFor(
  config: Action1Config,
  token: string,
): Promise<string> {
  const key = `action1-org:${config.baseUrl}|${config.clientId}|${config.orgId ?? ""}`;
  const cached = readCache<string>(key);
  if (cached) return cached;

  const organizationId = await resolveOrganizationId(config, { token });
  writeCache(key, organizationId, ORGANIZATION_TTL_MS);
  return organizationId;
}

/** One page of the managed endpoint list, with the patch-field retry kept. */
async function readPage(
  config: Action1Config,
  token: string,
  organizationId: string,
  from: number,
  limit: number,
  fields: string,
  timeoutMs: number,
): Promise<Action1EndpointPage> {
  return fetchEndpoints(
    config,
    { orgId: organizationId, from, limit, fields },
    { token, timeoutMs },
  );
}

async function readInventory(
  config: Action1Config,
  limit: number,
): Promise<{ inventory: ServersInventory; fields: string }> {
  const deadline = Date.now() + INVENTORY_BUDGET_MS;
  let usedFields = "*";

  try {
    const token = await accessTokenFor(config);
    const organizationId = await organizationFor(config, token);

    // Start with the documented `fields=*`. Some tenants ignore it and answer
    // with default fields only, which used to leave every patch count at zero —
    // so the first page is re-read with the patch fields named explicitly.
    let fields = "*";
    const pageSize = Math.min(PAGE_SIZE, limit);

    let first = await readPage(
      config,
      token,
      organizationId,
      0,
      pageSize,
      fields,
      Math.max(2_000, deadline - Date.now()),
    );

    if (first.items.length > 0 && !first.extended) {
      try {
        const retry = await fetchEndpoints(
          config,
          {
            orgId: organizationId,
            from: 0,
            limit: pageSize,
            fields: ACTION1_PATCH_FIELDS,
          },
          { token },
        );
        if (retry.extended) {
          first = retry;
          fields = ACTION1_PATCH_FIELDS;
        }
      } catch {
        // A tenant that rejects the explicit list keeps the default fields.
      }
    }

    const endpoints: Action1Endpoint[] = [...first.items];
    const total = Math.max(first.totalCount, first.items.length);
    const pageCount = Math.min(
      Math.ceil(Math.min(total, limit) / pageSize),
      Math.ceil(limit / pageSize),
    );

    // Pages 2..n do not depend on each other, so they go out together instead
    // of one round trip after another.
    let index = 1;
    while (index < pageCount && Date.now() < deadline) {
      const batch: number[] = [];
      while (index < pageCount && batch.length < INVENTORY_CONCURRENCY) {
        batch.push(index);
        index += 1;
      }

      const pages = await Promise.all(
        batch.map((pageIndex) =>
          readPage(
            config,
            token,
            organizationId,
            pageIndex * pageSize,
            Math.min(pageSize, limit - pageIndex * pageSize),
            fields,
            Math.max(1_500, deadline - Date.now()),
          ).catch(() => null),
        ),
      );

      for (const page of pages) {
        if (!page) continue;
        endpoints.push(...page.items);
        if (page.items.length < pageSize) break;
      }
    }

    const unique = new Map(
      endpoints.map((endpoint) => [endpoint.id, endpoint]),
    );
    const list = [...unique.values()].slice(0, limit);

    usedFields = fields;
    return {
      fields,
      inventory: {
        kind: "ready",
        endpoints: list,
        total,
        truncated: list.length < total,
        patchData: endpoints.length > 0 && first.extended,
        organizationId,
        apiHost: new URL(config.baseUrl).host,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return { inventory: failure(error), fields: usedFields };
  }
}

type ReadyInventory = Extract<ServersInventory, { kind: "ready" }>;

/** One top-up per cache key, so parallel readers cannot pile up. */
const topUps = new Set<string>();

/**
 * Finishes an inventory that ran out of the request budget.
 *
 * The reader never waits for this: the partial list is returned (and cached),
 * while the remaining pages are fetched here and the complete inventory
 * replaces the cache entry. The next visit inside the TTL is therefore full.
 */
function scheduleTopUp(
  config: Action1Config,
  limit: number,
  key: string,
  partial: ReadyInventory,
  fields: string,
): void {
  if (topUps.has(key)) return;
  topUps.add(key);

  void (async () => {
    try {
      const deadline = Date.now() + 45_000;
      const token = await accessTokenFor(config);
      const pageSize = Math.min(PAGE_SIZE, limit);
      const pageCount = Math.min(
        Math.ceil(Math.min(partial.total, limit) / pageSize),
        Math.ceil(limit / pageSize),
      );
      const endpoints = [...partial.endpoints];

      for (
        let index = Math.ceil(endpoints.length / pageSize);
        index < pageCount;
        index += 1
      ) {
        if (Date.now() > deadline) return;
        const page = await readPage(
          config,
          token,
          partial.organizationId,
          index * pageSize,
          Math.min(pageSize, limit - index * pageSize),
          fields,
          12_000,
        ).catch(() => null);
        if (!page) return;
        endpoints.push(...page.items);
      }

      const unique = new Map(
        endpoints.map((endpoint) => [endpoint.id, endpoint]),
      );
      const list = [...unique.values()].slice(0, limit);
      if (list.length <= partial.endpoints.length) return;

      writeCache(
        key,
        {
          ...partial,
          endpoints: list,
          truncated: list.length < partial.total,
          fetchedAt: new Date().toISOString(),
        },
        INVENTORY_TTL_MS,
      );
    } catch {
      // A background top-up never surfaces an error; the next read retries.
    } finally {
      topUps.delete(key);
    }
  })();
}

/**
 * Reads the whole managed endpoint list.
 *
 * A ready result is reused for a minute per connection (the inventory is
 * organization-wide, so this serves every signed-in person on the instance);
 * failures are always retried.
 */
export async function loadServersInventory(
  userId: string,
  options: { limit?: number } = {},
): Promise<ServersInventory> {
  const record = await getIntegration(userId, "action1");
  if (!record) return { kind: "not_connected" };

  const missing = missingAction1Settings(record);
  if (missing.length > 0) return { kind: "unconfigured", missing };

  const config = action1Config(record);
  const limit = Math.min(options.limit ?? MAX_ENDPOINTS, MAX_ENDPOINTS);
  const key = `action1-inventory:${cacheKey(record)}:${limit}`;

  const cached = readCache<ServersInventory>(key);
  if (cached) return cached;

  const { inventory, fields } = await readInventory(config, limit);
  if (inventory.kind === "ready") {
    writeCache(key, inventory, INVENTORY_TTL_MS);
    // Out of budget with pages still missing: the page shows what it has and the
    // rest lands in the cache in the background.
    if (inventory.endpoints.length < Math.min(inventory.total, limit)) {
      scheduleTopUp(config, limit, key, inventory, fields);
    }
  }
  return inventory;
}

export type EndpointDetail =
  | { kind: "not_connected" }
  | { kind: "unconfigured"; missing: string[] }
  | { kind: "error"; message: string; status: number }
  | {
      kind: "ready";
      endpoint: Action1Endpoint;
      organizationId: string;
      /** The updates behind the counts, newest severity first. */
      updates: Action1MissingUpdate[];
      updateTotal: number;
      /** Set when the endpoint loaded but its update list did not. */
      updatesError?: string;
    };

/** `GET /endpoints/managed/{orgId}/{endpointId}` for the detail page. */
export async function loadEndpointDetail(
  userId: string,
  endpointId: string,
): Promise<EndpointDetail> {
  const record = await getIntegration(userId, "action1");
  if (!record) return { kind: "not_connected" };

  const missing = missingAction1Settings(record);
  if (missing.length > 0) return { kind: "unconfigured", missing };

  const config = action1Config(record);
  const key = `action1-detail:${cacheKey(record)}:${endpointId}`;
  const cached = readCache<EndpointDetail>(key);
  if (cached) return cached;

  try {
    const token = await accessTokenFor(config);
    const organizationId = await organizationFor(config, token);
    const endpoint = await fetchEndpoint(
      config,
      { orgId: organizationId, endpointId },
      { token },
    );

    // The list is a second call, so a failure there must not blank the page.
    let updates: Action1MissingUpdate[] = [];
    let updateTotal = 0;
    let updatesError: string | undefined;

    try {
      const page = await fetchEndpointMissingUpdates(
        config,
        { orgId: organizationId, endpointId },
        { token },
      );
      updates = page.items;
      updateTotal = page.totalCount;
    } catch (error) {
      updatesError =
        error instanceof Action1Error
          ? error.message
          : "Action1 did not return the missing updates for this endpoint.";
      updateTotal = endpoint.missingCritical ?? 0;
    }

    const detail: EndpointDetail = {
      kind: "ready",
      endpoint,
      organizationId,
      updates,
      updateTotal,
      updatesError,
    };
    writeCache(key, detail, DETAIL_TTL_MS);
    return detail;
  } catch (error) {
    const state = failure(error);
    return state.kind === "error"
      ? state
      : { kind: "error", message: "Unknown error", status: 0 };
  }
}

/** Missing updates for several endpoints at once, for the patching report. */
export type PatchLists =
  | { kind: "not_connected" }
  | { kind: "unconfigured"; missing: string[] }
  | { kind: "error"; message: string; status: number }
  | {
      kind: "ready";
      organizationId: string;
      lists: Record<
        string,
        { updates: Action1MissingUpdate[]; total: number; error?: string }
      >;
    };

/** Endpoint ids per call are capped by the caller; the token is fetched once. */
export async function loadPatchLists(
  userId: string,
  endpointIds: string[],
): Promise<PatchLists> {
  const record = await getIntegration(userId, "action1");
  if (!record) return { kind: "not_connected" };

  const missing = missingAction1Settings(record);
  if (missing.length > 0) return { kind: "unconfigured", missing };

  const config = action1Config(record);

  try {
    const token = await accessTokenFor(config);
    const organizationId = await organizationFor(config, token);
    const lists: Record<
      string,
      { updates: Action1MissingUpdate[]; total: number; error?: string }
    > = {};

    // Four at a time keeps a ten-endpoint report well inside the request budget.
    for (let index = 0; index < endpointIds.length; index += 4) {
      const batch = endpointIds.slice(index, index + 4);
      await Promise.all(
        batch.map(async (endpointId) => {
          try {
            const page = await fetchEndpointMissingUpdates(
              config,
              { orgId: organizationId, endpointId },
              { token },
            );
            lists[endpointId] = { updates: page.items, total: page.totalCount };
          } catch (error) {
            lists[endpointId] = {
              updates: [],
              total: 0,
              error:
                error instanceof Action1Error
                  ? error.message
                  : "Action1 did not return this endpoint's updates.",
            };
          }
        }),
      );
    }

    return { kind: "ready", organizationId, lists };
  } catch (error) {
    return failure(error) as PatchLists;
  }
}

/** One entry of the server picker on the task form. */
export type ServerOption = {
  /** The value stored on the task — the endpoint name as Action1 reports it. */
  value: string;
  label: string;
  hint: string;
};

/**
 * Endpoint names for the task form's "Server details" dropdown.
 *
 * Names only — the task form is open to every role, so it gets no patch,
 * severity or agent data. An unconfigured or failing Action1 connection returns
 * an empty list and the form falls back to free text.
 */
export async function listServerOptions(
  userId: string,
): Promise<ServerOption[]> {
  const inventory = await loadServersInventory(userId, {
    limit: MAX_ENDPOINTS,
  });
  if (inventory.kind !== "ready") return [];

  return inventory.endpoints
    .map((endpoint) => ({
      value: endpoint.name,
      label: endpoint.name,
      hint: [endpoint.os, endpoint.ipAddress].filter(Boolean).join(" · "),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
