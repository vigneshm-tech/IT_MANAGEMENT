/**
 * Service targets measured on business hours.
 *
 * Zammad keeps a calendar (working days, opening hours, timezone) and measures
 * every SLA against it, so a ticket raised at 17:50 on a Friday with a four-hour
 * target is not late at 09:00 on Monday. That is the whole point of phase 3: a
 * promise measured in wall-clock hours is a promise nobody can keep.
 *
 * Calendars here carry a fixed UTC offset rather than an IANA zone. Every office
 * we serve is in India, which has no daylight saving, so an offset is exact —
 * and it keeps the maths testable without shipping a timezone database.
 */

import { priorityMeta, type TicketPriority } from "./core";

export type BusinessCalendar = {
  id: string;
  name: string;
  /** Minutes east of UTC. India is 330. */
  utcOffsetMinutes: number;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Minutes after local midnight, e.g. 540 for 09:00. */
  startMinute: number;
  endMinute: number;
  status: "active" | "inactive";
  sortOrder: number;
};

/**
 * The fallback calendar: Monday to Friday, 09:00–18:00 IST. Used when a rule
 * points at a calendar that has since been deleted, and as the seed.
 */
export const DEFAULT_CALENDAR: BusinessCalendar = {
  id: "ist-business",
  name: "India business hours",
  utcOffsetMinutes: 330,
  days: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 18 * 60,
  status: "active",
  sortOrder: 10,
};

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Monday first, which is how the form offers the working days. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const MINUTES_PER_DAY = 1440;

/** Minutes since the epoch, in the calendar's own local time. */
function localMinutes(date: Date, calendar: BusinessCalendar): number {
  return Math.floor(date.getTime() / 60_000) + calendar.utcOffsetMinutes;
}

function fromLocalMinutes(minutes: number, calendar: BusinessCalendar): Date {
  return new Date((minutes - calendar.utcOffsetMinutes) * 60_000);
}

/** 0 = Sunday … 6 = Saturday. Day 0 of the epoch was a Thursday. */
function weekday(local: number): number {
  const dayIndex = Math.floor(local / MINUTES_PER_DAY);
  return ((((dayIndex + 4) % 7) + 7) % 7);
}

function worksOn(local: number, calendar: BusinessCalendar): boolean {
  return calendar.days.includes(weekday(local));
}

function dayStart(local: number, calendar: BusinessCalendar): number {
  return Math.floor(local / MINUTES_PER_DAY) * MINUTES_PER_DAY + calendar.startMinute;
}

function dayEnd(local: number, calendar: BusinessCalendar): number {
  return Math.floor(local / MINUTES_PER_DAY) * MINUTES_PER_DAY + calendar.endMinute;
}

/**
 * The instant itself if it is inside a working window, otherwise the next one.
 * A closed day, a weekend and 19:00 on a Tuesday all land on the next opening.
 */
export function nextBusinessInstant(
  date: Date,
  calendar: BusinessCalendar = DEFAULT_CALENDAR,
): Date {
  let local = localMinutes(date, calendar);

  for (let step = 0; step < 400; step += 1) {
    if (worksOn(local, calendar)) {
      const start = dayStart(local, calendar);
      const end = dayEnd(local, calendar);
      if (local < start) return fromLocalMinutes(start, calendar);
      if (local < end) return fromLocalMinutes(local, calendar);
    }
    local = Math.floor(local / MINUTES_PER_DAY) * MINUTES_PER_DAY + MINUTES_PER_DAY;
  }

  return date;
}

/** Whether an instant falls inside working hours. */
export function isBusinessTime(date: Date, calendar: BusinessCalendar): boolean {
  const local = localMinutes(date, calendar);
  return worksOn(local, calendar) && local >= dayStart(local, calendar) && local < dayEnd(local, calendar);
}

/**
 * Adds business minutes: 17:00 on Friday plus 120 minutes is 11:00 on Monday.
 * The walk steps window by window, so a calendar with a lunch gap needs no
 * special case — the gap is simply closed time.
 */
export function addBusinessMinutes(
  from: Date | string,
  minutes: number,
  calendar: BusinessCalendar = DEFAULT_CALENDAR,
): Date {
  const start = typeof from === "string" ? new Date(from) : from;
  if (!Number.isFinite(start.getTime())) return start;

  const whole = Math.max(0, Math.round(minutes));
  let cursor = localMinutes(nextBusinessInstant(start, calendar), calendar);
  let left = whole;

  for (let step = 0; step < 4000 && left > 0; step += 1) {
    const end = dayEnd(cursor, calendar);
    const available = Math.max(0, end - cursor);
    if (left <= available) {
      cursor += left;
      left = 0;
      break;
    }
    left -= available;
    cursor = localMinutes(nextBusinessInstant(fromLocalMinutes(end + 1, calendar), calendar), calendar);
  }

  return fromLocalMinutes(cursor, calendar);
}

