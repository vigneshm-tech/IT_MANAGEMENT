import {
  ACTION1_PATCH_FIELDS,
  Action1Error,
  fetchAccessToken,
  fetchEndpoint,
  fetchEndpoints,
  normaliseAction1BaseUrl,
  resolveOrganizationId,
  type Action1Config,
  type Action1Endpoint,
} from "../integrations/action1";
import { getIntegration } from "../integrations/store";
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

export function action1Config(
  record: { secret: string; baseUrl?: string; config?: Record<string, string> },
): Action1Config {
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
    message: error instanceof Error ? error.message : "Action1 could not be reached.",
    status: 0,
  };
}

/**
 * Reads the whole managed endpoint list. Credentials come from the signed-in
 * user's vault, so the inventory follows whoever is looking at it.
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

  try {
    const token = (await fetchAccessToken(config)).accessToken;
    const organizationId = await resolveOrganizationId(config, { token });

    const endpoints: Action1Endpoint[] = [];
    let total = 0;
    let from = 0;
    // Start with the documented `fields=*`. Some tenants ignore it and answer
    // with default fields only, which used to leave every patch count at zero —
    // so the first page is re-read with the patch fields named explicitly.
    let fields = "*";
    let patchFieldsReturned = false;

    let page = await fetchEndpoints(
      config,
      { orgId: organizationId, from, limit: Math.min(PAGE_SIZE, limit) },
      { token },
    );

    if (page.items.length > 0 && !page.extended) {
      try {
        const retry = await fetchEndpoints(
          config,
          {
            orgId: organizationId,
            from: 0,
            limit: Math.min(PAGE_SIZE, limit),
            fields: ACTION1_PATCH_FIELDS,
          },
          { token },
        );
        if (retry.extended) {
          page = retry;
          fields = ACTION1_PATCH_FIELDS;
        }
      } catch {
        // A tenant that rejects the explicit list keeps the default fields.
      }
    }

    while (endpoints.length < limit) {
      patchFieldsReturned = patchFieldsReturned || page.extended;
      total = Math.max(page.totalCount, endpoints.length + page.items.length);
      endpoints.push(...page.items);
      from += page.items.length;

      // An empty page means the API has nothing more to give, whatever the total says.
      if (page.items.length === 0 || endpoints.length >= total) break;

      page = await fetchEndpoints(
        config,
        {
          orgId: organizationId,
          from,
          limit: Math.min(PAGE_SIZE, limit - endpoints.length),
          fields,
        },
        { token },
      );
    }

    return {
      kind: "ready",
      endpoints,
      total,
      truncated: endpoints.length < total,
      patchData: patchFieldsReturned,
      organizationId,
      apiHost: new URL(config.baseUrl).host,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    return failure(error);
  }
}

export type EndpointDetail =
  | { kind: "not_connected" }
  | { kind: "unconfigured"; missing: string[] }
  | { kind: "error"; message: string; status: number }
  | { kind: "ready"; endpoint: Action1Endpoint; organizationId: string };

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

  try {
    const token = (await fetchAccessToken(config)).accessToken;
    const organizationId = await resolveOrganizationId(config, { token });
    const endpoint = await fetchEndpoint(config, { orgId: organizationId, endpointId }, { token });
    return { kind: "ready", endpoint, organizationId };
  } catch (error) {
    const state = failure(error);
    return state.kind === "error" ? state : { kind: "error", message: "Unknown error", status: 0 };
  }
}
