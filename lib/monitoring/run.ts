import { listApplications } from "../iis/repository";
import { sendMail } from "../email/smtp";
import {
  CERT_WARN_DAYS,
  CONFIRM_DELAY_MS,
  ROUND_BUDGET_MS,
  buildTargets,
  certDaysLeft,
  describeCert,
  escalationDue,
  inMaintenance,
  planAlerts,
  timeoutFor,
  type MonitorStatus,
  type MonitorTarget,
  type ProbeResult,
  type UptimeSummary,
} from "./core";
import { probeUrl } from "./probe";
import {
  acknowledgeIncident,
  acquireRoundLease,
  appendHistory,
  closeIncidents,
  markAlerted,
  markCertAlerted,
  markEscalated,
  openIncident,
  purgeHistory,
  readChecks,
  readIncidents,
  readMonitorSettings,
  readUptime,
  recordChecks,
  type Incident,
  type MonitorSettings,
  type StoredCheck,
} from "./store";

/**
 * One round of checks, end to end.
 *
 * Read the URLs from the IIS register, probe them, keep the previous state so a
 * change can be seen, store the new state and the history behind it, then tell
 * whoever asked to be told. The mail is deliberately the last step: a broken
 * SMTP server must not stop the board from showing that a site is down.
 *
 * Three things make a round cheap: the IIS register is cached for half a minute,
 * a site that answered last time is given three seconds rather than eight, and a
 * single failure is confirmed before it is believed. Three things make it safe:
 * only one round runs at a time, a round that runs long leaves untouched URLs at
 * their previous answer, and a maintenance window silences the mail without
 * hiding the state.
 */

/** Ten at a time, one per host: enough to feel instant, few enough to be polite. */
const CONCURRENCY = 10;
const REGISTER_TTL_MS = 30_000;

let registerCache: { at: number; applications: Awaited<ReturnType<typeof listApplications>> } | null = null;

/** The IIS register, at most thirty seconds old. */
async function cachedApplications() {
  if (registerCache && Date.now() - registerCache.at < REGISTER_TTL_MS) return registerCache.applications;
  const applications = await listApplications(true);
  registerCache = { at: Date.now(), applications };
  return applications;
}

/** Called when an IIS row changes, so the board does not wait out the cache. */
export function forgetRegister() {
  registerCache = null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function probeTarget(target: MonitorTarget, options: { timeoutMs: number; insecureTls: boolean; treatAuthAsUp: boolean }): Promise<ProbeResult> {
  const first = await probeUrl(target.url, options);
  if (first.ok) return first;

  // One failure is a suspicion. Wait a moment and ask again before calling it
  // down — a dropped packet should not page anyone.
  await sleep(CONFIRM_DELAY_MS);
  const second = await probeUrl(target.url, options);
  return { ...second, attempts: 2, certExpiresAt: second.certExpiresAt ?? first.certExpiresAt };
}

/**
 * Probe every target, a wave at a time.
 *
 * Ten in flight, but never two to the same host: two schemes of the same site
 * would otherwise race each other through a single IIS worker.
 */
async function probeAll(
  targets: MonitorTarget[],
  settings: MonitorSettings,
  previous: Map<string, StoredCheck>,
): Promise<Map<string, ProbeResult>> {
  const results = new Map<string, ProbeResult>();
  const started = Date.now();
  const wanted = [...targets];
  const inFlightHosts = new Set<string>();
  const queue = wanted.slice();

  const hostOf = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };

  const worker = async () => {
    for (;;) {
      if (Date.now() - started > ROUND_BUDGET_MS) return;
      const index = queue.findIndex((target) => !inFlightHosts.has(hostOf(target.url)));
      if (index === -1) {
        if (queue.length === 0) return;
        await sleep(25);
        continue;
      }
      const [target] = queue.splice(index, 1);
      const host = hostOf(target.url);
      inFlightHosts.add(host);
      try {
        results.set(
          target.key,
          await probeTarget(target, {
            timeoutMs: timeoutFor(previous.get(target.key)),
            insecureTls: settings.allowInsecureTls,
            treatAuthAsUp: settings.treatAuthAsUp,
          }),
        );
      } finally {
        inFlightHosts.delete(host);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  return results;
}

export type RunSummary = {
  statuses: MonitorStatus[];
  /** What happened to the alerts, in words the page can show. */
  alerts: string | null;
  /** True when another round was already running. */
  skipped?: boolean;
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

function mergeStatuses(targets: MonitorTarget[], checks: Map<string, StoredCheck>): MonitorStatus[] {
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
      escalated: check?.escalated ?? false,
      certExpiresAt: check?.certExpiresAt ?? null,
      attempts: check?.attempts ?? 1,
      phases: check?.phases ?? null,
    };
  });

  // Down first, then never checked, then up — the top of the page is the part
  // that needs someone.
  const rank = (row: MonitorStatus) => (row.ok === false ? 0 : row.ok === null ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || a.url.localeCompare(b.url));
}

/** The board without probing: whatever the last check recorded. */
export async function readBoard(): Promise<MonitorStatus[]> {
  const [applications, checks, settings] = await Promise.all([
    cachedApplications(),
    readChecks(),
    readMonitorSettings(),
  ]);
  return mergeStatuses(buildTargets(applications, settings.protocolFilter), checks);
}

/** Everything the board page needs in one go. */
export async function readBoardView(): Promise<{
  statuses: MonitorStatus[];
  uptime24h: Map<string, UptimeSummary>;
  uptime7d: Map<string, UptimeSummary>;
  incidents: Map<string, Incident[]>;
  maintenance: boolean;
}> {
  const [applications, checks, settings] = await Promise.all([
    cachedApplications(),
    readChecks(),
    readMonitorSettings(),
  ]);
  const targets = buildTargets(applications, settings.protocolFilter);
  const keys = targets.map((target) => target.key);
  const [uptime24h, uptime7d, incidents] = await Promise.all([
    readUptime(keys, 1),
    readUptime(keys, 7),
    readIncidents(keys),
  ]);

  return {
    statuses: mergeStatuses(targets, checks),
    uptime24h,
    uptime7d,
    incidents,
    maintenance: inMaintenance(settings.maintenance),
  };
}

/** One line to a webhook, ignoring the answer unless it failed. */
async function sendWebhook(url: string, text: string): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return `Webhook answered HTTP ${response.status}`;
    return null;
  } catch (error) {
    return `Webhook failed: ${(error as Error).message.slice(0, 80)}`;
  }
}

