import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import {
  DEFAULT_CHECK_INTERVAL_SECONDS,
  MAX_CHECK_INTERVAL_SECONDS,
  MIN_CHECK_INTERVAL_SECONDS,
  isProtocolFilter,
  type MaintenanceWindow,
  type MonitorTarget,
  type ProbePhases,
  type ProtocolFilter,
  type UptimeSummary,
} from "./core";

/**
 * Everything Monitoring persists.
 *
 * Three kinds of row: the *last* answer per URL (what the board shows), the
 * history of answers (what uptime is computed from), and the incidents those
 * answers added up to. Plus the settings row and a one-row lease that keeps two
 * tabs from probing at the same time.
 *
 * Every reader falls back to memory when Supabase is not configured, so a demo
 * workspace — or a missing migration — shows an honest empty board instead of a
 * 500.
 */

const ROW_ID = "default";
const ROUND_ID = "round";
const HISTORY_RETENTION_DAYS = 30;
const MEMORY_HISTORY_LIMIT = 20_000;

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

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
  /** True once the outage has been escalated to the second list. */
  escalated: boolean;
  /** True once the certificate warning has been emailed. */
  certAlerted: boolean;
  /** The certificate's expiry, when the site presented one. */
  certExpiresAt: string | null;
  /** 1, or 2 when a failure was confirmed by a second attempt. */
  attempts: number;
  phases: ProbePhases | null;
};

export type MonitorSettings = {
  recipientEmails: string[];
  alertsEnabled: boolean;
  /** How often the board checks by itself, in seconds. */
  intervalSeconds: number;
  /** Which schemes are watched: the binding list filtered to https, http, or both. */
  protocolFilter: ProtocolFilter;
  /** Trust internal / self-signed certificates (TLS-inspecting networks). */
  allowInsecureTls: boolean;
  /** A 401/403 from a site behind Windows auth is the site working. */
  treatAuthAsUp: boolean;
  escalationEmails: string[];
  escalateAfterMinutes: number;
  webhookUrl: string;
  maintenance: MaintenanceWindow;
  /** Shared secret for the read-only summary endpoint; empty disables it. */
  summaryToken: string;
  updatedAt: string | null;
};

export const DEFAULT_MONITOR_SETTINGS: MonitorSettings = {
  recipientEmails: [],
  alertsEnabled: true,
  intervalSeconds: DEFAULT_CHECK_INTERVAL_SECONDS,
  protocolFilter: "all",
  allowInsecureTls: false,
  treatAuthAsUp: false,
  escalationEmails: [],
  escalateAfterMinutes: 15,
  webhookUrl: "",
  maintenance: { from: null, to: null, note: "" },
  summaryToken: "",
  updatedAt: null,
};

export type HistoryRow = {
  key: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
  certExpiresAt: string | null;
};

export type Incident = {
  id: string;
  key: string;
  site: string;
  url: string;
  startedAt: string;
  endedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  note: string;
};

/* -------------------------------------------------------------------------- */
/*  Memory fallback                                                            */
/* -------------------------------------------------------------------------- */

const globalForMonitoring = globalThis as unknown as {
  __taskTornadoChecks?: Map<string, StoredCheck>;
  __taskTornadoMonitorSettings?: MonitorSettings;
  __taskTornadoHistory?: HistoryRow[];
  __taskTornadoIncidents?: Incident[];
  __taskTornadoLease?: number;
};

function memoryChecks(): Map<string, StoredCheck> {
  if (!globalForMonitoring.__taskTornadoChecks) {
    globalForMonitoring.__taskTornadoChecks = new Map();
  }
  return globalForMonitoring.__taskTornadoChecks;
}

function memoryHistory(): HistoryRow[] {
  if (!globalForMonitoring.__taskTornadoHistory) globalForMonitoring.__taskTornadoHistory = [];
  return globalForMonitoring.__taskTornadoHistory;
}

