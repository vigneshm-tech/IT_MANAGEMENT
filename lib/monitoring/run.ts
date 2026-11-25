import { listApplications } from "../iis/repository";
import { sendMail } from "../email/smtp";
import {
  UP_LATENCY_LIMIT_MS,
  buildTargets,
  planAlerts,
  readFailure,
  readResponse,
  type MonitorStatus,
  type MonitorTarget,
  type ProbeResult,
} from "./core";
import {
  markAlerted,
  readChecks,
  readMonitorSettings,
  recordChecks,
  type StoredCheck,
} from "./store";

/**
 * One round of checks, end to end.
 *
 * Read the URLs from the IIS register, probe them, keep the previous state so a
 * change can be seen, store the new state, then mail whoever asked to be told.
 * The mail is deliberately the last step: a broken SMTP server must not stop the
 * board from showing that a site is down.
 */

const PROBE_TIMEOUT_MS = UP_LATENCY_LIMIT_MS;
/** Six at a time: enough to feel instant, few enough not to look like an attack. */
const CONCURRENCY = 6;
/** A serverless function has its own opinion about how long this may take. Past
 *  this, the remaining URLs keep their previous answer instead of the round
 *  being killed halfway through. */
const ROUND_BUDGET_MS = 45_000;

function reasonFor(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return `No answer within ${Math.round(PROBE_TIMEOUT_MS / 1000)} seconds.`;
    }
    const code = (error as Error & { cause?: { code?: string } }).cause?.code;
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "That host name does not resolve.";
    if (code === "ECONNREFUSED") return "The connection was refused.";
    if (code === "ECONNRESET") return "The connection was closed before it answered.";
    if (/certificate|self.signed/i.test(error.message)) return "The TLS certificate is not trusted.";
    return error.message.slice(0, 160);
  }
  return "The check failed.";
}

export async function probe(url: string): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: {
        // Some sites answer differently to a browser; this is honest about being
        // a monitor without pretending to be one.
        "user-agent": "TaskTornado-Monitor/1.0 (+uptime check)",
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    const latency = Date.now() - started;
    // The body is never read: the status is the answer, and downloading pages
    // would make the check cost the site real bandwidth.
    await response.body?.cancel().catch(() => undefined);
    return readResponse(response.status, latency);
  } catch (error) {
    return readFailure(reasonFor(error), Date.now() - started);
  }
}

async function probeAll(targets: MonitorTarget[]): Promise<Map<string, ProbeResult>> {
  const results = new Map<string, ProbeResult>();
  const started = Date.now();
  for (let start = 0; start < targets.length; start += CONCURRENCY) {
    if (Date.now() - started > ROUND_BUDGET_MS) break;
    const slice = targets.slice(start, start + CONCURRENCY);
    const answered = await Promise.all(slice.map(async (target) => [target.key, await probe(target.url)] as const));
    for (const [key, result] of answered) results.set(key, result);
  }
  return results;
}

export type RunSummary = {
  statuses: MonitorStatus[];
  /** What happened to the alerts, in words the page can show. */
  alerts: string | null;
};

/**
 * How long ago the newest stored answer was taken, in seconds.
 *
 * `null` when nothing has ever been checked. The scheduler uses this to honour
 * the interval the IT Manager set: a job that fires every minute must not probe
 * a URL that is meant to be checked every ten.
 */
export function newestAgeSeconds(checks: Iterable<StoredCheck>, now = Date.now()): number | null {
  let newest = 0;
  for (const check of checks) {
    const at = new Date(check.checkedAt).getTime();
    if (!Number.isNaN(at)) newest = Math.max(newest, at);
  }
  return newest === 0 ? null : Math.max(0, Math.round((now - newest) / 1000));
}

/** The board without probing: whatever the last check recorded. */
export async function readBoard(): Promise<MonitorStatus[]> {
  const [applications, checks, settings] = await Promise.all([
    listApplications(true),
    readChecks(),
    readMonitorSettings(),
  ]);
  return mergeStatuses(buildTargets(applications, settings.protocolFilter), checks);
}

