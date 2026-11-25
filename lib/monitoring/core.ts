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
  /** True once the outage has also gone to the escalation list. */
  escalated?: boolean;
  /** The certificate the site presented, when it did. */
  certExpiresAt?: string | null;
  /** 2 when a failure was confirmed by a second probe. */
  attempts?: number;
  /** Where the first hop's time went. */
  phases?: ProbePhases | null;
};

/** Where the time went on the way to the first byte. */
export type ProbePhases = {
  /** Name resolution. */
  dnsMs: number | null;
  /** TCP connect. */
  connectMs: number | null;
  /** TLS handshake (https only). */
  tlsMs: number | null;
  /** Request sent → first byte of the answer. */
  ttfbMs: number | null;
};

export type ProbeResult = {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  /** The certificate's `notAfter`, when the site presented one. */
  certExpiresAt?: string | null;
  /** Null when nothing was measured (a refused connection has no phases). */
  phases?: ProbePhases | null;
  /** 1, or 2 when the first attempt failed and was confirmed. */
  attempts?: number;
};

/** A page answers "up" if it answers at all and does not report a server fault. */
export const UP_LATENCY_LIMIT_MS = 8_000;

/**
 * How long a probe may take.
 *
 * A site that answered last round gets three seconds — if it cannot answer that
 * quickly it is not serving pages anyway, and a black-holed host must not hold
 * its wave for eight. A site that is already down keeps the long timeout, because
 * that is the one case where waiting longer might see it come back.
 */
export const PROBE_TIMEOUT_HEALTHY_MS = 3_000;
export const PROBE_TIMEOUT_TROUBLED_MS = UP_LATENCY_LIMIT_MS;
/** A single failure is a suspicion, not a verdict. */
export const CONFIRM_DELAY_MS = 1_200;
/** Certificates this close to expiry get the amber chip and one email. */
export const CERT_WARN_DAYS = 30;
/** The whole round's budget, after which untouched URLs keep their last answer. */
export const ROUND_BUDGET_MS = 45_000;

export function timeoutFor(previous: { ok: boolean } | undefined): number {
  return previous && previous.ok === false ? PROBE_TIMEOUT_TROUBLED_MS : PROBE_TIMEOUT_HEALTHY_MS;
}

/** Up, but slow enough to be worth a second look: the amber light. */
export const SLOW_LATENCY_MS = 1_500;

/** How often the board checks by itself, unless someone says otherwise. */
export const DEFAULT_CHECK_INTERVAL_SECONDS = 60;
/** Ten seconds is about as fast as a round should be asked to run; an hour is
 *  as slow as still counts as monitoring. */
export const MIN_CHECK_INTERVAL_SECONDS = 10;
export const MAX_CHECK_INTERVAL_SECONDS = 3_600;

/**
 * The interval a person typed, in seconds.
 *
 * Minutes and seconds are separate boxes because that is how people say it —
 * "every 2 minutes", "every 1 minute 30" — and the total is clamped to something
 * a serverless function and an IIS box can both live with.
 */
export function checkIntervalSeconds(minutes: number, seconds: number): number {
  const wholeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.trunc(minutes)) : 0;
  const wholeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.trunc(seconds)) : 0;
  const total = wholeMinutes * 60 + wholeSeconds;
  return Math.min(MAX_CHECK_INTERVAL_SECONDS, Math.max(MIN_CHECK_INTERVAL_SECONDS, total));
}