function memoryIncidents(): Incident[] {
  if (!globalForMonitoring.__taskTornadoIncidents) globalForMonitoring.__taskTornadoIncidents = [];
  return globalForMonitoring.__taskTornadoIncidents;
}

let historyPurgedAt = 0;

/* -------------------------------------------------------------------------- */
/*  The last answer per URL                                                    */
/* -------------------------------------------------------------------------- */

type CheckRow = {
  target_key: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
  checked_at: string;
  since: string;
  alerted: boolean;
  escalated: boolean | null;
  cert_alerted: boolean | null;
  cert_expires_at: string | null;
  attempts: number | null;
  phases: ProbePhases | null;
};

const CHECK_COLUMNS =
  "target_key,ok,status_code,latency_ms,error,checked_at,since,alerted,escalated,cert_alerted,cert_expires_at,attempts,phases";

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
    escalated: row.escalated ?? false,
    certAlerted: row.cert_alerted ?? false,
    certExpiresAt: row.cert_expires_at,
    attempts: row.attempts ?? 1,
    phases: row.phases ?? null,
  };
}

export async function readChecks(): Promise<Map<string, StoredCheck>> {
  if (!isSupabaseConfigured) return new Map(memoryChecks());

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("monitoring_checks").select(CHECK_COLUMNS);

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
      escalated: row.escalated,
      cert_alerted: row.certAlerted,
      cert_expires_at: row.certExpiresAt,
      attempts: row.attempts,
      phases: row.phases,
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
  const { error } = await supabase.from("monitoring_checks").update({ alerted }).in("target_key", keys);
  if (error) console.error("[monitoring] alert flag write failed", error);
}

