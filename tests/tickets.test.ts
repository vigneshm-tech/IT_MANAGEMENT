import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TICKET_PRIORITIES,
  TICKET_STATES,
  TICKET_VIEWS,
  bodyError,
  channelLabel,
  closedAtFor,
  dueAtFor,
  formatMinutes,
  isOverdue,
  isTicketState,
  isTicketView,
  nextStates,
  normaliseSubject,
  normaliseTags,
  priorityMeta,
  reopenedState,
  stateMeta,
  subjectError,
  threadSummary,
  ticketsForView,
  viewCounts,
} from "../lib/tickets/core";

type Row = { state: string; ownerId: string | null; dueAt?: string | null; updatedAt?: string };

const TICKETS: Row[] = [
  { state: "new", ownerId: null },
  { state: "open", ownerId: "u-arun" },
  { state: "pending", ownerId: "u-arun" },
  { state: "closed", ownerId: "u-arun" },
  { state: "open", ownerId: "u-meera" },
];

/* Views -------------------------------------------------------------------- */

test("each ticket view reads the list its tab promises", () => {
  assert.equal(ticketsForView(TICKETS, "mine", "u-arun").length, 2, "closed work is not mine");
  assert.equal(ticketsForView(TICKETS, "unassigned", "u-arun").length, 1);
  assert.equal(ticketsForView(TICKETS, "open", "u-arun").length, 4, "pending still counts as open");
  assert.equal(ticketsForView(TICKETS, "closed", "u-arun").length, 1);
});

test("the tab counts add up across views", () => {
  const counts = viewCounts(TICKETS, "u-arun");
  assert.deepEqual(counts, { mine: 2, unassigned: 1, open: 4, closed: 1 });
  assert.equal(
    counts.open + counts.closed,
    TICKETS.length,
    "every ticket is either open or closed",
  );
});

test("an unknown view falls back to the first tab", () => {
  assert.equal(isTicketView("mine"), true);
  assert.equal(isTicketView("closed"), true);
  assert.equal(isTicketView("everything"), false);
  assert.equal(isTicketView(undefined), false);
});

/* States and priorities ---------------------------------------------------- */

test("the state ladder has one closed state and three open ones", () => {
  assert.deepEqual(
    TICKET_STATES.map((state) => state.id),
    ["new", "open", "pending", "closed"],
  );
  assert.equal(stateMeta("closed").countsAsOpen, false);
  assert.equal(stateMeta("pending").countsAsOpen, false);
  assert.equal(stateMeta("open").countsAsOpen, true);
  assert.equal(stateMeta("nonsense").id, "new", "an unknown state reads as New");
});

test("any state may follow another, but never itself", () => {
  assert.deepEqual(nextStates("open"), ["new", "pending", "closed"]);
  assert.deepEqual(nextStates("closed"), ["new", "open", "pending"]);
});

test("a closed ticket reopens as open, not as new", () => {
  assert.equal(reopenedState("closed"), "open");
  assert.equal(reopenedState("open"), "open");
});

test("closing stamps a date and every other state clears it", () => {
  const now = new Date("2026-11-19T10:00:00.000Z");
  assert.equal(closedAtFor("closed", now), "2026-11-19T10:00:00.000Z");
  assert.equal(closedAtFor("open", now), null);
  assert.equal(closedAtFor("pending", now), null);
});

test("the priority ladder orders work and sets the resolve target", () => {
  assert.deepEqual(
    TICKET_PRIORITIES.map((priority) => priority.id),
    ["low", "normal", "high", "urgent"],
  );
  assert.equal(priorityMeta("urgent").resolveHours, 4);
  assert.equal(priorityMeta("nonsense").id, "normal");
});

test("due dates count the priority's hours from creation", () => {
  const created = "2026-11-19T09:00:00.000Z";
  assert.equal(dueAtFor(created, "urgent"), "2026-11-19T13:00:00.000Z");
  assert.equal(dueAtFor(created, "low"), "2026-11-22T09:00:00.000Z");
});

test("overdue only counts open work past its due date", () => {
  const now = new Date("2026-11-19T12:00:00.000Z");
  assert.equal(isOverdue({ state: "open", dueAt: "2026-11-19T11:00:00.000Z" }, now), true);
  assert.equal(isOverdue({ state: "closed", dueAt: "2026-11-19T11:00:00.000Z" }, now), false);
  assert.equal(isOverdue({ state: "open", dueAt: "2026-11-19T13:00:00.000Z" }, now), false);
  assert.equal(isOverdue({ state: "open", dueAt: null }, now), false);
});

/* Input -------------------------------------------------------------------- */

test("subjects are trimmed, collapsed and bounded", () => {
  assert.equal(normaliseSubject("  VPN   drops\nagain "), "VPN drops again");
  assert.match(String(subjectError("vpn")), /at least 4/);
  assert.match(String(subjectError("x".repeat(161))), /under 160/);
  assert.equal(subjectError("VPN drops"), null);
});

test("a message may not be blank or unbounded", () => {
  assert.match(String(bodyError("   ")), /before sending/);
  assert.match(String(bodyError("x".repeat(8001))), /under 8000/);
  assert.equal(bodyError("It started this morning."), null);
});

test("tags are deduped, trimmed, capped and keep their first casing", () => {
  assert.deepEqual(normaliseTags(" vpn, Access ,, vpn "), ["vpn", "Access"]);
  assert.deepEqual(normaliseTags(""), []);
  assert.equal(normaliseTags(Array.from({ length: 12 }, (_, i) => `t${i}`)).length, 8);
  assert.equal(normaliseTags(["a".repeat(40)])[0].length, 24);
});

/* Thread ------------------------------------------------------------------- */

test("the thread summary counts replies, notes and booked time", () => {
  const summary = threadSummary([
    { kind: "web", internal: false, createdAt: "2026-11-19T09:00:00.000Z", timeMinutes: 0 },
    { kind: "note", internal: true, createdAt: "2026-11-19T10:00:00.000Z", timeMinutes: 30 },
    { kind: "system", internal: true, createdAt: "2026-11-19T10:05:00.000Z", timeMinutes: 0 },
    { kind: "web", internal: false, createdAt: "2026-11-19T11:00:00.000Z", timeMinutes: 15 },
  ]);
  assert.equal(summary.replies, 2);
  assert.equal(summary.notes, 2, "a system entry is internal, never a reply");
  assert.equal(summary.minutes, 45);
  assert.equal(summary.lastActivityAt, "2026-11-19T11:00:00.000Z");
});

test("booked time reads in hours and minutes", () => {
  assert.equal(formatMinutes(0), "0m");
  assert.equal(formatMinutes(35), "35m");
  assert.equal(formatMinutes(60), "1h");
  assert.equal(formatMinutes(95), "1h 35m");
});

test("states and channels are recognised from their ids", () => {
  assert.equal(isTicketState("pending"), true);
  assert.equal(isTicketState("solved"), false);
  assert.equal(channelLabel("phone"), "Phone");
  assert.equal(channelLabel("carrier-pigeon"), "Web");
});

test("the four views are the Overviews module in embryo", () => {
  assert.deepEqual(
    TICKET_VIEWS.map((view) => view.id),
    ["mine", "unassigned", "open", "closed"],
  );
});
