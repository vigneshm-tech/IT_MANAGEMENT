/**
 * The captured Redmine client list, kept in our database.
 *
 * Scanning portal.wondersoft.in for every distinct Client-eShopaid value costs
 * one API page per hundred tickets, so it happens on **Sync now** — never on a
 * page load. What the scan finds is stored in two tables
 * (`supabase/migrations/0040_redmine_clients.sql`): the values themselves, and
 * one row describing the last attempt, including why it failed.
 *
 * Writes run with the service role (no browser session writes the catalogue);
 * reads use the caller's client and the table's only policy is "any signed-in
 * person may read", because a client list is organisation-wide.
 */

import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient, runWithServiceRole } from "../supabase/server";
import { getIntegration } from "../integrations/store";
import {
  CLIENT_FIELD_ID,
  CLIENT_PROJECT_ID,
  scanClients,
  sortClients,
  type RedmineClientFound,
} from "../integrations/redmine-clients";

export { describeSyncAge, isSyncStale } from "../integrations/redmine-clients";

export type ClientSyncSource = "manual" | "scheduled" | "inline";

export type RedmineClient = RedmineClientFound & {
  /** When this value was first captured — kept across syncs. */
  firstSeen: string;
  /** When it was last seen. */
  lastSyncedAt: string;
};

export type RedmineClientSync = {
  projectId: number;
  fieldId: number;
  /** Tickets the last scan read. */
  scanned: number;
  /** True when the scan stopped at its cap before the end of history. */
  truncated: boolean;
  syncedAt: string;
  durationMs: number | null;
  source: ClientSyncSource;
  lastError: string | null;
  lastAttemptAt: string | null;
};

export type ClientCatalogue = {
  clients: RedmineClient[];
  /** Null until the first successful sync. */
  sync: RedmineClientSync | null;
};

const SCOPE = "default";
const WRITE_CHUNK = 200;

type ClientRow = {
  value: string;
  name: string;
  codes: string[] | null;
  tickets: number;
  issue_id: number | null;
  first_seen: string;
  last_synced_at: string;
};

type SyncRow = {
  project_id: number;
  field_id: number;
  scanned: number;
  truncated: boolean;
  synced_at: string;
  duration_ms: number | null;
  source: string;
  last_error: string | null;
  last_attempt_at: string | null;
};

const CLIENT_COLUMNS = "value,name,codes,tickets,issue_id,first_seen,last_synced_at";
const SYNC_COLUMNS =
  "project_id,field_id,scanned,truncated,synced_at,duration_ms,source,last_error,last_attempt_at";

/* Demo mode: the same shapes, in process memory. */
const globalForClients = globalThis as unknown as {
  __taskTornadoRedmineClients?: ClientCatalogue;
};

function memory(): ClientCatalogue {
  globalForClients.__taskTornadoRedmineClients ??= { clients: [], sync: null };
  return globalForClients.__taskTornadoRedmineClients;
}

function mapClient(row: ClientRow): RedmineClient {
  return {
    value: row.value,
    name: row.name || row.value,
    codes: Array.isArray(row.codes) ? row.codes : [],
    tickets: Number(row.tickets) || 0,
    issueId: row.issue_id,
    firstSeen: row.first_seen,
    lastSyncedAt: row.last_synced_at,
  };
}

function mapSync(row: SyncRow | null): RedmineClientSync | null {
  if (!row) return null;
  return {
    projectId: Number(row.project_id) || CLIENT_PROJECT_ID,
    fieldId: Number(row.field_id) || CLIENT_FIELD_ID,
    scanned: Number(row.scanned) || 0,
    truncated: Boolean(row.truncated),
    syncedAt: row.synced_at,
    durationMs: row.duration_ms,
    source: (row.source as ClientSyncSource) ?? "manual",
    lastError: row.last_error,
    lastAttemptAt: row.last_attempt_at,
  };
}

/** The stored list. Nothing here calls Redmine. */
export async function readClientCatalogue(): Promise<ClientCatalogue> {
  if (!isSupabaseConfigured) {
    const stored = memory();
    return { clients: sortClients(stored.clients), sync: stored.sync };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const [clientsResult, syncResult] = await Promise.all([
      supabase.from("redmine_clients").select(CLIENT_COLUMNS).limit(5000),
      supabase.from("redmine_client_sync").select(SYNC_COLUMNS).eq("scope", SCOPE).maybeSingle(),
    ]);

    if (clientsResult.error) {
      console.error("[redmine-clients] read failed", clientsResult.error.message);
      return { clients: [], sync: null };
    }

    const clients = ((clientsResult.data ?? []) as ClientRow[]).map(mapClient);
    return {
      clients: sortClients(clients),
      sync: syncResult.error ? null : mapSync((syncResult.data ?? null) as SyncRow | null),
    };
  } catch (cause) {
    console.error("[redmine-clients] read failed", cause);
    return { clients: [], sync: null };
  }
}

/**
 * Replaces the stored list with what the scan found.
 *
 * First-seen dates survive an upsert because they are not part of the payload.
 * Values that disappeared from Redmine are deleted — but only when the scan ran
 * to the end, since a truncated scan simply never looked at the older tickets.
 */
