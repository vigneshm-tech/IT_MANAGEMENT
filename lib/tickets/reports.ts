/**
 * Reporting: the numbers a service desk is asked for on a Monday morning.
 *
 * Everything here is derived from the tickets themselves — no counters to keep
 * in step, no nightly roll-up table to go stale. A reopened ticket carries a
 * `reopenCount`, a first reply carries `firstResponseAt`, and a promise carries
 * its due date, so the report can be rebuilt for any moment in time.
 *
 * Weeks are Indian business weeks (Monday 00:00 IST), which is why the offset
 * is a parameter rather than an assumption buried in a formatter.
 */

import { TICKET_STATES, isOpenTicket } from "./core";
import { slaState } from "./sla";

export type TicketReportTicket = {
  id: string;
  state: string;
  priority: string;
  queueName: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  dueAt: string | null;
  firstResponseAt: string | null;
  firstResponseDueAt: string | null;
  firstResponseBreachedAt: string | null;
  resolveBreachedAt: string | null;
  reopenCount: number;
};

export type ReportBucket = {
  name: string;
  open: number;
  closed: number;
  total: number;
};

export type ReportWeek = {
  /** ISO date of the Monday, local time. */
  weekStart: string;
  label: string;
  created: number;
  closed: number;
};

export type TicketReport = {
  totals: { open: number; pending: number; closed: number; merged: number; all: number };
  byState: { state: string; label: string; count: number }[];
  byQueue: ReportBucket[];
  byOwner: ReportBucket[];
  weeks: ReportWeek[];
  firstResponse: {
    /** Median business minutes to the first agent reply. */
    medianMinutes: number | null;
    answered: number;
    waiting: number;
  };
  reopen: { reopened: number; closedEver: number; percent: number };
  sla: { tracked: number; breached: number; atRisk: number };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shift(date: Date, offsetMinutes: number): Date {
  return new Date(date.getTime() + offsetMinutes * 60_000);
}

function localStamp(date: Date, offsetMinutes: number): string {
  const local = shift(date, offsetMinutes);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(
    local.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Monday 00:00 local, as an instant. */
function weekStartOf(date: Date, offsetMinutes: number): Date {
  const local = shift(date, offsetMinutes);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const day = new Date(midnight).getUTCDay();
  const back = (day + 6) % 7;
  return new Date(midnight - back * 86_400_000 - offsetMinutes * 60_000);
}

function weekLabel(start: Date, offsetMinutes: number): string {
  const local = shift(start, offsetMinutes);
  return `${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function bucket(name: string, rows: TicketReportTicket[]): ReportBucket {
  const open = rows.filter(isOpenTicket).length;
  const closed = rows.length - open;
  return { name, open, closed, total: rows.length };
}

function groupBy(
  tickets: TicketReportTicket[],
  key: (ticket: TicketReportTicket) => string,
  fallback: string,
): ReportBucket[] {
  const groups = new Map<string, TicketReportTicket[]>();
  for (const ticket of tickets) {
    const name = key(ticket).trim() || fallback;
    const rows = groups.get(name) ?? [];
    rows.push(ticket);
    groups.set(name, rows);
  }
  return [...groups.entries()]
    .map(([name, rows]) => bucket(name, rows))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export function buildTicketReport(
  tickets: TicketReportTicket[],
  now: Date = new Date(),
  options: { weeks?: number; offsetMinutes?: number } = {},
): TicketReport {
  const weeks = Math.max(1, Math.min(26, options.weeks ?? 6));
  const offsetMinutes = options.offsetMinutes ?? 330;

  const open = tickets.filter((ticket) => isOpenTicket(ticket));
  const totals = {
    open: open.filter((ticket) => ticket.state !== "pending").length,
    pending: tickets.filter((ticket) => ticket.state === "pending").length,
    closed: tickets.filter((ticket) => ticket.state === "closed").length,
    merged: tickets.filter((ticket) => ticket.state === "merged").length,
    all: tickets.length,
  };

  const byState = TICKET_STATES.map((state) => ({
    state: state.id,
    label: state.label,
    count: tickets.filter((ticket) => ticket.state === state.id).length,
  })).filter((row) => row.count > 0);

  const thisWeek = weekStartOf(now, offsetMinutes);
  const weekRows: ReportWeek[] = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = new Date(thisWeek.getTime() - index * 7 * 86_400_000);
    const end = new Date(start.getTime() + 7 * 86_400_000);
    const created = tickets.filter((ticket) => {
      const at = new Date(ticket.createdAt).getTime();
      return at >= start.getTime() && at < end.getTime();
    }).length;
    const closed = tickets.filter((ticket) => {
      if (!ticket.closedAt) return false;
      const at = new Date(ticket.closedAt).getTime();
      return at >= start.getTime() && at < end.getTime();
    }).length;
    weekRows.push({
      weekStart: localStamp(start, offsetMinutes),
      label: weekLabel(start, offsetMinutes),
      created,
      closed,
    });
  }

  const answered = tickets
    .filter((ticket) => ticket.firstResponseAt)
    .map((ticket) =>
      Math.max(
        0,
        Math.round(
          (new Date(ticket.firstResponseAt!).getTime() - new Date(ticket.createdAt).getTime()) /
            60_000,
        ),
      ),
    );

  const closedEver = tickets.filter(
    (ticket) => ticket.closedAt !== null || ticket.reopenCount > 0,
  ).length;
  const reopened = tickets.filter((ticket) => ticket.reopenCount > 0).length;

  const slaRows = tickets.map((ticket) => slaState(ticket, now));
  const tracked = slaRows.filter((row) => row.tracked).length;
  const breached = tickets.filter(
    (ticket) => ticket.resolveBreachedAt || ticket.firstResponseBreachedAt,
  ).length;
  const atRisk = slaRows.filter((row) => row.atRisk).length;

  return {
    totals,
    byState,
    byQueue: groupBy(
      tickets.filter((ticket) => ticket.state !== "merged"),
      (ticket) => ticket.queueName,
      "No queue",
    ),
    byOwner: groupBy(
      open.filter((ticket) => ticket.state !== "pending"),
      (ticket) => ticket.ownerName,
      "Unassigned",
    ),
    weeks: weekRows,
    firstResponse: {
      medianMinutes: median(answered),
      answered: answered.length,
      waiting: open.filter((ticket) => !ticket.firstResponseAt && ticket.firstResponseDueAt)
        .length,
    },
    reopen: {
      reopened,
      closedEver,
      percent: closedEver === 0 ? 0 : Math.round((reopened / closedEver) * 100),
    },
    sla: { tracked, breached, atRisk },
  };
}

/** The same numbers as a text/csv file, one section per question. */
export function reportCsv(report: TicketReport): string {
  const lines: string[] = [];
  const row = (cells: (string | number)[]) =>
    lines.push(cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","));

  lines.push("# Ticket report");
  row(["Metric", "Value"]);
  row(["Tickets", report.totals.all]);
  row(["Open", report.totals.open]);
  row(["Pending", report.totals.pending]);
  row(["Closed", report.totals.closed]);
  row(["Merged", report.totals.merged]);
  row(["Median first response (minutes)", report.firstResponse.medianMinutes ?? ""]);
  row(["Waiting on a first reply", report.firstResponse.waiting]);
  row(["Reopen rate (%)", report.reopen.percent]);
  row(["Reopened tickets", report.reopen.reopened]);
  row(["SLA breaches", report.sla.breached]);
  row(["SLA at risk", report.sla.atRisk]);

  lines.push("");
  lines.push("# By queue");
  row(["Queue", "Open", "Closed", "Total"]);
  for (const queue of report.byQueue) row([queue.name, queue.open, queue.closed, queue.total]);

  lines.push("");
  lines.push("# By owner");
  row(["Owner", "Open", "Closed", "Total"]);
  for (const owner of report.byOwner) row([owner.name, owner.open, owner.closed, owner.total]);

  lines.push("");
  lines.push("# By state");
  row(["State", "Tickets"]);
  for (const state of report.byState) row([state.label, state.count]);

  lines.push("");
  lines.push("# Weekly");
  row(["Week starting", "Raised", "Closed"]);
  for (const week of report.weeks) row([week.weekStart, week.created, week.closed]);

  return lines.join("\n");
}

/** "2h 5m" for a median, or "—" before anyone has been answered. */
export function reportDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