/** Open minutes between two instants; 0 when the end is not after the start. */
export function businessMinutesBetween(
  start: Date | string,
  end: Date | string,
  calendar: BusinessCalendar = DEFAULT_CALENDAR,
): number {
  const from = typeof start === "string" ? new Date(start) : start;
  const to = typeof end === "string" ? new Date(end) : end;
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return 0;

  const limit = localMinutes(to, calendar);
  let cursor = localMinutes(nextBusinessInstant(from, calendar), calendar);
  let total = 0;

  for (let step = 0; step < 4000 && cursor < limit; step += 1) {
    const end = dayEnd(cursor, calendar);
    const until = Math.min(end, limit);
    total += Math.max(0, until - cursor);
    cursor = localMinutes(nextBusinessInstant(fromLocalMinutes(end + 1, calendar), calendar), calendar);
  }

  return total;
}

/** "3h 20m", "2d 4h", "45m" — how long a promise has left. */
export function formatCountdown(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  const total = Math.abs(Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const rest = total % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
  return `${rest}m`;
}

/* -------------------------------------------------------------------------- */
/*  Service rules                                                             */
/* -------------------------------------------------------------------------- */

export type SlaRule = {
  id: string;
  name: string;
  /** Null means "any queue". */
  queueId: string | null;
  /** Resolved for display; not stored on the row. */
  queueName: string;
  /** Null means "any priority". */
  priority: TicketPriority | null;
  firstResponseMinutes: number;
  resolveMinutes: number;
  calendarId: string;
  status: "active" | "inactive";
  sortOrder: number;
};

export const SLA_SEED: SlaRule[] = [
  {
    id: "urgent",
    name: "Urgent, any queue",
    queueId: null,
    queueName: "",
    priority: "urgent",
    firstResponseMinutes: 30,
    resolveMinutes: 240,
    calendarId: DEFAULT_CALENDAR.id,
    status: "active",
    sortOrder: 10,
  },
  {
    id: "security",
    name: "Security queue",
    queueId: "security",
    queueName: "Security",
    priority: null,
    firstResponseMinutes: 60,
    resolveMinutes: 480,
    calendarId: DEFAULT_CALENDAR.id,
    status: "active",
    sortOrder: 20,
  },
  {
    id: "infrastructure",
    name: "Infrastructure queue",
    queueId: "infrastructure",
    queueName: "Infrastructure",
    priority: null,
    firstResponseMinutes: 120,
    resolveMinutes: 1440,
    calendarId: DEFAULT_CALENDAR.id,
    status: "active",
    sortOrder: 30,
  },
  {
    id: "standard",
    name: "Everything else",
    queueId: null,
    queueName: "",
    priority: null,
    firstResponseMinutes: 480,
    resolveMinutes: 2880,
    calendarId: DEFAULT_CALENDAR.id,
    status: "active",
    sortOrder: 90,
  },
];

/**
 * The most specific rule wins: queue and priority together, then queue alone,
 * then priority alone, then the catch-all. Ties fall back to sort order, so the
 * answer never depends on row order in the table.
 */
export function matchSla(
  rules: SlaRule[],
  ticket: { queueId: string | null; priority: string },
): SlaRule | null {
  let best: SlaRule | null = null;
  let bestScore = -1;

  for (const rule of rules) {
    if (rule.status !== "active") continue;
    if (rule.queueId && rule.queueId !== ticket.queueId) continue;
    if (rule.priority && rule.priority !== ticket.priority) continue;

    const score = (rule.queueId ? 2 : 0) + (rule.priority ? 1 : 0);
    if (
      score > bestScore ||
      (score === bestScore && best && rule.sortOrder < best.sortOrder)
    ) {
      best = rule;
      bestScore = score;
    }
  }

  return best;
}

/** "Security queue · any priority · reply in 60m, resolve in 480m on India business hours". */
export function slaSummary(rule: SlaRule, calendars: BusinessCalendar[] = []): string {
  const calendar = calendars.find((item) => item.id === rule.calendarId);
  const queue = rule.queueId ? rule.queueName || rule.queueId : "any queue";
  const priority = rule.priority ? `${rule.priority} priority` : "any priority";
  return `${queue} · ${priority} · reply in ${rule.firstResponseMinutes}m, resolve in ${rule.resolveMinutes}m${
    calendar ? ` on ${calendar.name}` : ""
  }`;
}

export function calendarFor(
  calendars: BusinessCalendar[],
  id: string | null | undefined,
): BusinessCalendar {
  return (
    calendars.find((calendar) => calendar.id === id) ??
    calendars.find((calendar) => calendar.status === "active") ??
    DEFAULT_CALENDAR
  );
}

export type SlaTargets = {
  slaId: string | null;
  firstResponseDueAt: string | null;
  resolveDueAt: string;
};

/**
 * What was promised when the ticket was raised. A ticket with no matching rule
 * still gets a resolve target — the priority ladder from phase 1, now measured
 * on the office clock rather than the wall clock.
 */
export function computeSlaTargets(
  ticket: { createdAt: string; priority: string; queueId: string | null },
  rules: SlaRule[],
  calendars: BusinessCalendar[],
): SlaTargets {
  const rule = matchSla(rules, ticket);
  const calendar = calendarFor(calendars, rule?.calendarId);

  if (!rule) {
    const hours = priorityMeta(ticket.priority).resolveHours;
    return {
      slaId: null,
      firstResponseDueAt: null,
      resolveDueAt: addBusinessMinutes(ticket.createdAt, hours * 60, calendar).toISOString(),
    };
  }

  return {
    slaId: rule.id,
    firstResponseDueAt: addBusinessMinutes(
      ticket.createdAt,
      rule.firstResponseMinutes,
      calendar,
    ).toISOString(),
    resolveDueAt: addBusinessMinutes(ticket.createdAt, rule.resolveMinutes, calendar).toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Where a ticket stands against its promise                                 */
/* -------------------------------------------------------------------------- */

export type SlaTicketLike = {
  state: string;
  createdAt: string;
  dueAt: string | null;
  closedAt: string | null;
  firstResponseAt: string | null;
  firstResponseDueAt: string | null;
  firstResponseBreachedAt: string | null;
  resolveBreachedAt: string | null;
};

export type SlaState = {
  /** No resolve target at all — a ticket raised before phase 3, say. */
  tracked: boolean;
  firstResponseDueAt: string | null;
  resolveDueAt: string | null;
  firstResponseMet: boolean;
  firstResponseBreached: boolean;
  resolveBreached: boolean;
  atRisk: boolean;
  settled: boolean;
  /** "1st reply due in 20m", "Breached 1h 20m", "Met" … */
  label: string;
  /** The deadline the label is talking about. */
  focus: "first-response" | "resolve";
};

/** The stretch of the promise that is left, in minutes. */
function minutesBetween(from: string, to: Date): number {
  return Math.round((new Date(from).getTime() - to.getTime()) / 60_000);
}

/**
 * At risk means inside the last quarter of the window (or the last 30 minutes,
 * whichever is longer and later) — the point where an agent should look now,
 * not the moment it is already too late.
 */
function riskWindow(totalMinutes: number): number {
  return Math.max(30, Math.round(totalMinutes / 4));
}

/**
 * Has a promise run out? True even before the sweep has stamped the breach, so
 * the list and the "breached" count agree with the countdown an agent can see.
 */
export function isSlaOverdue(ticket: SlaTicketLike, now: Date = new Date()): boolean {
  if (ticket.state === "closed" || ticket.state === "merged") return false;
  if (
    !ticket.firstResponseAt &&
    ticket.firstResponseDueAt &&
    new Date(ticket.firstResponseDueAt).getTime() < now.getTime()
  ) {
    return true;
  }
  return Boolean(ticket.dueAt && new Date(ticket.dueAt).getTime() < now.getTime());
}

export function slaState(ticket: SlaTicketLike, now: Date = new Date()): SlaState {
  const tracked = Boolean(ticket.dueAt || ticket.firstResponseDueAt);
  const settled = ticket.state === "closed" || ticket.state === "merged";
  const firstResponseMet = Boolean(ticket.firstResponseAt);
  const firstResponseBreached = Boolean(ticket.firstResponseBreachedAt);
  const resolveBreached = Boolean(ticket.resolveBreachedAt);

  if (!tracked) {
    return {
      tracked: false,
      firstResponseDueAt: null,
      resolveDueAt: null,
      firstResponseMet: false,
      firstResponseBreached: false,
      resolveBreached: false,
      atRisk: false,
      settled,
      label: settled ? "Closed" : "No target",
      focus: "resolve",
    };
  }

  const resolveLeft = ticket.dueAt ? minutesBetween(ticket.dueAt, now) : null;
  const firstLeft =
    !firstResponseMet && ticket.firstResponseDueAt
      ? minutesBetween(ticket.firstResponseDueAt, now)
      : null;

  const resolveTotal = ticket.dueAt
    ? Math.max(0, (new Date(ticket.dueAt).getTime() - new Date(ticket.createdAt).getTime()) / 60_000)
    : 0;

  // An unanswered first response is the nearer promise until it is answered.
  const focus: "first-response" | "resolve" =
    firstLeft !== null && (resolveLeft === null || firstLeft <= resolveLeft)
      ? "first-response"
      : "resolve";
  const focusLeft = focus === "first-response" ? firstLeft! : (resolveLeft ?? 0);
  const focusBreached = focus === "first-response" ? firstResponseBreached : resolveBreached;

  const atRisk = !settled && !focusBreached && focusLeft > 0 && focusLeft <= riskWindow(resolveTotal);

  if (settled) {
    const late =
      ticket.closedAt && ticket.dueAt
        ? new Date(ticket.closedAt).getTime() > new Date(ticket.dueAt).getTime()
        : false;
    return {
      tracked,
      firstResponseDueAt: ticket.firstResponseDueAt,
      resolveDueAt: ticket.dueAt,
      firstResponseMet,
      firstResponseBreached,
      resolveBreached,
      atRisk: false,
      settled,
      label: ticket.state === "merged" ? "Merged" : late ? "Closed late" : "Met",
      focus,
    };
  }

  if (focusBreached || focusLeft < 0) {
    return {
      tracked,
      firstResponseDueAt: ticket.firstResponseDueAt,
      resolveDueAt: ticket.dueAt,
      firstResponseMet,
      firstResponseBreached,
      resolveBreached,
      atRisk: false,
      settled,
      label:
        focus === "first-response"
          ? `1st reply late ${formatCountdown(focusLeft)}`
          : `Breached ${formatCountdown(focusLeft)}`,
      focus,
    };
  }

  return {
    tracked,
    firstResponseDueAt: ticket.firstResponseDueAt,
    resolveDueAt: ticket.dueAt,
    firstResponseMet,
    firstResponseBreached,
    resolveBreached,
    atRisk,
    settled,
    label:
      focus === "first-response"
        ? `1st reply due in ${formatCountdown(focusLeft)}`
        : `${atRisk ? "At risk · " : ""}${formatCountdown(focusLeft)} left`,
    focus,
  };
}

/** Business minutes an agent actually took to answer — the median uses this. */
export function firstResponseMinutes(
  ticket: { createdAt: string; firstResponseAt: string | null },
  calendar: BusinessCalendar = DEFAULT_CALENDAR,
): number | null {
  if (!ticket.firstResponseAt) return null;
  return businessMinutesBetween(ticket.createdAt, ticket.firstResponseAt, calendar);
}

/* Admin validation ---------------------------------------------------------- */

export function timeToMinutes(raw: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function calendarError(input: {
  name: string;
  days: number[];
  startMinute: number | null;
  endMinute: number | null;
}): string | null {
  if (input.name.trim().length < 3) return "Give the shift a name of at least 3 characters.";
  if (input.name.trim().length > 60) return "Keep the shift name under 60 characters.";
  if (input.days.length === 0) return "Pick at least one working day.";
  if (input.startMinute === null || input.endMinute === null) return "Set an opening and a closing time.";
  if (input.startMinute >= input.endMinute) return "The closing time has to be after the opening time.";
  if (input.endMinute - input.startMinute < 60) return "A shift shorter than an hour is not a shift.";
  return null;
}

export function slaError(input: {
  name: string;
  firstResponseMinutes: number;
  resolveMinutes: number;
}): string | null {
  if (input.name.trim().length < 3) return "Give the service target a name of at least 3 characters.";
  if (input.name.trim().length > 60) return "Keep the target name under 60 characters.";
  if (!Number.isFinite(input.firstResponseMinutes) || input.firstResponseMinutes <= 0) {
    return "Set a first-response target in minutes.";
  }
  if (!Number.isFinite(input.resolveMinutes) || input.resolveMinutes <= 0) {
    return "Set a resolution target in minutes.";
  }
  if (input.resolveMinutes < input.firstResponseMinutes) {
    return "The resolution target cannot be shorter than the first-response target.";
  }
  if (input.resolveMinutes > 60 * 24 * 30) return "Keep the resolution target inside 30 working days.";
  return null;
}
