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

/** Convert a wall-clock time in `timeZone` to the matching UTC instant. */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, 0, 0, 0);
  let offset = zoneOffsetMs(new Date(guess), timeZone);
  let instant = new Date(guess - offset);
  const secondOffset = zoneOffsetMs(instant, timeZone);
  if (secondOffset !== offset) {
    offset = secondOffset;
    instant = new Date(guess - offset);
  }
  return instant;
}

export type TaskWindow = {
  /** True when the role is limited to office hours. */
  restricted: boolean;
  canCreate: boolean;
  /** ISO instants for the current / next window. */
  opensAt: string;
  closesAt: string;
  nextChangeAt: string | null;
  /** Human friendly explanation, safe to show in the UI. */
  message: string;
  /** Wall-clock time in the window timezone, e.g. "14:32". */
  localTime: string;
  timeZone: string;
};

export function taskWindowFor(role: RoleId, now: Date = new Date()): TaskWindow {
  const { startHour, endHour, timeZone } = TASK_WINDOW;
  const restricted = !roleOf(role).unrestrictedTaskCreation;
  const parts = zonedParts(now, timeZone);
  const localTime = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;

  const openToday = zonedTimeToUtc(parts.year, parts.month, parts.day, startHour, timeZone);
  const closeToday = zonedTimeToUtc(parts.year, parts.month, parts.day, endHour, timeZone);
  const tomorrow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const nextDay = zonedParts(tomorrow, "UTC"); // keeps calendar date arithmetic simple

  const openTomorrow = zonedTimeToUtc(
    nextDay.year,
    nextDay.month,
    nextDay.day,
    startHour,
    timeZone,
  );
  const closeTomorrow = zonedTimeToUtc(
    nextDay.year,
    nextDay.month,
    nextDay.day,
    endHour,
    timeZone,
  );

  const insideToday = now >= openToday && now < closeToday;

  if (!restricted) {
    return {
      restricted: false,
      canCreate: true,
      opensAt: openToday.toISOString(),
      closesAt: closeToday.toISOString(),
      nextChangeAt: null,
      message: "24-hour access — leads, managers and management can raise tasks any time.",
      localTime,
      timeZone,
    };
  }

  if (insideToday) {
    return {
      restricted: true,
      canCreate: true,
      opensAt: openToday.toISOString(),
      closesAt: closeToday.toISOString(),
      nextChangeAt: closeToday.toISOString(),
      message: `Task creation is open until ${endHour}:00 IST.`,
      localTime,
      timeZone,
    };
  }

  const beforeOpen = now < openToday;
  return {
    restricted: true,
    canCreate: false,
    opensAt: (beforeOpen ? openToday : openTomorrow).toISOString(),
    closesAt: (beforeOpen ? closeToday : closeTomorrow).toISOString(),
    nextChangeAt: (beforeOpen ? openToday : openTomorrow).toISOString(),
    message: beforeOpen
      ? `Engineer task creation opens at ${startHour}:00 IST.`
      : `Engineer task creation is closed for today — reopens at ${startHour}:00 IST.`,
    localTime,
    timeZone,
  };
}

/**
 * Server-side guard used by the task server action. Never trust the client's
 * clock: this runs with the server's `now`.
 */
export function assertCanCreateTask(role: RoleId, now: Date = new Date()): TaskWindow {
  const window = taskWindowFor(role, now);
  if (!window.canCreate) {
    throw new Error(window.message);
  }
  return window;
}

/** Convenience for UI copy. */
export function taskWindowLabel(role: RoleId): string {
  return isLeadership(role) ? "24 hours" : "09:00 – 18:00 IST";
}
