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
import { clearCache, readCache, writeCache } from "../cache/ttl";
import {
  describeAge,
  isStale,
  readSnapshot,
  recordSyncFailure,
  snapshotAgeMs,
  writeSnapshot,
  type SnapshotSource,
} from "./snapshot";
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
      /**
       * Where this answer came from: our stored snapshot (the normal case) or a
       * live Action1 read (only when no snapshot exists yet).
       */
      syncedFrom?: "snapshot" | "live";
      /** When the stored snapshot was captured; equal to fetchedAt for a live read. */
      capturedAt?: string;
      /** True once the snapshot is older than a day. */
      stale?: boolean;
      /** Human-readable age, e.g. "3 hours ago". */
      age?: string;
      /** Why the last sync attempt failed, if it did. */
      lastSyncError?: string | null;
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
 * Reads the inventory the workspace already has.
 *
 * The first read after a fresh install fetches from Action1 and stores the
 * result; every read after that answers from the snapshot, which the nightly job
 * and the Sync now button keep current. A page load must not be a reason to call
 * somebody else's API.
 */
export async function loadServersInventory(
  userId: string,
  options: { limit?: number } = {},
): Promise<ServersInventory> {
  const record = await getIntegration(userId, "action1");
  if (!record) return { kind: "not_connected" };

  const missing = missingAction1Settings(record);
  if (missing.length > 0) return { kind: "unconfigured", missing };

  const limit = Math.min(options.limit ?? MAX_ENDPOINTS, MAX_ENDPOINTS);
  const snapshot = await readSnapshot();

  if (snapshot) {
    const endpoints = snapshot.endpoints.slice(0, limit);
    return {
      kind: "ready",
      endpoints,
      total: snapshot.total,
      truncated: snapshot.truncated || snapshot.endpoints.length > limit,
      patchData: snapshot.patchData,
      organizationId: snapshot.organizationId,
      apiHost: snapshot.apiHost,
      fetchedAt: snapshot.capturedAt,
      syncedFrom: "snapshot",
      capturedAt: snapshot.capturedAt,
      stale: isStale(snapshot),
      age: describeAge(snapshot),
      lastSyncError: snapshot.lastError,
    };
  }

  // No snapshot at all: this is the first read, so pay for it once and store it.
  const live = await syncServersInventory(userId, limit, "inline");
  if (live.kind !== "ready") return live;
  return {
    ...live,
    endpoints: live.endpoints.slice(0, limit),
    truncated: live.truncated || live.endpoints.length > limit,
    syncedFrom: "live",
    age: "just now",
  };
}

export type SyncResult =
  | { ok: true; inventory: ServersInventory & { kind: "ready" }; durationMs: number; endpointCount: number }
  | { ok: false; reason: "not_connected" | "unconfigured" | "failed"; message: string };

/**
 * Reads Action1 now and stores the result.
 *
 * Used by the nightly job, by Sync now, and by the first read after install.
 * Everything else reads the snapshot (`loadServersInventory`), which is the
 * difference between a page that opens and a page that waits.
 */
export async function syncServersInventory(
  userId: string,
  limit: number = MAX_ENDPOINTS,
  source: SnapshotSource = "manual",
): Promise<ServersInventory> {
  const record = await getIntegration(userId, "action1");
  if (!record) return { kind: "not_connected" };

  const missing = missingAction1Settings(record);
  if (missing.length > 0) return { kind: "unconfigured", missing };

  const config = action1Config(record);
  const started = Date.now();

  try {
    const { inventory } = await readInventory(config, Math.min(limit, MAX_ENDPOINTS));
    const durationMs = Date.now() - started;

    if (inventory.kind === "ready") {
      await writeSnapshot({
        endpoints: inventory.endpoints,
        total: inventory.total,
        truncated: inventory.truncated,
        patchData: inventory.patchData,
        organizationId: inventory.organizationId,
        apiHost: inventory.apiHost,
        durationMs,
        source,
      });
      // The per-instance copies are now behind the snapshot; drop them so a
      // warm instance does not keep serving the previous day's list.
      clearCache("action1-inventory");
      return {
        ...inventory,
        fetchedAt: new Date().toISOString(),
        syncedFrom: "live",
        capturedAt: new Date().toISOString(),
        stale: false,
        age: "just now",
        lastSyncError: null,
      };
    }

    if (inventory.kind === "error") await recordSyncFailure(inventory.message);
    return inventory;
  } catch (cause) {
    const result = failure(cause);
    if (result.kind === "error") await recordSyncFailure(result.message);
    return result;
  }
}

/** Sync now, for the button: a result a person can read, not a page state. */
export async function runSync(
  userId: string,
  source: SnapshotSource = "manual",
): Promise<SyncResult> {
  const snapshot = await readSnapshot();
  const started = Date.now();
  const inventory = await syncServersInventory(userId, MAX_ENDPOINTS, source);
  const durationMs = Date.now() - started;

  if (inventory.kind === "ready") {
    return {
      ok: true,
      inventory,
      durationMs,
      endpointCount: inventory.endpoints.length,
    };
  }
  if (inventory.kind === "not_connected") {
    return { ok: false, reason: "not_connected", message: "Action1 is not connected." };
  }
  if (inventory.kind === "unconfigured") {
    return {
      ok: false,
      reason: "unconfigured",
      message: `Action1 needs: ${inventory.missing.join(", ")}.`,
    };
  }
  return {
    ok: false,
    reason: "failed",
    message:
      snapshot && snapshot.endpoints.length > 0
        ? `${inventory.message} The last good snapshot is still in use.`
        : inventory.message,
  };
}

/** Age of the stored snapshot, for pages that are not the Servers module. */
export async function snapshotSummary(): Promise<{
  capturedAt: string;
  age: string;
  stale: boolean;
  ageMs: number;
} | null> {
  const snapshot = await readSnapshot();
  if (!snapshot) return null;
  return {
    capturedAt: snapshot.capturedAt,
    age: describeAge(snapshot),
    stale: isStale(snapshot),
    ageMs: snapshotAgeMs(snapshot),
  };
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