async function writeCatalogue(
  found: RedmineClientFound[],
  meta: {
    projectId: number;
    fieldId: number;
    scanned: number;
    truncated: boolean;
    durationMs: number | null;
    source: ClientSyncSource;
  },
): Promise<boolean> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const stored = memory();
    const firstSeen = new Map(stored.clients.map((client) => [client.value, client.firstSeen]));
    globalForClients.__taskTornadoRedmineClients = {
      clients: found.map((client) => ({
        ...client,
        firstSeen: firstSeen.get(client.value) ?? now,
        lastSyncedAt: now,
      })),
      sync: {
        projectId: meta.projectId,
        fieldId: meta.fieldId,
        scanned: meta.scanned,
        truncated: meta.truncated,
        syncedAt: now,
        durationMs: meta.durationMs,
        source: meta.source,
        lastError: null,
        lastAttemptAt: now,
      },
    };
    return true;
  }

  try {
    return await runWithServiceRole(async () => {
      const supabase = await createSupabaseServerClient();

      for (let index = 0; index < found.length; index += WRITE_CHUNK) {
        const rows = found.slice(index, index + WRITE_CHUNK).map((client) => ({
          value: client.value,
          name: client.name,
          codes: client.codes,
          tickets: client.tickets,
          issue_id: client.issueId,
          last_synced_at: now,
        }));
        const { error } = await supabase
          .from("redmine_clients")
          .upsert(rows, { onConflict: "value" });
        if (error) {
          console.error("[redmine-clients] write failed", error.message);
          return false;
        }
      }

      if (!meta.truncated) {
        const { data: existing, error: readError } = await supabase
          .from("redmine_clients")
          .select("value");
        if (readError) {
          console.error("[redmine-clients] diff failed", readError.message);
          return false;
        }

        const keep = new Set(found.map((client) => client.value));
        const gone = ((existing ?? []) as { value: string }[])
          .map((row) => row.value)
          .filter((value) => !keep.has(value));

        for (let index = 0; index < gone.length; index += WRITE_CHUNK) {
          const { error } = await supabase
            .from("redmine_clients")
            .delete()
            .in("value", gone.slice(index, index + WRITE_CHUNK));
          if (error) {
            console.error("[redmine-clients] prune failed", error.message);
            return false;
          }
        }
      }

      const { error: syncError } = await supabase.from("redmine_client_sync").upsert(
        {
          scope: SCOPE,
          project_id: meta.projectId,
          field_id: meta.fieldId,
          scanned: meta.scanned,
          truncated: meta.truncated,
          synced_at: now,
          duration_ms: meta.durationMs,
          source: meta.source,
          last_error: null,
          last_attempt_at: now,
        },
        { onConflict: "scope" },
      );

      if (syncError) {
        console.error("[redmine-clients] sync row failed", syncError.message);
        return false;
      }
      return true;
    });
  } catch (cause) {
    console.error("[redmine-clients] write failed", cause);
    return false;
  }
}

/** A failed scan keeps the previous list and records why. */
async function recordSyncFailure(message: string): Promise<void> {
  const now = new Date().toISOString();
  const trimmed = message.slice(0, 300);

  if (!isSupabaseConfigured) {
    const stored = memory();
    if (stored.sync) {
      stored.sync.lastError = trimmed;
      stored.sync.lastAttemptAt = now;
    } else {
      stored.sync = {
        projectId: CLIENT_PROJECT_ID,
        fieldId: CLIENT_FIELD_ID,
        scanned: 0,
        truncated: false,
        syncedAt: now,
        durationMs: null,
        source: "manual",
        lastError: trimmed,
        lastAttemptAt: now,
      };
    }
    return;
  }

  try {
    await runWithServiceRole(async () => {
      const supabase = await createSupabaseServerClient();
      await supabase
        .from("redmine_client_sync")
        .upsert(
          { scope: SCOPE, last_error: trimmed, last_attempt_at: now },
          { onConflict: "scope" },
        );
    });
  } catch (cause) {
    console.error("[redmine-clients] failure write failed", cause);
  }
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type ClientSyncResult =
  | { ok: true; clients: number; scanned: number; truncated: boolean; durationMs: number }
  | { ok: false; reason: "not_connected" | "failed" | "empty"; message: string };

/**
 * Reads Redmine now and stores the result.
 *
 * The key is the caller's own (Redmine connections are per person), so anybody
 * who may change tickets may refresh the shared list. Failures never wipe the
 * previous capture: a bad minute at Redmine must not turn a correct list into
 * an empty one.
 */
export async function runClientSync(
  userId: string,
  source: ClientSyncSource = "manual",
): Promise<ClientSyncResult> {
  const record = await getIntegration(userId, "redmine");
  if (!record?.baseUrl) {
    return { ok: false, reason: "not_connected", message: "Redmine is not connected." };
  }

  const projectId = readPositiveInt(record.config?.projectId, CLIENT_PROJECT_ID);
  const fieldId = readPositiveInt(record.config?.clientFieldId, CLIENT_FIELD_ID);
  const started = Date.now();

  try {
    const scan = await scanClients(
      { baseUrl: record.baseUrl, apiKey: record.secret },
      { projectId, fieldId },
    );
    const durationMs = Date.now() - started;

    if (scan.clients.length === 0) {
      const message =
        "No client values were found. Check the project and client field ids in Settings.";
      await recordSyncFailure(message);
      return { ok: false, reason: "empty", message };
    }

    const stored = await writeCatalogue(scan.clients, {
      projectId,
      fieldId,
      scanned: scan.scanned,
      truncated: scan.truncated,
      durationMs,
      source,
    });
    if (!stored) {
      const message = "The scan worked, but the client list could not be saved.";
      await recordSyncFailure(message);
      return { ok: false, reason: "failed", message };
    }

    return {
      ok: true,
      clients: scan.clients.length,
      scanned: scan.scanned,
      truncated: scan.truncated,
      durationMs,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Redmine did not answer the scan.";
    console.error("[redmine-clients] sync failed", message);
    await recordSyncFailure(message);
    return { ok: false, reason: "failed", message };
  }
}
