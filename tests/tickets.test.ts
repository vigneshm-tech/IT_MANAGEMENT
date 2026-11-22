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
  checklistProgress,
  checklistTitleError,
  linkKindLabel,
  macroSummary,
  macroActionError,
  mergeError,
  moduleNameError,
  normaliseChecklistTitle,
  ticketSlug,
  freeTicketSlugId,
  textModuleBodyError,
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

test("the state ladder has three open states and two that end the work", () => {
  assert.deepEqual(
    TICKET_STATES.map((state) => state.id),
    ["new", "open", "pending", "closed", "merged"],
  );
  assert.equal(stateMeta("closed").countsAsOpen, false);
  assert.equal(stateMeta("pending").countsAsOpen, false);
  assert.equal(stateMeta("open").countsAsOpen, true);
  assert.equal(stateMeta("nonsense").id, "new", "an unknown state reads as New");
});

test("any state may follow another, but never itself", () => {
  assert.deepEqual(nextStates("open"), ["new", "pending", "closed", "merged"]);
  assert.deepEqual(nextStates("closed"), ["new", "open", "pending", "merged"]);
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

/* Phase 2 — checklists, links, macros, text modules ------------------------- */

test("a merged ticket leaves the open views but keeps its history", () => {
  const rows = [
    { state: "open", ownerId: "u-arun" },
    { state: "merged", ownerId: "u-arun" },
    { state: "closed", ownerId: "u-arun" },
  ];
  assert.equal(ticketsForView(rows, "open", "u-arun").length, 1);
  assert.deepEqual(
    ticketsForView(rows, "closed", "u-arun").map((row) => row.state),
    ["merged", "closed"],
    "merged work is no longer open, and still readable",
  );
  assert.equal(stateMeta("merged").countsAsOpen, false);
});

test("the checklist counts its ticks and reports a percentage", () => {
  assert.deepEqual(checklistProgress([{ done: true }, { done: false }, { done: true }]), {
    done: 2,
    total: 3,
    label: "2/3",
    percent: 67,
  });
  assert.equal(checklistProgress([]).label, "—");
  assert.equal(checklistProgress([{ done: true }]).percent, 100);
});

test("checklist titles are trimmed and kept short", () => {
  assert.equal(normaliseChecklistTitle("  Call   the   ISP "), "Call the ISP");
  assert.match(String(checklistTitleError("x")), /title/);
  assert.match(String(checklistTitleError("x".repeat(161))), /under 160/);
  assert.equal(checklistTitleError("Call the ISP"), null);
});

test("link kinds have labels, and an unknown kind reads as Related", () => {
  assert.equal(linkKindLabel("duplicate"), "Duplicate");
  assert.equal(linkKindLabel("parent"), "Parent");
  assert.equal(linkKindLabel("nonsense"), "Related");
});

test("a merge needs a different, live target", () => {
  assert.match(String(mergeError({ id: "TT-1", state: "open" }, null)), /Pick the ticket/);
  assert.match(
    String(mergeError({ id: "TT-1", state: "open" }, { id: "TT-1", state: "open" })),
    /itself/,
  );
  assert.match(
    String(mergeError({ id: "TT-1", state: "open" }, { id: "TT-2", state: "merged" })),
    /already merged/,
  );
  assert.match(
    String(mergeError({ id: "TT-1", state: "merged" }, { id: "TT-2", state: "open" })),
    /already merged/,
  );
  assert.equal(mergeError({ id: "TT-1", state: "open" }, { id: "TT-2", state: "open" }), null);
});

test("a macro reads back the changes it applies", () => {
  assert.equal(
    macroSummary({
      setState: "open",
      setPriority: "high",
      setQueueName: "Infrastructure",
      addTag: "escalation",
    }),
    "state → Open, priority → High, queue → Infrastructure, tag +escalation",
  );
  assert.equal(macroSummary({}), "Adds a note only");
});

test("a macro must change at least one thing", () => {
  assert.match(String(macroActionError({})), /at least one change/);
  assert.equal(macroActionError({ addTag: "escalation" }), null);
  assert.equal(macroActionError({ setState: "closed" }), null);
});

test("text module and macro names are unique and bounded", () => {
  const existing = [{ id: "acknowledge", name: "Acknowledge and set expectations" }];
  assert.match(String(moduleNameError(" ab ")), /at least 3/);
  assert.match(
    String(moduleNameError(" acknowledge and SET expectations ", existing)),
    /already exists/,
  );
  assert.equal(moduleNameError("Acknowledge and set expectations", existing, {
    ignoreId: "acknowledge",
  }), null);
});

test("a snippet has to carry some text", () => {
  assert.match(String(textModuleBodyError("  too short")), /at least 10/);
  assert.equal(textModuleBodyError("Thanks for raising this — we are on it."), null);
});

test("text module and macro ids are slugs that never collide", () => {
  assert.equal(ticketSlug("Ask for a screenshot"), "ask-for-a-screenshot");
  assert.equal(freeTicketSlugId("Ask for a screenshot", []), "ask-for-a-screenshot");
  assert.equal(
    freeTicketSlugId("Acknowledge", [{ id: "acknowledge" }, { id: "acknowledge-2" }]),
    "acknowledge-3",
  );
});
