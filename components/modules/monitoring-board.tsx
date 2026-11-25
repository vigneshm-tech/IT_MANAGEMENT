"use client";

import { AlertTriangle, ChevronDown, Loader2, ShieldCheck, Wrench } from "lucide-react";
import { Fragment, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormState } from "@/lib/forms";
import {
  PROTOCOL_LABELS,
  certState,
  describeAge,
  describeCert,
  describeSince,
  formatInterval,
  statusTone,
  type MonitorStatus,
  type ProtocolFilter,
  type StatusTone,
  type UptimeSummary,
} from "@/lib/monitoring/core";
import type { Incident } from "@/lib/monitoring/store";

type BoardState = {
  statuses: MonitorStatus[];
  mailReady: boolean;
  alertsEnabled: boolean;
  recipients: string[];
  intervalSeconds: number;
  protocolFilter: ProtocolFilter;
  maintenance: boolean;
};

export type MonitoringBoardProps = {
  initial: MonitorStatus[];
  mailReady: boolean;
  alertsEnabled: boolean;
  recipients: string[];
  intervalSeconds: number;
  protocolFilter: ProtocolFilter;
  maintenance: boolean;
  uptime24h: Record<string, UptimeSummary>;
  uptime7d: Record<string, UptimeSummary>;
  incidents: Record<string, Incident[]>;
  canAcknowledge: boolean;
  acknowledgeAction: (state: FormState, formData: FormData) => Promise<FormState>;
};

/**
 * The live board.
 *
 * A table, because a register of sites is a list of columns: what, whether it is
 * answering, how fast, how often it has been up, and when it was last asked.
 * Each row opens to show the story behind the light — the address, where the
 * milliseconds went, the certificate, and the outages it has had.
 *
 * Nobody presses anything. The board reads the answers the server has, checks
 * again by itself once the configured interval has passed, and stops polling
 * while the tab is hidden so an idle page costs nothing.
 */

const POLL_MS = 15_000;
const TICK_MS = 1_000;

function newestCheck(statuses: MonitorStatus[]): number {
  return statuses.reduce((newest, row) => {
    const at = row.checkedAt ? new Date(row.checkedAt).getTime() : 0;
    return Math.max(newest, Number.isNaN(at) ? 0 : at);
  }, 0);
}

/* -------------------------------------------------------------------------- */
/*  The light                                                                  */
/* -------------------------------------------------------------------------- */

const LIGHTS: { tone: StatusTone; className: string; label: string }[] = [
  { tone: "up", className: "bg-[#2f9e63]", label: "Up" },
  { tone: "slow", className: "bg-[#d9a13b]", label: "Slow" },
  { tone: "down", className: "bg-[#c8483f]", label: "Down" },
];