function list(values: string[]): string {
  return values.join(", ");
}

export async function runChecks(): Promise<RunSummary> {
  const [applications, previous, settings] = await Promise.all([
    cachedApplications(),
    readChecks(),
    readMonitorSettings(),
  ]);

  const targets = buildTargets(applications, settings.protocolFilter);
  if (targets.length === 0) return { statuses: [], alerts: null };

  // The lease has to be at least as long as a round and shorter than the
  // interval, or a ten-second schedule would starve itself.
  const leaseSeconds = Math.min(15, Math.max(8, settings.intervalSeconds));
  const leased = await acquireRoundLease(leaseSeconds);
  if (!leased) {
    // Someone else is probing this moment; their answer will be the new one.
    return {
      statuses: mergeStatuses(targets, previous),
      alerts: "A check was already running, so this one stood down.",
      skipped: true,
    };
  }

  const results = await probeAll(targets, settings, previous);
  const now = new Date().toISOString();
  // A URL the round ran out of time for keeps its last answer: silence is not
  // evidence that a site is down.
  const answered = targets.filter((target) => results.has(target.key));

  const plan = planAlerts(
    new Map([...previous].map(([key, row]) => [key, { ok: row.ok, alerted: row.alerted }])),
    answered.map((target) => ({ target, result: results.get(target.key)! })),
  );

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
      escalated: result.ok ? false : before && before.ok === false ? before.escalated : false,
      certAlerted: before?.certAlerted ?? false,
      certExpiresAt: result.certExpiresAt ?? null,
      attempts: result.attempts ?? 1,
      phases: result.phases ?? null,
    };
  });

  if (rows.length > 0) await recordChecks(rows);
  await appendHistory(
    rows.map((row) => ({
      key: row.key,
      ok: row.ok,
      statusCode: row.statusCode,
      latencyMs: row.latencyMs,
      error: row.error,
      checkedAt: row.checkedAt,
      certExpiresAt: row.certExpiresAt,
    })),
  );
  void purgeHistory();

  // Incidents are the outages, not the states: opened on the way down, closed
  // on the way back up, and kept as the record of what happened.
  for (const target of plan.down) await openIncident(target, now);
  await closeIncidents(plan.recovered.map((target) => target.key), now);

  const maintenance = inMaintenance(settings.maintenance);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const lines: string[] = [];

  if (maintenance) {
    // Probes keep running — knowing a site is down during a deploy is still
    // useful — but nothing is sent, and the alert flag is left alone so the
    // first round after the window still says its piece.
    return {
      statuses: mergeStatuses(targets, new Map([...previous, ...rows.map((row) => [row.key, row] as const)])),
      alerts: settings.maintenance.note
        ? `Alerts are paused for maintenance — ${settings.maintenance.note}.`
        : "Alerts are paused for maintenance.",
    };
  }

  const wantsMail = settings.alertsEnabled && settings.recipientEmails.length > 0;

  if (plan.down.length > 0 || plan.recovered.length > 0) {
    if (!wantsMail) {
      lines.push(
        settings.alertsEnabled
          ? "No alert recipients are configured, so nothing was emailed."
          : "Alerts are turned off.",
      );
    } else {
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
            `Attempts: ${result?.attempts ?? 1}`,
            `Checked: ${now}`,
            "",
            "Monitoring will say so again when it comes back.",
          ].join("\n"),
        });
        if (!sent.ok) {
          lines.push(`An alert could not be sent — ${target.site}: ${sent.error}`);
          failedKeys.add(target.key);
        }
      }

      // Only the outages that were actually announced get the flag, so a mail
      // that failed is attempted again on the next run instead of being lost.
      const announced = plan.down.filter((target) => !failedKeys.has(target.key));
      await markAlerted(announced.map((target) => target.key));
      if (announced.length > 0) {
        lines.push(`Sent ${announced.length} alert email${announced.length === 1 ? "" : "s"} to ${list(settings.recipientEmails)}.`);
      }

      for (const target of plan.recovered) {
        const sent = await sendMail({
          to: settings.recipientEmails,
          subject: `${target.site} is back up — ${target.url}`,
          text: [`${target.site} (${target.server}) is answering again.`, "", `URL: ${target.url}`, `Checked: ${now}`].join("\n"),
        });
        if (!sent.ok) lines.push(`A recovery mail could not be sent — ${target.site}: ${sent.error}`);
      }

      await markAlerted(plan.recovered.map((target) => target.key), false);

      if (settings.webhookUrl) {
        for (const target of plan.down) {
          const result = results.get(target.key);
          const failure = await sendWebhook(
            settings.webhookUrl,
            `🔴 ${target.site} is down — ${target.url} (${result?.error ?? "no answer"})`,
          );
          if (failure) lines.push(failure);
        }
        for (const target of plan.recovered) {
          const failure = await sendWebhook(settings.webhookUrl, `🟢 ${target.site} is back up — ${target.url}`);
          if (failure) lines.push(failure);
        }
      }
    }
  }

  // Certificates live on the up rows: an expiry is a warning, not an outage.
  const certWarn: string[] = [];
  const certToMark: string[] = [];
  const certToClear: string[] = [];
  for (const row of rows) {
    const days = certDaysLeft(row.certExpiresAt);
    if (days === null) continue;
    if (days > CERT_WARN_DAYS) {
      if (row.certAlerted) certToClear.push(row.key);
      continue;
    }
    const target = targets.find((item) => item.key === row.key);
    if (!target) continue;
    certWarn.push(`${target.site} — ${describeCert(row.certExpiresAt)}${row.ok ? "" : " (site is down)"}`);
    if (!row.certAlerted) certToMark.push(row.key);
  }

  if (certToMark.length > 0 && settings.alertsEnabled && settings.recipientEmails.length > 0) {
    const sent = await sendMail({
      to: settings.recipientEmails,
      subject: `${certToMark.length} certificate${certToMark.length === 1 ? "" : "s"} expiring soon`,
      text: ["These sites have a certificate inside the warning window.", "", ...certWarn.map((line) => `· ${line}`), "", "Renew before they expire; the site stays up until the certificate does."].join("\n"),
    });
    if (sent.ok) {
      await markCertAlerted(certToMark);
      lines.push(`Sent a certificate warning for ${certToMark.length} site${certToMark.length === 1 ? "" : "s"}.`);
    } else {
      lines.push(`A certificate warning could not be sent — ${sent.error}`);
    }
  }
  if (certToClear.length > 0) await markCertAlerted(certToClear, false);

  // Escalation: a site that has been down long enough goes to the second list.
  if (settings.alertsEnabled && settings.escalationEmails.length > 0) {
    const escalate = rows.filter(
      (row) => !row.ok && byKey.has(row.key) && escalationDue(row.since, settings.escalateAfterMinutes, row.escalated),
    );
    if (escalate.length > 0) {
      const sent = await sendMail({
        to: settings.escalationEmails,
        subject: `Still down: ${escalate.length} site${escalate.length === 1 ? "" : "s"} after ${settings.escalateAfterMinutes} minutes`,
        text: [
          "These sites have not come back since the first alert.",
          "",
          ...escalate.map((row) => {
            const target = targets.find((item) => item.key === row.key);
            return `· ${target?.site ?? row.key} — ${target?.url ?? ""} (${row.error ?? "no answer"})`;
          }),
          "",
          `Checked: ${now}`,
        ].join("\n"),
      });
      if (sent.ok) {
        await markEscalated(escalate.map((row) => row.key));
        lines.push(`Escalated ${escalate.length} outage${escalate.length === 1 ? "" : "s"} to ${list(settings.escalationEmails)}.`);
      } else {
        lines.push(`An escalation could not be sent — ${sent.error}`);
      }

      if (settings.webhookUrl) {
        const failure = await sendWebhook(
          settings.webhookUrl,
          `🟠 Escalation — ${escalate.length} site${escalate.length === 1 ? "" : "s"} still down after ${settings.escalateAfterMinutes} minutes`,
        );
        if (failure) lines.push(failure);
      }
    }
  }

  const next = new Map(previous);
  for (const row of rows) next.set(row.key, row);

  return {
    statuses: mergeStatuses(targets, next),
    alerts: lines.length > 0 ? lines.join(" ") : null,
  };
}

/** "a, b and c" — the way a person reads a recipient list. */
export function announce(emails: string[]): string {
  if (emails.length <= 1) return emails[0] ?? "nobody";
  return `${emails.slice(0, -1).join(", ")} and ${emails[emails.length - 1]}`;
}

/** Acknowledge an incident from the board; the record keeps who and what. */
export async function acknowledge(id: string, userId: string, note: string): Promise<void> {
  await acknowledgeIncident(id, userId, note);
}
