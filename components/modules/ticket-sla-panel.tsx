import { AlertTriangle, CheckCircle2, Clock, Timer } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { SlaRule, TicketRecord } from "@/lib/records/repository";
import { formatMinutes } from "@/lib/tickets/core";
import { formatCountdown, slaState } from "@/lib/tickets/sla";

function toneClass(label: string, atRisk: boolean): string {
  if (label.startsWith("Breached") || label.includes("late")) return "text-danger";
  if (atRisk) return "text-warning";
  return "text-navy";
}

/**
 * The promise, on the ticket. Everything here is read from the ticket itself —
 * the rule that matched when it was raised, not the rule that matches today.
 */
export function TicketSlaPanel({
  ticket,
  rules,
  now = new Date(),
}: {
  ticket: TicketRecord;
  rules: SlaRule[];
  now?: Date;
}) {
  const state = slaState(ticket, now);
  const rule = ticket.slaId ? rules.find((item) => item.id === ticket.slaId) : undefined;
  const tone = toneClass(state.label, state.atRisk);

  return (
    <section
      aria-label="Service target"
      className="border border-line bg-surface px-4 py-4"
    >
      <div className="flex items-center gap-2">
        <Timer className="h-3.5 w-3.5 text-muted" aria-hidden />
        <h2 className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
          Service target
        </h2>
        {state.atRisk && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-[0.06em] text-warning">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            At risk
          </span>
        )}
      </div>

      <p className={`mt-2 text-[13px] font-medium ${tone}`}>{state.label}</p>
      <p className="mt-0.5 text-[11.5px] text-muted">
        {rule
          ? rule.name
          : state.tracked
            ? "Priority default — no service target matched"
            : "No target on this ticket"}
      </p>

      <dl className="mt-3 space-y-2 border-t border-line pt-3 text-[11.5px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">First reply</dt>
          <dd className={ticket.firstResponseBreachedAt ? "text-danger" : "text-body"}>
            {ticket.firstResponseAt ? (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-success" aria-hidden />
                {formatDateTime(ticket.firstResponseAt)}
              </span>
            ) : ticket.firstResponseDueAt ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                due {formatDateTime(ticket.firstResponseDueAt)}
              </span>
            ) : (
              "—"
            )}
          </dd>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Resolve by</dt>
          <dd className="text-body">
            {ticket.dueAt ? formatDateTime(ticket.dueAt) : "—"}
          </dd>
        </div>

        {ticket.firstResponseAt && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Time to first reply</dt>
            <dd className="tabular-nums text-body">
              {formatCountdown(
                Math.max(
                  0,
                  Math.round(
                    (new Date(ticket.firstResponseAt).getTime() -
                      new Date(ticket.createdAt).getTime()) /
                      60_000,
                  ),
                ),
              )}
            </dd>
          </div>
        )}

        {rule && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Promised</dt>
            <dd className="text-body">
              {formatMinutes(rule.firstResponseMinutes)} reply ·{" "}
              {formatMinutes(rule.resolveMinutes)} resolve
            </dd>
          </div>
        )}
      </dl>

      {ticket.reopenCount > 0 && (
        <p className="mt-2 border-t border-line pt-2 text-[11.5px] text-muted">
          Reopened {ticket.reopenCount} {ticket.reopenCount === 1 ? "time" : "times"}.
        </p>
      )}
    </section>
  );
}