export async function markEscalated(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  if (!isSupabaseConfigured) {
    for (const key of keys) {
      const row = memoryChecks().get(key);
      if (row) memoryChecks().set(key, { ...row, escalated: true });
    }
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("monitoring_checks").update({ escalated: true }).in("target_key", keys);
  if (error) console.error("[monitoring] escalation flag write failed", error);
}

export async function markCertAlerted(keys: string[], flagged = true): Promise<void> {
  if (keys.length === 0) return;

  if (!isSupabaseConfigured) {
    for (const key of keys) {
      const row = memoryChecks().get(key);
      if (row) memoryChecks().set(key, { ...row, certAlerted: flagged });
    }
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("monitoring_checks").update({ cert_alerted: flagged }).in("target_key", keys);
  if (error) console.error("[monitoring] certificate flag write failed", error);
}

/* -------------------------------------------------------------------------- */
/*  History and uptime                                                         */
/* -------------------------------------------------------------------------- */

export async function appendHistory(rows: HistoryRow[]): Promise<void> {
  if (rows.length === 0) return;

  if (!isSupabaseConfigured) {
    const history = memoryHistory();
    history.push(...rows);
    if (history.length > MEMORY_HISTORY_LIMIT) history.splice(0, history.length - MEMORY_HISTORY_LIMIT);
    return;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("monitoring_history").insert(
      rows.map((row) => ({
        target_key: row.key,
        ok: row.ok,
        status_code: row.statusCode,
        latency_ms: row.latencyMs,
        error: row.error,
        checked_at: row.checkedAt,
        cert_expires_at: row.certExpiresAt,
      })),
    );
    if (error) throw error;
  } catch (error) {
    console.error("[monitoring] history write failed", error);
  }
}

/** Drop history older than the retention window; at most once an hour. */
export async function purgeHistory(now = Date.now()): Promise<void> {
  if (now - historyPurgedAt < 3_600_000) return;
  historyPurgedAt = now;
  const cutoff = new Date(now - HISTORY_RETENTION_DAYS * 86_400_000).toISOString();

  if (!isSupabaseConfigured) {
    const kept = memoryHistory().filter((row) => row.checkedAt >= cutoff);
    globalForMonitoring.__taskTornadoHistory = kept;
    return;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("monitoring_history").delete().lt("checked_at", cutoff);
    if (error) throw error;
  } catch (error) {
    console.error("[monitoring] history purge failed", error);
  }
}

type UptimeRow = {
  target_key: string;
  checks: number | string;
  up_checks: number | string;
  avg_latency: number | string | null;
  p95_latency: number | string | null;
  last_checked: string | null;
};

function toSummary(row: UptimeRow): UptimeSummary {
  return {
    key: row.target_key,
    checks: Number(row.checks) || 0,
    up: Number(row.up_checks) || 0,
    avgLatencyMs: row.avg_latency === null ? null : Math.round(Number(row.avg_latency)),
    p95LatencyMs: row.p95_latency === null ? null : Math.round(Number(row.p95_latency)),
    lastCheckedAt: row.last_checked,
  };
}

/** Uptime and latency for the given URLs over the last `days`. */
export async function readUptime(keys: string[], days: number): Promise<Map<string, UptimeSummary>> {
  if (keys.length === 0) return new Map();
  const since = Date.now() - Math.max(1, days) * 86_400_000;

  if (!isSupabaseConfigured) {
    const byKey = new Map<string, { checks: number; up: number; latencies: number[]; last: string | null }>();
    for (const row of memoryHistory()) {
      if (!keys.includes(row.key)) continue;
      if (new Date(row.checkedAt).getTime() < since) continue;
      const entry = byKey.get(row.key) ?? { checks: 0, up: 0, latencies: [], last: null };
      entry.checks += 1;
      if (row.ok) entry.up += 1;
      if (typeof row.latencyMs === "number") entry.latencies.push(row.latencyMs);
      if (!entry.last || row.checkedAt > entry.last) entry.last = row.checkedAt;
      byKey.set(row.key, entry);
    }

    const summaries = new Map<string, UptimeSummary>();
    for (const [key, entry] of byKey) {
      const sorted = [...entry.latencies].sort((a, b) => a - b);
      summaries.set(key, {
        key,
        checks: entry.checks,
        up: entry.up,
        avgLatencyMs: sorted.length === 0 ? null : Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
        p95LatencyMs: sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
        lastCheckedAt: entry.last,
      });
    }
    return summaries;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("monitoring_uptime", { keys, days: Math.max(1, days) });
    if (error) throw error;
    return new Map(((data ?? []) as UptimeRow[]).map((row) => [row.target_key, toSummary(row)]));
  } catch (error) {
    console.error("[monitoring] uptime read failed", error);
    return new Map();
  }
}

/* -------------------------------------------------------------------------- */
/*  Incidents                                                                  */
/* -------------------------------------------------------------------------- */

type IncidentRow = {
  id: string;
  target_key: string;
  site: string;
  url: string;
  started_at: string;
  ended_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  note: string | null;
};

function incidentFromRow(row: IncidentRow): Incident {
  return {
    id: row.id,
    key: row.target_key,
    site: row.site,
    url: row.url,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedBy: row.acknowledged_by,
    note: row.note ?? "",
  };
}

const INCIDENT_COLUMNS =
  "id,target_key,site,url,started_at,ended_at,acknowledged_at,acknowledged_by,note";

export async function openIncident(target: MonitorTarget, startedAt: string): Promise<void> {
  if (!isSupabaseConfigured) {
    const incidents = memoryIncidents();
    const open = incidents.find((row) => row.key === target.key && !row.endedAt);
    if (open) return;
    incidents.push({
      id: `mem-${target.key}-${startedAt}`,
      key: target.key,
      site: target.site,
      url: target.url,
      startedAt,
      endedAt: null,
      acknowledgedAt: null,
      acknowledgedBy: null,
      note: "",
    });
    if (incidents.length > 2_000) incidents.splice(0, incidents.length - 2_000);
    return;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("monitoring_incidents")
      .select("id")
      .eq("target_key", target.key)
      .is("ended_at", null)
      .limit(1);
    if (data && data.length > 0) return;

    const { error } = await supabase.from("monitoring_incidents").insert({
      target_key: target.key,
      site: target.site,
      url: target.url,
      started_at: startedAt,
    });
    if (error) throw error;
  } catch (error) {
    console.error("[monitoring] incident open failed", error);
  }
}

export async function closeIncidents(keys: string[], endedAt: string): Promise<void> {
  if (keys.length === 0) return;

  if (!isSupabaseConfigured) {
    for (const incident of memoryIncidents()) {
      if (keys.includes(incident.key) && !incident.endedAt) incident.endedAt = endedAt;
    }
    return;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("monitoring_incidents")
      .update({ ended_at: endedAt })
      .in("target_key", keys)
      .is("ended_at", null);
    if (error) throw error;
  } catch (error) {
    console.error("[monitoring] incident close failed", error);
  }
}

export async function readIncidents(keys: string[], limitPerSite = 3): Promise<Map<string, Incident[]>> {
  const grouped = new Map<string, Incident[]>();
  if (keys.length === 0) return grouped;

  if (!isSupabaseConfigured) {
    for (const incident of [...memoryIncidents()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
      if (!keys.includes(incident.key)) continue;
      const list = grouped.get(incident.key) ?? [];
      if (list.length < limitPerSite) list.push({ ...incident });
      grouped.set(incident.key, list);
    }
    return grouped;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("monitoring_incidents")
      .select(INCIDENT_COLUMNS)
      .in("target_key", keys)
      .order("started_at", { ascending: false })
      .limit(keys.length * limitPerSite);
    if (error) throw error;

    for (const row of (data ?? []) as IncidentRow[]) {
      const list = grouped.get(row.target_key) ?? [];
      if (list.length < limitPerSite) list.push(incidentFromRow(row));
      grouped.set(row.target_key, list);
    }
    return grouped;
  } catch (error) {
    console.error("[monitoring] incident read failed", error);
    return grouped;
  }
}

export async function acknowledgeIncident(id: string, userId: string, note: string): Promise<void> {
  const at = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const incident = memoryIncidents().find((row) => row.id === id);
    if (incident) {
      incident.acknowledgedAt = at;
      incident.acknowledgedBy = userId;
      incident.note = note;
    }
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("monitoring_incidents")
    .update({ acknowledged_at: at, acknowledged_by: userId, note })
    .eq("id", id);
  if (error) throw new Error("The incident could not be acknowledged.");
}

/* -------------------------------------------------------------------------- */
/*  One round at a time                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Take the round lease, or find someone else already holding it.
 *
 * A page open in three tabs, a scheduler and a curious manager would otherwise
 * run four identical rounds and write four identical rows. The lease is one row
 * with a timestamp: whoever moves it forward owns the next `seconds`.
 */
export async function acquireRoundLease(seconds: number, now = Date.now()): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const until = globalForMonitoring.__taskTornadoLease ?? 0;
    if (until > now) return false;
    globalForMonitoring.__taskTornadoLease = now + seconds * 1000;
    return true;
  }

  const stamp = new Date(now).toISOString();
  const cutoff = new Date(now - seconds * 1000).toISOString();

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("monitoring_rounds")
      .update({ started_at: stamp })
      .eq("id", ROUND_ID)
      .lt("started_at", cutoff)
      .select("id");

    if (error) throw error;
    if (data && data.length > 0) return true;

    const inserted = await supabase
      .from("monitoring_rounds")
      .insert({ id: ROUND_ID, started_at: stamp })
      .select("id");
    if (inserted.error) return false;
    return true;
  } catch (error) {
    // Without the table (or without permission) the check must still happen:
    // losing a duplicate round is better than losing monitoring.
    console.error("[monitoring] round lease failed", error);
    return true;
  }
}

