"use client";

import { Activity, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { describeAge, describeSince, type MonitorStatus } from "@/lib/monitoring/core";

type BoardState = {
  statuses: MonitorStatus[];
  mailReady: boolean;
  alertsEnabled: boolean;
  recipients: string[];
};

/**
 * The live board.
 *
 * It polls the stored answers so "checked 20s ago" keeps telling the truth, and
 * asks for a fresh round of probes when the newest answer has gone stale — that
 * is what makes the page live without needing a cron job every minute. Anyone
 * with the module may watch; only someone with edit rights may force a check,
 * because a forced check writes and can send mail.
 */

const STALE_AFTER_MS = 60_000;
const POLL_MS = 15_000;

function newestCheck(statuses: MonitorStatus[]): number {
  return statuses.reduce((newest, row) => {
    const at = row.checkedAt ? new Date(row.checkedAt).getTime() : 0;
    return Math.max(newest, Number.isNaN(at) ? 0 : at);
  }, 0);
}

export function MonitoringBoard({
  initial,
  mailReady,
  alertsEnabled,
  recipients,
}: {
  initial: MonitorStatus[];
  mailReady: boolean;
  alertsEnabled: boolean;
  recipients: string[];
}) {
  const [state, setState] = useState<BoardState>({
    statuses: initial,
    mailReady,
    alertsEnabled,
    recipients,
  });
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const running = useRef(false);
  const latest = useRef<MonitorStatus[]>(initial);

  useEffect(() => {
    latest.current = state.statuses;
  }, [state.statuses]);

  /** Take the answers the server just gave. */
  const apply = useCallback((payload: BoardState & { alerts?: string | null }) => {
    setState((current) => ({ ...current, ...payload }));
    setNotice(payload.alerts ?? null);
    setNow(Date.now());
  }, []);

  const readStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/monitoring/status", { cache: "no-store" });
      if (!response.ok) return;
      apply((await response.json()) as BoardState);
    } catch {
      // A dropped poll is not worth a banner; the next one will do.
    }
  }, [apply]);

  const runCheck = useCallback(
    async (options: { quiet?: boolean } = {}) => {
      if (running.current) return;
      running.current = true;
      if (!options.quiet) setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/monitoring/check", { method: "POST" });
        const payload = (await response.json()) as BoardState & { error?: string; alerts?: string | null };
        if (!response.ok) {
          setError(payload.error ?? "The check could not run.");
          return;
        }
        apply(payload);
      } catch {
        setError("The check could not run. Check your connection and try again.");
      } finally {
        running.current = false;
        setBusy(false);
        setNow(Date.now());
      }
    },
    [apply],
  );

  useEffect(() => {
    // One timer, two jobs: move the words along every 15 seconds, and run the
    // probes only when nobody has checked recently.
    const timer = setInterval(() => {
      setNow(Date.now());
      const age = Date.now() - newestCheck(latest.current);
      // Watching the board keeps it fresh: a stale answer means someone should
      // probe, and probing writes nothing but a status row.
      if (age > STALE_AFTER_MS) void runCheck({ quiet: true });
      else void readStatus();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [readStatus, runCheck]);

  const down = useMemo(() => state.statuses.filter((row) => row.ok === false), [state.statuses]);
  const clock = useMemo(() => new Date(now), [now]);
  const newest = newestCheck(state.statuses);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[11.5px] text-muted" aria-live="polite">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          Live · last checked {newest > 0 ? describeAge(new Date(newest).toISOString(), clock) : "never"}
        </p>
        <Button type="button" size="sm" variant="secondary" onClick={() => void runCheck()} disabled={busy}>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
          {busy ? "Checking" : "Check now"}
        </Button>
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
                  : "A site is not answering. An alert email is on its way to the recipients set under Alerts."}
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
        <ul className="divide-y divide-line border-y border-line bg-surface">
          {state.statuses.map((row) => (
            <li key={row.key} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[13px] font-semibold text-navy">{row.site}</span>
                    <span className="text-[11px] text-muted">
                      {row.server}
                      {row.environment ? ` · ${row.environment}` : ""}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11.5px] text-body">{row.url}</p>
                </div>

                <span
                  className={
                    row.ok === null
                      ? "inline-flex h-5 items-center rounded-full bg-[#eef2f8] px-2 text-[10.5px] uppercase tracking-[0.06em] text-body"
                      : row.ok
                        ? "inline-flex h-5 items-center rounded-full bg-success-soft px-2 text-[10.5px] uppercase tracking-[0.06em] text-success"
                        : "inline-flex h-5 items-center rounded-full bg-danger-soft px-2 text-[10.5px] uppercase tracking-[0.06em] text-danger"
                  }
                >
                  {row.ok === null ? "Not checked" : row.ok ? "Up" : "Down"}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                {row.ok === false ? (
                  <span className="text-danger">{row.error ?? "No answer."}</span>
                ) : row.statusCode !== null ? (
                  <span>
                    HTTP {row.statusCode}
                    {row.latencyMs !== null ? ` · ${row.latencyMs} ms` : ""}
                  </span>
                ) : (
                  <span>Waiting for the first check.</span>
                )}
                {row.since && (
                  <span>
                    {row.ok === false ? "Down for" : row.ok ? "Up for" : "Known for"}{" "}
                    {describeSince(row.since, clock)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Activity className="h-3 w-3" aria-hidden />
                  checked {describeAge(row.checkedAt, clock)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