function Pipeline({ tone }: { tone: StatusTone }) {
  const label = tone === "unknown" ? "Not checked" : (LIGHTS.find((l) => l.tone === tone)?.label ?? "—");

  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-flex items-center gap-[3px] rounded-full border border-line bg-[#f6f8fc] px-[3px] py-[3px]"
      >
        {LIGHTS.map((light) => (
          <span
            key={light.tone}
            className={`h-[5px] w-[13px] rounded-full transition-colors ${
              tone === light.tone ? light.className : "bg-[#e3e8f1]"
            }`}
          />
        ))}
      </span>
      <span
        className={
          tone === "down"
            ? "text-[11.5px] font-medium text-danger"
            : tone === "slow"
              ? "text-[11.5px] font-medium text-warning"
              : tone === "up"
                ? "text-[11.5px] font-medium text-success"
                : "text-[11.5px] font-medium text-muted"
        }
      >
        {label}
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Uptime                                                                     */
/* -------------------------------------------------------------------------- */

function percentOf(summary: UptimeSummary | undefined): number | null {
  if (!summary || summary.checks === 0) return null;
  return Math.round((summary.up / summary.checks) * 1000) / 10;
}

function UptimeBar({ summary, window }: { summary: UptimeSummary | undefined; window: string }) {
  const percent = percentOf(summary);
  const colour =
    percent === null ? "bg-line" : percent >= 99.5 ? "bg-[#2f9e63]" : percent >= 95 ? "bg-[#d9a13b]" : "bg-[#c8483f]";

  return (
    <span className="flex items-center gap-2">
      <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-[#edf1f7]">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${colour}`}
          style={{ width: `${percent === null ? 0 : Math.max(2, percent)}%` }}
        />
      </span>
      <span className="text-[11px] tabular-nums text-body">
        {percent === null ? "—" : `${percent}%`}
        <span className="text-muted"> · {window}</span>
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Incidents                                                                  */
/* -------------------------------------------------------------------------- */

function durationOf(incident: Incident): string {
  const start = new Date(incident.startedAt).getTime();
  const end = incident.endedAt ? new Date(incident.endedAt).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function IncidentRow({
  incident,
  canAcknowledge,
  action,
  onAcknowledged,
}: {
  incident: Incident;
  canAcknowledge: boolean;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  onAcknowledged: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);

  useEffect(() => {
    if (state.ok) onAcknowledged();
  }, [state.ok, onAcknowledged]);

  return (
    <li className="border-t border-line py-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
        <span className="text-navy">
          {new Date(incident.startedAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span className="text-muted">→ {incident.endedAt ? "recovered" : "ongoing"}</span>
        <span className="tabular-nums text-muted">{durationOf(incident)}</span>
        {incident.acknowledgedAt && (
          <span className="inline-flex items-center gap-1 text-success">
            <ShieldCheck className="h-3 w-3" aria-hidden /> acknowledged
          </span>
        )}
        {incident.note && <span className="text-body">“{incident.note}”</span>}
      </div>

      {canAcknowledge && !incident.acknowledgedAt && (
        <form action={formAction} className="mt-1 flex flex-wrap items-center gap-2">
          <input type="hidden" name="incidentId" value={incident.id} />
          <input
            name="note"
            placeholder="What is being done?"
            className="field h-7 w-56 px-2 text-[11.5px]"
            maxLength={200}
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-7 items-center rounded-md border border-line-strong px-2 text-[11.5px] text-navy transition-colors hover:border-navy hover:bg-[#f4f7fc] disabled:opacity-60"
          >
            {pending ? "Saving" : "Acknowledge"}
          </button>
          {state.error && <span className="text-[11px] text-danger">{state.error}</span>}
        </form>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  The board                                                                  */
/* -------------------------------------------------------------------------- */

export function MonitoringBoard({
  initial,
  mailReady,
  alertsEnabled,
  recipients,
  intervalSeconds,
  protocolFilter,
  maintenance,
  uptime24h,
  uptime7d,
  incidents,
  canAcknowledge,
  acknowledgeAction,
}: MonitoringBoardProps) {
  const [state, setState] = useState<BoardState>({
    statuses: initial,
    mailReady,
    alertsEnabled,
    recipients,
    intervalSeconds,
    protocolFilter,
    maintenance,
  });
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const running = useRef(false);
  const latest = useRef<MonitorStatus[]>(initial);
  const interval = useRef(intervalSeconds);

  useEffect(() => {
    latest.current = state.statuses;
    interval.current = state.intervalSeconds;
  }, [state.statuses, state.intervalSeconds]);

  const apply = useCallback((payload: Partial<BoardState> & { alerts?: string | null }) => {
    setState((current) => ({ ...current, ...payload }));
    setNotice(payload.alerts ?? null);
    setNow(Date.now());
  }, []);

  const readStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/monitoring/status", { cache: "no-store" });
      if (!response.ok) return;
      apply((await response.json()) as Partial<BoardState>);
    } catch {
      // A dropped poll is not worth a banner; the next one will do.
    }
  }, [apply]);

  const runCheck = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setChecking(true);
    setError(null);
    try {
      const response = await fetch("/api/monitoring/check", { method: "POST" });
      const payload = (await response.json()) as Partial<BoardState> & { error?: string; alerts?: string | null };
      if (!response.ok) {
        setError(payload.error ?? "The check could not run.");
        return;
      }
      apply(payload);
    } catch {
      setError("The check could not run. Check your connection and try again.");
    } finally {
      running.current = false;
      setChecking(false);
      setNow(Date.now());
    }
  }, [apply]);

  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now());
      if (running.current || document.hidden) return;
      if (latest.current.length === 0) return;
      const age = Date.now() - newestCheck(latest.current);
      if (age >= interval.current * 1000) void runCheck();
    }, TICK_MS);

    // Reading the stored answers is cheap, and it picks up rounds other people
    // ran. Hidden tabs skip it: an idle page should cost nothing.
    const poll = setInterval(() => {
      if (!document.hidden) void readStatus();
    }, POLL_MS);

    const onVisible = () => {
      if (!document.hidden) void readStatus();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [readStatus, runCheck]);

  const down = useMemo(() => state.statuses.filter((row) => row.ok === false), [state.statuses]);
  const slow = useMemo(() => state.statuses.filter((row) => statusTone(row) === "slow"), [state.statuses]);
  const expiring = useMemo(
    () => state.statuses.filter((row) => certState(row.certExpiresAt) === "expiring" || certState(row.certExpiresAt) === "expired"),
    [state.statuses],
  );
  const clock = useMemo(() => new Date(now), [now]);
  const newest = newestCheck(state.statuses);
  const nextIn = Math.max(0, Math.ceil((newest + state.intervalSeconds * 1000 - now) / 1000));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <p className="inline-flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted" aria-live="polite">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          Live · {PROTOCOL_LABELS[state.protocolFilter]} · checked every{" "}
          {formatInterval(state.intervalSeconds)}
          <span className="text-line-strong" aria-hidden>
            ·
          </span>
          last check {newest > 0 ? describeAge(new Date(newest).toISOString(), clock) : "never"}
          {checking && (
            <span className="inline-flex items-center gap-1 text-navy">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              checking
            </span>
          )}
        </p>

        <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
          {state.maintenance && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#eef2f8] px-2 py-0.5 text-[10.5px] uppercase tracking-[0.06em] text-body">
              <Wrench className="h-3 w-3" aria-hidden /> maintenance
            </span>
          )}
          <span>
            {state.statuses.length} {state.statuses.length === 1 ? "site" : "sites"}
          </span>
          <span className="text-line-strong" aria-hidden>
            ·
          </span>
          <span className={down.length > 0 ? "text-danger" : undefined}>{down.length} down</span>
          {slow.length > 0 && (
            <>
              <span className="text-line-strong" aria-hidden>
                ·
              </span>
              <span className="text-warning">{slow.length} slow</span>
            </>
          )}
          {expiring.length > 0 && (
            <>
              <span className="text-line-strong" aria-hidden>
                ·
              </span>
              <span className="text-warning">{expiring.length} cert</span>
            </>
          )}
          {nextIn > 0 && !checking && <span> · next in {nextIn}s</span>}
        </p>
      </div>

      {error && (
        <p role="alert" className="border border-[#f0d5d5] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      {state.maintenance && (
        <p className="border border-line bg-surface px-3 py-2 text-[11.5px] text-muted">
          A maintenance window is open: the checks still run, but no alert email is sent. Clear it under
          Settings when the deploy is over.
        </p>
      )}

      {down.length > 0 && !state.maintenance && (
        <p className="flex items-start gap-2 border border-[#f0dfb4] bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {!state.alertsEnabled
              ? "A site is not answering. Alerts are turned off, so nobody is being emailed."
              : state.recipients.length === 0
                ? "A site is not answering. No alert recipients are set, so no email goes out."
                : !state.mailReady
                  ? "A site is not answering. No mail server is configured, so the alert cannot be sent."
                  : "A site is not answering. An alert email is on its way to the recipients set under Settings."}
          </span>
        </p>
      )}

      {!state.mailReady && down.length === 0 && (
        <p className="border border-line bg-surface px-3 py-2 text-[11.5px] text-muted">
          No mail server is configured, so alerts cannot be sent. Set one up in Settings → Email &amp;
          alerts.
        </p>
      )}

      {notice && (
        <p role="status" className="border border-line bg-surface px-3 py-2 text-[11.5px] text-muted">
          {notice}
        </p>
      )}

      {state.statuses.length === 0 ? (
        <p className="border border-dashed border-line-strong bg-surface px-4 py-8 text-center text-[12.5px] text-muted">
          Nothing to watch.{" "}
          {state.protocolFilter === "https"
            ? "No binding is SSL-mapped yet, so only HTTPS monitoring leaves nothing to check. Turn on HTTP monitoring under Settings to watch the plain http sites too."
            : "An IIS application with a binding host appears here on its own."}
        </p>
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-[#f8fafd]">
                <th scope="col" className="px-4 py-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">
                  Site
                </th>
                <th scope="col" className="px-4 py-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">
                  Status
                </th>
                <th scope="col" className="w-[92px] px-4 py-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">
                  Response
                </th>
                <th scope="col" className="w-[176px] px-4 py-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">
                  Uptime 24h
                </th>
                <th scope="col" className="w-[140px] px-4 py-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">
                  Last checked
                </th>
                <th scope="col" className="w-8 px-2 py-2">
                  <span className="sr-only">Expand</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {state.statuses.map((row) => {
                const tone = statusTone(row);
                const expanded = Boolean(open[row.key]);
                const panelId = `site-${row.key}`;
                const cert = certState(row.certExpiresAt);
                const siteIncidents = incidents[row.key] ?? [];
                const phases = row.phases;

                return (
                  <Fragment key={row.key}>
                    <tr
                      className={`cursor-pointer align-middle transition-colors hover:bg-[#f7f9fd] ${
                        expanded ? "bg-[#f7f9fd]" : ""
                      }`}
                      onClick={() => setOpen((current) => ({ ...current, [row.key]: !current[row.key] }))}
                    >
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={panelId}
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpen((current) => ({ ...current, [row.key]: !current[row.key] }));
                          }}
                          className="flex items-center gap-2 text-left"
                        >
                          <span className="text-[12.5px] font-semibold text-navy">{row.site}</span>
                          <span className="text-[11px] text-muted">
                            {row.server}
                            {row.environment ? ` · ${row.environment}` : ""}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <Pipeline tone={tone} />
                      </td>
                      <td className="px-4 py-2 text-[11.5px] tabular-nums text-body">
                        {row.ok === false ? "—" : row.latencyMs !== null ? `${row.latencyMs} ms` : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <UptimeBar summary={uptime24h[row.key]} window="24h" />
                      </td>
                      <td
                        className="px-4 py-2 text-[11.5px] text-muted"
                        title={
                          row.checkedAt
                            ? new Date(row.checkedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" })
                            : undefined
                        }
                      >
                        {describeAge(row.checkedAt, clock)}
                      </td>
                      <td className="px-2 py-2">
                        <ChevronDown
                          aria-hidden
                          className={`h-3.5 w-3.5 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                        />
                      </td>
                    </tr>

                    {expanded && (
                      <tr id={panelId} className="bg-[#f9fbfe]">
                        <td colSpan={6} className="border-t border-line px-4 py-3">
                          <div className="grid gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                            <div className="min-w-0">
                              <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">URL</p>
                              <p className="mt-1 break-all font-mono text-[12px] text-navy">{row.url}</p>
                              <p className="mt-2 text-[11.5px] text-body">
                                Owner <span className="text-navy">{row.owner || "—"}</span>
                                <span className="px-1.5 text-line-strong" aria-hidden>
                                  ·
                                </span>
                                Server <span className="text-navy">{row.server}</span>
                                <span className="px-1.5 text-line-strong" aria-hidden>
                                  ·
                                </span>
                                Environment <span className="text-navy">{row.environment || "—"}</span>
                              </p>
                              {row.ok === false && (
                                <p className="mt-2 text-[12px] text-danger">
                                  {row.error ?? "No answer."}
                                  {row.attempts === 2 && (
                                    <span className="text-muted"> (confirmed on a second attempt)</span>
                                  )}
                                </p>
                              )}

                              {phases && (
                                <p className="mt-2 text-[11px] text-muted">
                                  DNS {phases.dnsMs ?? "—"} ms
                                  <span className="px-1" aria-hidden>
                                    ·
                                  </span>
                                  TCP {phases.connectMs ?? "—"} ms
                                  <span className="px-1" aria-hidden>
                                    ·
                                  </span>
                                  TLS {phases.tlsMs ?? "—"} ms
                                  <span className="px-1" aria-hidden>
                                    ·
                                  </span>
                                  first byte {phases.ttfbMs ?? "—"} ms
                                </p>
                              )}

                              <div className="mt-3">
                                <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">
                                  Certificate
                                </p>
                                <p
                                  className={
                                    cert === "expired" || cert === "expiring"
                                      ? "mt-1 text-[11.5px] text-warning"
                                      : "mt-1 text-[11.5px] text-body"
                                  }
                                >
                                  {describeCert(row.certExpiresAt, clock)}
                                  {cert !== "unknown" && row.certExpiresAt && (
                                    <span className="text-muted">
                                      {" "}
                                      ·{" "}
                                      {new Date(row.certExpiresAt).toLocaleDateString("en-IN", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>

                            <div>
                              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11.5px]">
                                <div>
                                  <dt className="text-muted">Response</dt>
                                  <dd className="mt-0.5 text-body">
                                    {row.statusCode !== null ? `HTTP ${row.statusCode}` : row.ok === null ? "—" : "No answer"}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-muted">Latency</dt>
                                  <dd className="mt-0.5 tabular-nums text-body">
                                    {row.ok === false ? "—" : row.latencyMs !== null ? `${row.latencyMs} ms` : "—"}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-muted">{row.ok === false ? "Down for" : "In this state"}</dt>
                                  <dd className="mt-0.5 text-body">{row.since ? describeSince(row.since, clock) : "—"}</dd>
                                </div>
                                <div>
                                  <dt className="text-muted">Last checked</dt>
                                  <dd className="mt-0.5 text-body">
                                    {row.checkedAt
                                      ? new Date(row.checkedAt).toLocaleString("en-IN", {
                                          day: "2-digit",
                                          month: "short",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          second: "2-digit",
                                        })
                                      : "Never"}
                                  </dd>
                                </div>
                                <div className="col-span-2">
                                  <dt className="text-muted">Uptime &amp; latency</dt>
                                  <dd className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-1.5">
                                    <UptimeBar summary={uptime24h[row.key]} window="24h" />
                                    <UptimeBar summary={uptime7d[row.key]} window="7d" />
                                    {uptime7d[row.key]?.p95LatencyMs != null && (
                                      <span className="text-[11px] text-muted">
                                        p95 <span className="tabular-nums text-body">{uptime7d[row.key]!.p95LatencyMs} ms</span>
                                      </span>
                                    )}
                                  </dd>
                                </div>
                                <div className="col-span-2">
                                  <dt className="text-muted">Alert</dt>
                                  <dd className="mt-0.5 text-body">
                                    {row.ok === false
                                      ? row.alerted
                                        ? row.escalated
                                          ? "Emailed, then escalated to the second list."
                                          : "Emailed to the alert recipients."
                                        : "Not emailed yet — the next round will try."
                                      : "Nothing to send."}
                                  </dd>
                                </div>
                              </dl>

                              <div className="mt-3">
                                <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">
                                  Incidents
                                </p>
                                {siteIncidents.length === 0 ? (
                                  <p className="mt-1 text-[11.5px] text-muted">No outage recorded yet.</p>
                                ) : (
                                  <ul className="mt-1">
                                    {siteIncidents.map((incident) => (
                                      <IncidentRow
                                        key={incident.id}
                                        incident={incident}
                                        canAcknowledge={canAcknowledge}
                                        action={acknowledgeAction}
                                        onAcknowledged={() => void readStatus()}
                                      />
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
