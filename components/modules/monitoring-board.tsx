"use client";

import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  describeAge,
  describeSince,
  formatInterval,
  statusTone,
  type MonitorStatus,
  type StatusTone,
} from "@/lib/monitoring/core";

type BoardState = {
  statuses: MonitorStatus[];
  mailReady: boolean;
  alertsEnabled: boolean;
  recipients: string[];
  intervalSeconds: number;
};

/**
 * The live board.
 *
 * A table, because a register of sites is a list of columns: what, whether it is
 * answering, how fast, and when it was last asked. Each row opens to show the
 * full story behind the light.
 *
 * Nobody presses anything any more. The board reads the answers the server has,
 * checks again by itself once the configured interval has passed, and shows the
 * interval it is working to so the number on the settings page is visibly real.
 */

const POLL_MS = 15_000;
/** How often the clock under the words ticks. */
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

/**
 * Three lanes, one lit.
 *
 * Green answered quickly, amber answered slowly, red did not answer at all —
 * read left to right like a pipeline, with the segment that applies filled and
 * the others left as track, so a row says its state before the word does.
 */
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
/*  The board                                                                  */
/* -------------------------------------------------------------------------- */

export function MonitoringBoard({
  initial,
  mailReady,
  alertsEnabled,
  recipients,
  intervalSeconds,
}: {
  initial: MonitorStatus[];
  mailReady: boolean;
  alertsEnabled: boolean;
  recipients: string[];
  intervalSeconds: number;
}) {
  const [state, setState] = useState<BoardState>({
    statuses: initial,
    mailReady,
    alertsEnabled,
    recipients,
    intervalSeconds,
  });
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const running = useRef(false);
  /** Set when the server says this role may not run a round: stop asking. */
  const blocked = useRef(false);
  const latest = useRef<MonitorStatus[]>(initial);
  const interval = useRef(intervalSeconds);

  useEffect(() => {
    latest.current = state.statuses;
    interval.current = state.intervalSeconds;
  }, [state.statuses, state.intervalSeconds]);

  /** Take the answers the server just gave. */
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
        if (response.status === 401 || response.status === 403) blocked.current = true;
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
    // A clock that ticks every second keeps "checked 40s ago" true, and decides
    // on the same tick whether the interval has run out.
    const tick = setInterval(() => {
      setNow(Date.now());
      if (running.current) return;
      if (blocked.current || latest.current.length === 0) return;
      const age = Date.now() - newestCheck(latest.current);
      if (age >= interval.current * 1000) void runCheck();
    }, TICK_MS);

    // Other people's checks arrive through this poll, so two open tabs do not
    // sit staring at each other's stale answers.
    const poll = setInterval(() => void readStatus(), POLL_MS);

    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [readStatus, runCheck]);

  const down = useMemo(() => state.statuses.filter((row) => row.ok === false), [state.statuses]);
  const slow = useMemo(
    () => state.statuses.filter((row) => statusTone(row) === "slow"),
    [state.statuses],
  );
  const clock = useMemo(() => new Date(now), [now]);
  const newest = newestCheck(state.statuses);
  const nextIn = Math.max(
    0,
    Math.ceil((newest + state.intervalSeconds * 1000 - now) / 1000),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <p className="inline-flex items-center gap-1.5 text-[11.5px] text-muted" aria-live="polite">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          Live · checked every {formatInterval(state.intervalSeconds)}
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

        <p className="text-[11.5px] text-muted">
          {state.statuses.length} {state.statuses.length === 1 ? "site" : "sites"}
          <span className="text-line-strong" aria-hidden>
            {" · "}
          </span>
          <span className={down.length > 0 ? "text-danger" : undefined}>{down.length} down</span>
          {slow.length > 0 && (
            <>
              <span className="text-line-strong" aria-hidden>
                {" · "}
              </span>
              <span className="text-warning">{slow.length} slow</span>
            </>
          )}
          {nextIn > 0 && !checking && (
            <span className="text-muted"> · next in {nextIn}s</span>
          )}
        </p>
      </div>

      {error && (
        <p role="alert" className="border border-[#f0d5d5] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      {down.length > 0 && (
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
          Nothing to watch yet. An IIS application with a binding host appears here on its own.
        </p>
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[680px] border-collapse text-left">
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
                        {/* Time to fail is not a response time, so a red row says nothing here. */}
                        {row.ok === false ? "—" : row.latencyMs !== null ? `${row.latencyMs} ms` : "—"}
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
                        <td colSpan={5} className="border-t border-line px-4 py-3">
                          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
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
                                <p className="mt-2 text-[12px] text-danger">{row.error ?? "No answer."}</p>
                              )}
                            </div>

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
                                  {row.ok === false
                                    ? "—"
                                    : row.latencyMs !== null
                                      ? `${row.latencyMs} ms`
                                      : "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted">{row.ok === false ? "Down for" : "In this state"}</dt>
                                <dd className="mt-0.5 text-body">
                                  {row.since ? describeSince(row.since, clock) : "—"}
                                </dd>
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
                                <dt className="text-muted">Alert</dt>
                                <dd className="mt-0.5 text-body">
                                  {row.ok === false
                                    ? row.alerted
                                      ? "Emailed to the alert recipients."
                                      : "Not emailed yet — the next round will try."
                                    : "Nothing to send."}
                                </dd>
                              </div>
                            </dl>
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
