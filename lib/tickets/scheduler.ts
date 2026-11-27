/**
 * The nightly sweep.
 *
 * Zammad runs a scheduler for the jobs nobody wants to do by hand: close what
 * has gone quiet, nudge what is waiting on a requester, and notice when a
 * promise has been missed. Ours is one cron route that asks this module what to
 * do, then does it through the same repository calls the UI uses — so every
 * change the sweep makes writes a `system` line in the thread, exactly like an
 * agent's.
 *
 * `planSweep` is pure: the route reads the tickets, the planner decides, the
 * route writes. That keeps the rules testable and the route boring.
 */

import { isOpenTicket } from "./core";

export type SweepSettings = {
  /** Pending for this many days and it is closed automatically. */
  autoClosePendingDays: number;
  /** Pending for this many days and the requester gets a reminder line. */
  reminderPendingDays: number;
};

export const DEFAULT_SWEEP: SweepSettings = {
  autoClosePendingDays: 7,
  reminderPendingDays: 2,
};

/** Reads the two windows from the environment, falling back to the defaults. */
export function sweepSettingsFromEnv(env: Record<string, string | undefined> = process.env): SweepSettings {
  const read = (key: string, fallback: number) => {
    const raw = env[key];
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
  };
  return {
    autoClosePendingDays: read("TICKET_AUTO_CLOSE_DAYS", DEFAULT_SWEEP.autoClosePendingDays),
    reminderPendingDays: read("TICKET_REMINDER_DAYS", DEFAULT_SWEEP.reminderPendingDays),
  };
}

export type SweepTicket = {
  id: string;
  state: string;
  updatedAt: string;
  dueAt: string | null;
  firstResponseAt: string | null;
  firstResponseDueAt: string | null;
  firstResponseBreachedAt: string | null;
  resolveBreachedAt: string | null;
  reminderSentAt: string | null;
};

export type SweepPlan = {
  close: { id: string; days: number }[];
  remind: { id: string; days: number }[];
  breach: { id: string; kind: "first-response" | "resolve"; days: number }[];
};

function daysSince(from: string, now: Date): number {
  const then = new Date(from).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/**
 * The order matters: a ticket the sweep is about to close does not also need a
 * reminder. Breaches are independent of both, because a ticket can be pending
 * (waiting on a requester) and still have missed its first-response promise.
 */
export function planSweep(
  tickets: SweepTicket[],
  now: Date = new Date(),
  settings: SweepSettings = DEFAULT_SWEEP,
): SweepPlan {
  const plan: SweepPlan = { close: [], remind: [], breach: [] };
  const closing = new Set<string>();

  for (const ticket of tickets) {
    if (ticket.state !== "pending") continue;
    const days = daysSince(ticket.updatedAt, now);
    if (days >= settings.autoClosePendingDays) {
      plan.close.push({ id: ticket.id, days });
      closing.add(ticket.id);
    } else if (days >= settings.reminderPendingDays && !ticket.reminderSentAt) {
      plan.remind.push({ id: ticket.id, days });
    }
  }

  for (const ticket of tickets) {
    if (!isOpenTicket(ticket)) continue;

    if (
      !ticket.firstResponseAt &&
      ticket.firstResponseDueAt &&
      !ticket.firstResponseBreachedAt &&
      new Date(ticket.firstResponseDueAt).getTime() < now.getTime()
    ) {
      plan.breach.push({
        id: ticket.id,
        kind: "first-response",
        days: daysSince(ticket.firstResponseDueAt, now),
      });
    }

    if (
      !closing.has(ticket.id) &&
      ticket.dueAt &&
      !ticket.resolveBreachedAt &&
      new Date(ticket.dueAt).getTime() < now.getTime()
    ) {
      plan.breach.push({
        id: ticket.id,
        kind: "resolve",
        days: daysSince(ticket.dueAt, now),
      });
    }
  }

  return plan;
}

/** What the route writes into the thread for each decision. */
export function sweepArticle(
  entry: { id: string },
  kind: "close" | "remind" | "first-response" | "resolve",
  days: number,
  settings: SweepSettings = DEFAULT_SWEEP,
): string {
  const counted = days >= 1 ? `${days} ${days === 1 ? "day" : "days"}` : "less than a day";

  switch (kind) {
    case "close":
      return `Closed automatically: the ticket had been waiting on the requester for ${counted}, past the ${settings.autoClosePendingDays}-day limit. Reopen it, or reply, and the history is all still here.`;
    case "remind":
      return `Reminder: this ticket has been waiting on the requester for ${counted}. It closes on its own after ${settings.autoClosePendingDays} days.`;
    case "first-response":
      return `SLA breached: the first-response target was missed by ${counted}.`;
    case "resolve":
      return `SLA breached: the resolution target was missed by ${counted}.`;
  }
}

export function sweepSummary(plan: SweepPlan): string {
  const parts = [
    `${plan.close.length} closed`,
    `${plan.remind.length} reminded`,
    `${plan.breach.length} breaches logged`,
  ];
  return parts.join(", ");
}