/* -------------------------------------------------------------------------- */
/*  Settings                                                                   */
/* -------------------------------------------------------------------------- */

type SettingsRow = {
  recipient_emails: string[] | null;
  alerts_enabled: boolean | null;
  interval_seconds: number | null;
  protocol_filter: string | null;
  allow_insecure_tls: boolean | null;
  treat_auth_as_up: boolean | null;
  escalation_emails: string[] | null;
  escalate_after_minutes: number | null;
  webhook_url: string | null;
  maintenance_from: string | null;
  maintenance_to: string | null;
  maintenance_note: string | null;
  summary_token: string | null;
  updated_at: string | null;
};

const SETTINGS_COLUMNS =
  "recipient_emails,alerts_enabled,interval_seconds,protocol_filter,allow_insecure_tls,treat_auth_as_up,escalation_emails,escalate_after_minutes,webhook_url,maintenance_from,maintenance_to,maintenance_note,summary_token,updated_at";

function readInterval(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CHECK_INTERVAL_SECONDS;
  return Math.min(MAX_CHECK_INTERVAL_SECONDS, Math.max(MIN_CHECK_INTERVAL_SECONDS, Math.round(value)));
}

export async function readMonitorSettings(): Promise<MonitorSettings> {
  if (!isSupabaseConfigured) {
    return globalForMonitoring.__taskTornadoMonitorSettings ?? DEFAULT_MONITOR_SETTINGS;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("monitoring_settings")
      .select(SETTINGS_COLUMNS)
      .eq("id", ROW_ID)
      .maybeSingle<SettingsRow>();

    if (error) throw error;
    if (!data) return DEFAULT_MONITOR_SETTINGS;

    return {
      recipientEmails: data.recipient_emails ?? [],
      alertsEnabled: data.alerts_enabled ?? true,
      intervalSeconds: readInterval(data.interval_seconds),
      protocolFilter: isProtocolFilter(data.protocol_filter ?? "")
        ? (data.protocol_filter as ProtocolFilter)
        : "all",
      allowInsecureTls: data.allow_insecure_tls ?? false,
      treatAuthAsUp: data.treat_auth_as_up ?? false,
      escalationEmails: data.escalation_emails ?? [],
      escalateAfterMinutes: Math.max(1, data.escalate_after_minutes ?? 15),
      webhookUrl: data.webhook_url ?? "",
      maintenance: {
        from: data.maintenance_from,
        to: data.maintenance_to,
        note: data.maintenance_note ?? "",
      },
      summaryToken: data.summary_token ?? "",
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error("[monitoring] settings read failed", error);
    return DEFAULT_MONITOR_SETTINGS;
  }
}

export async function saveMonitorSettings(userId: string, settings: Omit<MonitorSettings, "updatedAt">): Promise<void> {
  const updatedAt = new Date().toISOString();
  const intervalSeconds = readInterval(settings.intervalSeconds);

  if (!isSupabaseConfigured) {
    globalForMonitoring.__taskTornadoMonitorSettings = { ...settings, intervalSeconds, updatedAt };
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("monitoring_settings").upsert(
    {
      id: ROW_ID,
      recipient_emails: settings.recipientEmails,
      alerts_enabled: settings.alertsEnabled,
      interval_seconds: intervalSeconds,
      protocol_filter: settings.protocolFilter,
      allow_insecure_tls: settings.allowInsecureTls,
      treat_auth_as_up: settings.treatAuthAsUp,
      escalation_emails: settings.escalationEmails,
      escalate_after_minutes: settings.escalateAfterMinutes,
      webhook_url: settings.webhookUrl,
      maintenance_from: settings.maintenance.from,
      maintenance_to: settings.maintenance.to,
      maintenance_note: settings.maintenance.note,
      summary_token: settings.summaryToken,
      updated_by: userId,
      updated_at: updatedAt,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[monitoring] settings save failed", error);
    throw new Error("The monitoring settings could not be saved. Please try again.");
  }
}