function mergeStatuses(
  targets: MonitorTarget[],
  checks: Map<string, StoredCheck>,
): MonitorStatus[] {
  const rows: MonitorStatus[] = targets.map((target) => {
    const check = checks.get(target.key);
    return {
      ...target,
      ok: check ? check.ok : null,
      statusCode: check?.statusCode ?? null,
      latencyMs: check?.latencyMs ?? null,
      error: check?.error ?? null,
      checkedAt: check?.checkedAt ?? null,
      since: check?.since ?? null,
      alerted: check?.alerted ?? false,
    };
  });

  // Down first, then never checked, then up — the top of the page is the part
  // that needs someone.
  const rank = (row: MonitorStatus) => (row.ok === false ? 0 : row.ok === null ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || a.url.localeCompare(b.url));
}

export async function runChecks(): Promise<RunSummary> {
  const [applications, previous, settings] = await Promise.all([
    listApplications(true),
    readChecks(),
    readMonitorSettings(),
  ]);

  const targets = buildTargets(applications, settings.protocolFilter);
  if (targets.length === 0) return { statuses: [], alerts: null };

  const results = await probeAll(targets);
  const now = new Date().toISOString();
  // A URL the round ran out of time for keeps its last answer: silence is not
  // evidence that a site is down.
  const answered = targets.filter((target) => results.has(target.key));

  const plan = planAlerts(
    new Map([...previous].map(([key, row]) => [key, { ok: row.ok, alerted: row.alerted }])),
    answered.map((target) => ({ target, result: results.get(target.key)! })),
  );

  // The new state, keeping `since` for a run that changed nothing.
  const rows: StoredCheck[] = answered.map((target) => {
    const result = results.get(target.key)!;
    const before = previous.get(target.key);
    const sameState = before ? before.ok === result.ok : false;
    return {
      key: target.key,
      ok: result.ok,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      error: result.error,
      checkedAt: now,
      since: sameState && before ? before.since : now,
      alerted: result.ok ? false : before && before.ok === false ? before.alerted : false,
    };
  });

  if (rows.length > 0) await recordChecks(rows);

  let alerts: string | null = null;
  const wantsMail = settings.alertsEnabled && settings.recipientEmails.length > 0;

  if (plan.down.length === 0 && plan.recovered.length === 0) {
    alerts = null;
  } else if (!wantsMail) {
    alerts = settings.alertsEnabled
      ? "No alert recipients are configured, so nothing was emailed."
      : "Alerts are turned off.";
  } else {
    const failures: string[] = [];
    const failedKeys = new Set<string>();
    for (const target of plan.down) {
      const result = results.get(target.key);
      const sent = await sendMail({
        to: settings.recipientEmails,
        subject: `${target.site} is down — ${target.url}`,
        text: [
          `${target.site} (${target.server}) is not answering.`,
          "",
          `URL: ${target.url}`,
          `What the check saw: ${result?.error ?? "no answer"}`,
          `Checked: ${now}`,
          "",
          "Monitoring will say so again when it comes back.",
        ].join("\n"),
      });
      if (sent.ok) continue;
      failures.push(`${target.site}: ${sent.error}`);
      failedKeys.add(target.key);
    }

    // Only the outages that were actually announced get the flag, so a mail
    // that failed is attempted again on the next run instead of being lost.
    const announced = plan.down.filter((target) => !failedKeys.has(target.key));
    await markAlerted(announced.map((target) => target.key));

    for (const target of plan.recovered) {
      const sent = await sendMail({
        to: settings.recipientEmails,
        subject: `${target.site} is back up — ${target.url}`,
        text: [
          `${target.site} (${target.server}) is answering again.`,
          "",
          `URL: ${target.url}`,
          `Checked: ${now}`,
        ].join("\n"),
      });
      if (!sent.ok) failures.push(`${target.site}: ${sent.error}`);
    }

    await markAlerted(plan.recovered.map((target) => target.key), false);

    if (failures.length > 0) {
      alerts = `An alert could not be sent — ${failures[0]}`;
    } else {
      const count = plan.down.length + plan.recovered.length;
      alerts = `Sent ${count} alert email${count === 1 ? "" : "s"} to ${settings.recipientEmails.join(", ")}.`;
    }
  }

  const next = new Map(previous);
  for (const row of rows) next.set(row.key, row);
  return { statuses: mergeStatuses(targets, next), alerts };
}