/** "every 45 sec", "every 2 min", "every 1 min 30 sec". */
export function formatInterval(totalSeconds: number): string {
  const seconds = Math.max(MIN_CHECK_INTERVAL_SECONDS, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} sec`;
  if (rest === 0) return `${minutes} min`;
  return `${minutes} min ${rest} sec`;
}

/**
 * The three lights.
 *
 * Green: answering, and quickly. Amber: answering, but slowly — a page that
 * takes four seconds is up, and still worth seeing. Red: not answering. Grey:
 * nobody has checked it yet.
 */
export type StatusTone = "up" | "slow" | "down" | "unknown";

export function statusTone(status: Pick<MonitorStatus, "ok" | "latencyMs">): StatusTone {
  if (status.ok === null) return "unknown";
  if (status.ok === false) return "down";
  return (status.latencyMs ?? 0) >= SLOW_LATENCY_MS ? "slow" : "up";
}

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
 * Which schemes to watch.
 *
 * A workspace that only cares about the secure endpoints can say so instead of
 * watching every plain-http binding as well — and the filter applies to the IIS
 * list, so nothing has to be maintained twice.
 */
export type ProtocolFilter = "all" | "https" | "http";

export const PROTOCOL_LABELS: Record<ProtocolFilter, string> = {
  all: "HTTP and HTTPS",
  https: "HTTPS only",
  http: "HTTP only",
};

export function isProtocolFilter(value: string): value is ProtocolFilter {
  return value === "all" || value === "https" || value === "http";
}

/**
 * The switch is a yes/no — "enable HTTP monitoring" — and the stored filter is
 * what that means. Off leaves only the SSL-mapped bindings, which is the whole
 * point: a workspace that publishes plain http does not have to watch it.
 */
export function filterFromHttpEnabled(enabled: boolean): ProtocolFilter {
  return enabled ? "all" : "https";
}

export function isHttpEnabled(filter: ProtocolFilter): boolean {
  return filter !== "https";
}

/** The scheme of a target's URL, as the filter sees it. */
export function urlProtocol(url: string): "https" | "http" {
  return /^https:/i.test(url) ? "https" : "http";
}

/**
 * Every active application that publishes a binding becomes a target.
 *
 * Inactive rows are skipped on purpose: an application someone retired last
 * month should not page anyone at three in the morning. A scheme filter then
 * drops the URLs the workspace said it does not want watched.
 */
export function buildTargets(
  applications: IisApplication[],
  filter: ProtocolFilter = "all",
): MonitorTarget[] {
  const targets: MonitorTarget[] = [];
  for (const application of applications) {
    if (!application.active) continue;
    const url = bindingUrl(application);
    if (!url) continue;
    if (filter !== "all" && urlProtocol(url) !== filter) continue;
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
export function readResponse(
  statusCode: number,
  latencyMs: number | null,
  options: { treatAuthAsUp?: boolean } = {},
): ProbeResult {
  const ok =
    (statusCode >= 100 && statusCode < 400) ||
    // A login prompt is the site doing its job behind Windows auth.
    (Boolean(options.treatAuthAsUp) && (statusCode === 401 || statusCode === 403));
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

/* -------------------------------------------------------------------------- */
/*  Certificates, maintenance, escalation                                      */
/* -------------------------------------------------------------------------- */

export type CertState = "ok" | "expiring" | "expired" | "unknown";

export function certDaysLeft(certExpiresAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!certExpiresAt) return null;
  const at = new Date(certExpiresAt).getTime();
  if (Number.isNaN(at)) return null;
  return Math.floor((at - now.getTime()) / 86_400_000);
}

export function certState(certExpiresAt: string | null | undefined, now: Date = new Date()): CertState {
  const days = certDaysLeft(certExpiresAt, now);
  if (days === null) return "unknown";
  if (days < 0) return "expired";
  if (days <= CERT_WARN_DAYS) return "expiring";
  return "ok";
}

/** "expires in 12 days", "expired 2 days ago", "unknown". */
export function describeCert(certExpiresAt: string | null | undefined, now: Date = new Date()): string {
  const days = certDaysLeft(certExpiresAt, now);
  if (days === null) return "not seen";
  if (days < 0) return `expired ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago`;
  if (days === 0) return "expires today";
  return `expires in ${days} ${days === 1 ? "day" : "days"}`;
}

export type MaintenanceWindow = { from: string | null; to: string | null; note: string };

/**
 * True inside the window someone declared.
 *
 * Probes keep running (knowing a site is down during a deploy is still useful);
 * what stops is the email. The end has to be in the future for the window to
 * count, so a stale row cannot silence alerts for ever.
 */
export function inMaintenance(window: MaintenanceWindow, now: Date = new Date()): boolean {
  if (!window.from || !window.to) return false;
  const from = new Date(window.from).getTime();
  const to = new Date(window.to).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return false;
  const at = now.getTime();
  return at >= from && at <= to;
}

/**
 * Still down after the escalation delay?
 *
 * The outage's own start is the clock: a site that has been down for longer than
 * the configured minutes is worth telling a second set of people about, once.
 */
export function escalationDue(
  sinceIso: string | null,
  minutes: number,
  alreadyEscalated: boolean,
  now: Date = new Date(),
): boolean {
  if (alreadyEscalated || !sinceIso) return false;
  const since = new Date(sinceIso).getTime();
  if (Number.isNaN(since)) return false;
  return now.getTime() - since >= Math.max(1, minutes) * 60_000;
}

export type UptimeSummary = {
  key: string;
  checks: number;
  up: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  lastCheckedAt: string | null;
};

/** 100 × up ÷ checks, one decimal; null until something has been checked. */
export function uptimePercent(summary: UptimeSummary | undefined): number | null {
  if (!summary || summary.checks === 0) return null;
  return Math.round((summary.up / summary.checks) * 1000) / 10;
}
