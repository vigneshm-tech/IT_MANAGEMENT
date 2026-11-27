import { roleOf, isLeadership } from "./roles";
import type { RoleId } from "./roles";
import { TASK_WINDOW } from "./config";

/* -------------------------------------------------------------------------- */
/*  Task creation window                                                      */
/* -------------------------------------------------------------------------- */

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  );
  return asUtc - date.getTime();
}

/** Convert a wall-clock time of day in `timeZone` to the matching UTC instant. */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0) + minuteOfDay * 60_000;
  let offset = zoneOffsetMs(new Date(guess), timeZone);
  let instant = new Date(guess - offset);
  const secondOffset = zoneOffsetMs(instant, timeZone);
  if (secondOffset !== offset) {
    offset = secondOffset;
    instant = new Date(guess - offset);
  }
  return instant;
}

/* -------------------------------------------------------------------------- */
/*  Per-user enrolment windows                                                */
/* -------------------------------------------------------------------------- */

/**
 * A window an administrator saved for one person, as minutes from midnight.
 *
 * It is only ever honoured for a role that can open the Tasks module — a
 * receptionist with a 07:00–13:00 window has no tasks to raise — and when one
 * exists it replaces the office-hours rule rather than adding to it.
 */
export type TaskWindowSettings = {
  startMinute: number;
  endMinute: number;
};

const CLOCK = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/** `"09:30"` or `"09:30:00"` → `570`. Null for anything that is not a clock. */
export function clockMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = CLOCK.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** `570` → `"09:30"`. */
export function formatClock(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60) % 24;
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * A saved pair, or null when it is incomplete, unreadable or does not run
 * forwards. A window that ends before it starts is never silently corrected:
 * it is dropped and the office-hours rule applies, so a typo cannot lock
 * somebody out by accident.
 */
export function taskWindowSettings(start: unknown, end: unknown): TaskWindowSettings | null {
  const from = clockMinutes(start);
  const to = clockMinutes(end);
  if (from === null || to === null || from >= to) return null;
  return { startMinute: from, endMinute: to };
}

/** The window actually in force, resolved the way the guard resolves it. */
export function effectiveWindow(settings: TaskWindowSettings | null | undefined): TaskWindowSettings {
  if (settings) return settings;
  return {
    startMinute: TASK_WINDOW.startHour * 60,
    endMinute: TASK_WINDOW.endHour * 60,
  };
}

/* -------------------------------------------------------------------------- */
/*  The window itself                                                         */
/* -------------------------------------------------------------------------- */

export type TaskWindow = {
  /** True when the role is limited to office hours. */
  restricted: boolean;
  canCreate: boolean;
  /** This person's own window is in force instead of the office-hours rule. */
  personal: boolean;
  /** ISO instants for the current / next window. */
  opensAt: string;
  closesAt: string;
  nextChangeAt: string | null;
  /** Human friendly explanation, safe to show in the UI. */
  message: string;
  /** The window in force, e.g. `"07:00–13:00"`. */
  label: string;
  /** Wall-clock time in the window timezone, e.g. "14:32". */
  localTime: string;
  timeZone: string;
};

function zoneLabel(timeZone: string): string {
  return timeZone === "Asia/Kolkata" ? "IST" : timeZone;
}

export function taskWindowFor(
  role: RoleId,
  now: Date = new Date(),
  settings: TaskWindowSettings | null = null,
): TaskWindow {
  const { startHour, endHour, timeZone } = TASK_WINDOW;
  const zone = zoneLabel(timeZone);
  const personal = settings !== null;
  // A personal window replaces the rule for that person, so even a role that
  // normally raises tasks around the clock is held to it.
  const restricted = personal || !roleOf(role).unrestrictedTaskCreation;

  const window = effectiveWindow(settings);
  const opensLabel = formatClock(window.startMinute);
  const closesLabel = formatClock(window.endMinute);
  const label = `${opensLabel}–${closesLabel}`;

  const parts = zonedParts(now, timeZone);
  const localTime = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;

  const openToday = zonedTimeToUtc(parts.year, parts.month, parts.day, window.startMinute, timeZone);
  const closeToday = zonedTimeToUtc(parts.year, parts.month, parts.day, window.endMinute, timeZone);
  const tomorrow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const nextDay = zonedParts(tomorrow, "UTC"); // keeps calendar date arithmetic simple

  const openTomorrow = zonedTimeToUtc(
    nextDay.year,
    nextDay.month,
    nextDay.day,
    window.startMinute,
    timeZone,
  );
  const closeTomorrow = zonedTimeToUtc(
    nextDay.year,
    nextDay.month,
    nextDay.day,
    window.endMinute,
    timeZone,
  );

  const insideToday = now >= openToday && now < closeToday;

  if (!restricted) {
    return {
      restricted: false,
      canCreate: true,
      personal: false,
      opensAt: openToday.toISOString(),
      closesAt: closeToday.toISOString(),
      nextChangeAt: null,
      message: "24-hour access — leads, managers and management can raise tasks any time.",
      label,
      localTime,
      timeZone,
    };
  }

  if (insideToday) {
    return {
      restricted: true,
      canCreate: true,
      personal,
      opensAt: openToday.toISOString(),
      closesAt: closeToday.toISOString(),
      nextChangeAt: closeToday.toISOString(),
      message: personal
        ? `Task creation is open until ${closesLabel} ${zone} — your own window.`
        : `Task creation is open until ${endHour}:00 ${zone}.`,
      label,
      localTime,
      timeZone,
    };
  }

  const beforeOpen = now < openToday;
  return {
    restricted: true,
    canCreate: false,
    personal,
    opensAt: (beforeOpen ? openToday : openTomorrow).toISOString(),
    closesAt: (beforeOpen ? closeToday : closeTomorrow).toISOString(),
    nextChangeAt: (beforeOpen ? openToday : openTomorrow).toISOString(),
    message: personal
      ? beforeOpen
        ? `Your task window opens at ${opensLabel} ${zone}.`
        : `Your task window is closed for today — it reopens at ${opensLabel} ${zone}.`
      : beforeOpen
        ? `Engineer task creation opens at ${startHour}:00 ${zone}.`
        : `Engineer task creation is closed for today — reopens at ${startHour}:00 ${zone}.`,
    label,
    localTime,
    timeZone,
  };
}

/**
 * Server-side guard used by the task server action. Never trust the client's
 * clock: this runs with the server's `now`, and with the window read from the
 * database — not from the form.
 */
export function assertCanCreateTask(
  role: RoleId,
  now: Date = new Date(),
  settings: TaskWindowSettings | null = null,
): TaskWindow {
  const window = taskWindowFor(role, now, settings);
  if (!window.canCreate) {
    throw new Error(window.message);
  }
  return window;
}

/** Convenience for UI copy. */
export function taskWindowLabel(role: RoleId): string {
  return isLeadership(role) ? "24 hours" : "09:00 – 18:00 IST";
}
