import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * What the last check of each URL found, and who hears about it when it fails.
 *
 * The rows are the only state Monitoring keeps. The list of URLs is not stored:
 * it is derived from the IIS register every time, so a binding added or retired
 * in IIS is watched or forgotten without anyone maintaining a second list.
 */

export type StoredCheck = {
  key: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  /** ISO instant of the check that produced this row. */
  checkedAt: string;
  /** ISO instant of when the current state began. */
  since: string;
  /** True once a down alert has gone out for this outage. */
  alerted: boolean;
};

export type MonitorSettings = {
  recipientEmails: string[];
  alertsEnabled: boolean;
  updatedAt: string | null;
};

export const DEFAULT_MONITOR_SETTINGS: MonitorSettings = {
  recipientEmails: [],
  alertsEnabled: true,
  updatedAt: null,
};

const ROW_ID = "default";

const globalForMonitoring = globalThis as unknown as {
  __taskTornadoChecks?: Map<string, StoredCheck>;
  __taskTornadoMonitorSettings?: MonitorSettings;
};

function memoryChecks(): Map<string, StoredCheck> {
  if (!globalForMonitoring.__taskTornadoChecks) {
    globalForMonitoring.__taskTornadoChecks = new Map();
  }
  return globalForMonitoring.__taskTornadoChecks;
}

type CheckRow = {
  target_key: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
  checked_at: string;
  since: string;
  alerted: boolean;
};

function fromRow(row: CheckRow): StoredCheck {
  return {
    key: row.target_key,
    ok: row.ok,
    statusCode: row.status_code,
    latencyMs: row.latency_ms,
    error: row.error,
    checkedAt: row.checked_at,
    since: row.since,
    alerted: row.alerted,
  };
}

export async function readChecks(): Promise<Map<string, StoredCheck>> {
  if (!isSupabaseConfigured) return new Map(memoryChecks());

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("monitoring_checks")
      .select("target_key,ok,status_code,latency_ms,error,checked_at,since,alerted");

    if (error) throw error;
    return new Map(((data ?? []) as CheckRow[]).map((row) => [row.target_key, fromRow(row)]));
  } catch (error) {
    // A missing migration must not take the module down: an empty board reads as
    // "not checked yet" rather than as a page that crashed.
    console.error("[monitoring] check read failed", error);
    return new Map();
  }
}

export async function recordChecks(rows: StoredCheck[]): Promise<void> {
  if (rows.length === 0) return;

  if (!isSupabaseConfigured) {
    for (const row of rows) memoryChecks().set(row.key, row);
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("monitoring_checks").upsert(
    rows.map((row) => ({
      target_key: row.key,
      ok: row.ok,
      status_code: row.statusCode,
      latency_ms: row.latencyMs,
      error: row.error,
      checked_at: row.checkedAt,
      since: row.since,
      alerted: row.alerted,
    })),
    { onConflict: "target_key" },
  );

  if (error) console.error("[monitoring] check write failed", error);
}

/** Remember that these outages have been emailed, so the next check stays quiet. */
export async function markAlerted(keys: string[], alerted = true): Promise<void> {
  if (keys.length === 0) return;

  if (!isSupabaseConfigured) {
    for (const key of keys) {
      const row = memoryChecks().get(key);
      if (row) memoryChecks().set(key, { ...row, alerted });
    }
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("monitoring_checks")
    .update({ alerted })
    .in("target_key", keys);

  if (error) console.error("[monitoring] alert flag write failed", error);
}

type SettingsRow = {
  recipient_emails: string[] | null;
  alerts_enabled: boolean | null;
  updated_at: string | null;
};

export async function readMonitorSettings(): Promise<MonitorSettings> {
  if (!isSupabaseConfigured) {
    return globalForMonitoring.__taskTornadoMonitorSettings ?? DEFAULT_MONITOR_SETTINGS;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("monitoring_settings")
      .select("recipient_emails,alerts_enabled,updated_at")
      .eq("id", ROW_ID)
      .maybeSingle<SettingsRow>();

    if (error) throw error;
    if (!data) return DEFAULT_MONITOR_SETTINGS;

    return {
      recipientEmails: data.recipient_emails ?? [],
      alertsEnabled: data.alerts_enabled ?? true,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error("[monitoring] settings read failed", error);
    return DEFAULT_MONITOR_SETTINGS;
  }
}

export async function saveMonitorSettings(
  userId: string,
  settings: { recipientEmails: string[]; alertsEnabled: boolean },
): Promise<void> {
  const updatedAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    globalForMonitoring.__taskTornadoMonitorSettings = { ...settings, updatedAt };
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("monitoring_settings").upsert(
    {
      id: ROW_ID,
      recipient_emails: settings.recipientEmails,
      alerts_enabled: settings.alertsEnabled,
      updated_by: userId,
      updated_at: updatedAt,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[monitoring] settings save failed", error);
    throw new Error("The alert settings could not be saved. Please try again.");
  }
}
