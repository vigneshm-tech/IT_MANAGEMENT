import type { IisApplication } from "../iis/constants";

/**
 * What Monitoring watches, and how a probe result is read.
 *
 * Everything here is pure: no database, no network, no React. The rules that
 * decide *which* URLs are watched and what counts as "down" are the part worth
 * testing, so they live away from the code that runs them.
 */

/** One URL the workspace watches, derived from an IIS application. */
export type MonitorTarget = {
  /** Stable key: the IIS application's id. */
  key: string;
  url: string;
  /** The IIS site name, e.g. "Portal". */
  site: string;
  /** The machine the site runs on, e.g. WEB01. */
  server: string;
  environment: string;
  owner: string;
};

/** A target with the last check's outcome attached. */
export type MonitorStatus = MonitorTarget & {
  /** null until the URL has been checked once. */
  ok: boolean | null;
  statusCode: number | null;
  latencyMs: number | null;
  /** Why it failed, in words a person can act on. */
  error: string | null;
  /** ISO instant of the last check. */
  checkedAt: string | null;
  /** When the current state (up or down) began. */
  since: string | null;
  /** True once a down alert has been emailed for this outage. */
  alerted: boolean;
};

export type ProbeResult = {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
};

/** A page answers "up" if it answers at all and does not report a server fault. */
export const UP_LATENCY_LIMIT_MS = 8_000;

/**
 * The public URL of an IIS binding.
 *
 * The scheme follows the TLS mapping, and the port is left out when it is the
 * one the scheme implies — `https://portal.example.com`, not
 * `https://portal.example.com:443` — because that is how the address is written
 * everywhere else and a mismatch in a certificate is a false alarm.
 */
export function bindingUrl(application: Pick<IisApplication, "bindingHost" | "bindingPort" | "sslMapped">): string | null {
  const host = application.bindingHost.trim();
  if (!host) return null;

  const secure = application.sslMapped;
  const scheme = secure ? "https" : "http";
  const port = application.bindingPort;
  const implied = secure ? 443 : 80;

  // A host that already carries a scheme is taken as written, port and all.
  if (/^https?:\/\//i.test(host)) return host.replace(/\/+$/, "");

  const withPort = port && port !== implied ? `${host}:${port}` : host;
  return `${scheme}://${withPort}`;
}

/**
 * Every active application that publishes a binding becomes a target.
 *
 * Inactive rows are skipped on purpose: an application someone retired last
 * month should not page anyone at three in the morning.
 */
export function buildTargets(applications: IisApplication[]): MonitorTarget[] {
  const targets: MonitorTarget[] = [];
  for (const application of applications) {
    if (!application.active) continue;
    const url = bindingUrl(application);
    if (!url) continue;
    targets.push({
      key: application.id,
      url,
      site: application.name,
      server: application.server,
      environment: application.environment,
      owner: application.owner,
    });
  }
  return targets.sort((a, b) => a.url.localeCompare(b.url));
}

/**
 * Turns an HTTP answer into a verdict.
 *
 * Anything below 400 is working: a redirect and a login page are both healthy
 * answers from a site that is doing its job. A 5xx, a refused connection or a
 * timeout is not, and the error line says which, because "down" on its own tells
 * nobody where to look.
 */
export function readResponse(statusCode: number, latencyMs: number | null): ProbeResult {
  const ok = statusCode >= 100 && statusCode < 400;
  return {
    ok,
    statusCode,
    latencyMs,
    error: ok ? null : `HTTP ${statusCode}`,
  };
}

export function readFailure(reason: string, latencyMs: number | null): ProbeResult {
  return { ok: false, statusCode: null, latencyMs, error: reason };
}

/** "12s ago", "4m ago", "2h ago" — enough precision to trust a live board. */
export function describeAge(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "Down for 12 minutes" / "Up for 3 hours" — how long the current state has held. */
export function describeSince(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((now.getTime() - then) / 60_000));
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Which state changes are worth an email.
 *
 * Only transitions: a site that has been down for an hour must not send sixty
 * mails, and a site that recovers must say so once. The previous row's `ok` and
 * `alerted` flag are enough to tell the three cases apart.
 */
export type AlertPlan = {
  /** Just went down and has not been announced yet. */
  down: MonitorTarget[];
  /** Was down (or unknown) and is answering again. */
  recovered: MonitorTarget[];
};

export function planAlerts(
  previous: Map<string, Pick<MonitorStatus, "ok" | "alerted">>,
  next: { target: MonitorTarget; result: ProbeResult }[],
): AlertPlan {
  const plan: AlertPlan = { down: [], recovered: [] };
  for (const { target, result } of next) {
    const before = previous.get(target.key);
    if (result.ok) {
      if (before && before.ok === false) plan.recovered.push(target);
      continue;
    }
    // Down and either never announced, or the flag was cleared by a recovery.
    if (!before || before.ok !== false || !before.alerted) {
      plan.down.push(target);
    }
  }
  return plan;
}

/** Recipient lists are typed by hand, so anything that is not an address is ignored. */
export function parseRecipients(value: string): string[] {
  const seen = new Set<string>();
  for (const part of value.split(/[,;\s]+/)) {
    const address = part.trim().toLowerCase();
    if (!address) continue;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) continue;
    seen.add(address);
  }
  return [...seen];
}
