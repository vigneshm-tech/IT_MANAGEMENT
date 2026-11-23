import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient, runWithServiceRole } from "../supabase/server";
import type { Action1Endpoint } from "../integrations/action1";

/**
 * The server inventory, kept in our database instead of fetched per page.
 *
 * Why: Action1 costs a token, an organisation lookup and up to four inventory
 * pages — a cold Servers page could spend most of a minute in HTTP calls, and
 * every module switch paid it again. The inventory is not a live stock price;
 * an endpoint list that is a few hours old is *more* useful than a page that
 * takes forty seconds.
 *
 * So: one snapshot per workspace, written by the nightly job or by Sync now,
 * and every reader answers from it. It is deliberately stale-tolerant — the
 * reader says how old it is rather than blocking to refresh.
 *
 * Writes run with the service role (no browser session writes a snapshot);
 * reads use the caller's client, and the table's only policy is "any signed-in
 * person may read".
 */

export type SnapshotSource = "schedule" | "manual" | "inline";

export type InventorySnapshot = {
  capturedAt: string;
  durationMs: number | null;
  organizationId: string;
  apiHost: string;
  total: number;
  truncated: boolean;
  patchData: boolean;
  endpoints: Action1Endpoint[];
  source: SnapshotSource;
  lastError: string | null;
  lastAttemptAt: string | null;
};

/** The once-a-day promise, and the point where the UI starts saying "stale". */
export const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const SCOPE = "default";

type SnapshotRow = {
  captured_at: string;
  duration_ms: number | null;
  organization_id: string;
  api_host: string;
  total: number;
  truncated: boolean;
  patch_data: boolean;
  endpoints: Action1Endpoint[] | null;
  source: string;
  last_error: string | null;
  last_attempt_at: string | null;
};

const COLUMNS =
  "captured_at, duration_ms, organization_id, api_host, total, truncated, patch_data, endpoints, source, last_error, last_attempt_at";

function mapRow(row: SnapshotRow): InventorySnapshot {
  return {
    capturedAt: row.captured_at,
    durationMs: row.duration_ms,
    organizationId: row.organization_id,
    apiHost: row.api_host,
    total: row.total,
    truncated: row.truncated,
    patchData: row.patch_data,
    endpoints: row.endpoints ?? [],
    source: (row.source as SnapshotSource) ?? "schedule",
    lastError: row.last_error,
    lastAttemptAt: row.last_attempt_at,
  };
}

/* Demo mode: the same shape, in process memory. */
const globalForSnapshot = globalThis as unknown as {
  __taskTornadoAction1Snapshot?: InventorySnapshot;
};

export function snapshotAgeMs(snapshot: InventorySnapshot, now = Date.now()): number {
  const captured = new Date(snapshot.capturedAt).getTime();
  if (Number.isNaN(captured)) return Number.POSITIVE_INFINITY;
  return Math.max(0, now - captured);
}

export function isStale(snapshot: InventorySnapshot, now = Date.now()): boolean {
  return snapshotAgeMs(snapshot, now) > SNAPSHOT_MAX_AGE_MS;
}

/** "3 hours ago" — the only thing a reader needs to judge a snapshot. */
export function describeAge(snapshot: InventorySnapshot, now = Date.now()): string {
  const elapsed = snapshotAgeMs(snapshot, now);
  if (elapsed < 60_000) return "just now";
  const minutes = Math.round(elapsed / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export async function readSnapshot(): Promise<InventorySnapshot | null> {
  if (!isSupabaseConfigured) return globalForSnapshot.__taskTornadoAction1Snapshot ?? null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("action1_inventory")
      .select(COLUMNS)
      .eq("scope", SCOPE)
      .maybeSingle();

    if (error || !data) return null;
    return mapRow(data as SnapshotRow);
  } catch (cause) {
    console.error("[servers] snapshot read failed", cause);
    return null;
  }
}

export type SnapshotWrite = {
  endpoints: Action1Endpoint[];
  total: number;
  truncated: boolean;
  patchData: boolean;
  organizationId: string;
  apiHost: string;
  durationMs: number | null;
  source: SnapshotSource;
};

export async function writeSnapshot(input: SnapshotWrite): Promise<boolean> {
  const now = new Date().toISOString();
  const snapshot: InventorySnapshot = {
    capturedAt: now,
    durationMs: input.durationMs,
    organizationId: input.organizationId,
    apiHost: input.apiHost,
    total: input.total,
    truncated: input.truncated,
    patchData: input.patchData,
    endpoints: input.endpoints,
    source: input.source,
    lastError: null,
    lastAttemptAt: now,
  };

  if (!isSupabaseConfigured) {
    globalForSnapshot.__taskTornadoAction1Snapshot = snapshot;
    return true;
  }

  try {
    return await runWithServiceRole(async () => {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("action1_inventory").upsert(
        {
          scope: SCOPE,
          captured_at: now,
          duration_ms: input.durationMs,
          organization_id: input.organizationId,
          api_host: input.apiHost,
          total: input.total,
          truncated: input.truncated,
          patch_data: input.patchData,
          endpoints: input.endpoints,
          source: input.source,
          last_error: null,
          last_attempt_at: now,
        },
        { onConflict: "scope" },
      );
      if (error) {
        console.error("[servers] snapshot write failed", error.message);
        return false;
      }
      return true;
    });
  } catch (cause) {
    console.error("[servers] snapshot write failed", cause);
    return false;
  }
}

/**
 * A failed sync keeps yesterday's snapshot and records why.
 *
 * The alternative — blanking the page because Action1 had a bad minute — would
 * turn a stale inventory into no inventory.
 */
export async function recordSyncFailure(message: string): Promise<void> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured) {
    if (globalForSnapshot.__taskTornadoAction1Snapshot) {
      globalForSnapshot.__taskTornadoAction1Snapshot.lastError = message;
      globalForSnapshot.__taskTornadoAction1Snapshot.lastAttemptAt = now;
    }
    return;
  }

  try {
    await runWithServiceRole(async () => {
      const supabase = await createSupabaseServerClient();
      await supabase
        .from("action1_inventory")
        .update({ last_error: message.slice(0, 300), last_attempt_at: now })
        .eq("scope", SCOPE);
    });
  } catch (cause) {
    console.error("[servers] snapshot failure write failed", cause);
  }
}
