import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TRIGGER_SEED,
  evaluateTriggers,
  triggerError,
  triggerMatches,
  triggerSummary,
  type TicketTriggerRecord,
} from "../lib/tickets/triggers";
import {
  DEFAULT_SWEEP,
  planSweep,
  sweepArticle,
  sweepSettingsFromEnv,
  sweepSummary,
  type SweepTicket,
} from "../lib/tickets/scheduler";

const ist = (iso: string) => new Date(`${iso}+05:30`).toISOString();

const ticketInput = {
  subject: "Outage: the Chennai office link is down",
  body: "Everything is down since 09:00.",
  queueId: "service-desk",
  priority: "normal",
  state: "new",
  tags: [] as string[],
};

const trigger = (overrides: Partial<TicketTriggerRecord> & { id: string }): TicketTriggerRecord => ({
  name: overrides.id,
  description: "",
  event: "ticket.created",
  field: "subject",
  operator: "contains",
  value: "outage",
  setState: null,
  setPriority: null,
  setQueue: null,
  setQueueName: "",
  addTag: "",
  note: "",
  status: "active",
  sortOrder: 100,
  ...overrides,
});

test("a trigger matches its field, ignoring case and position", () => {
  const outage = TRIGGER_SEED.find((item) => item.id === "outage")!;
  assert.equal(triggerMatches(outage, ticketInput), true);
  assert.equal(triggerMatches(outage, { ...ticketInput, subject: "Teams is slow" }), false);

  const starts = trigger({ id: "starts", operator: "starts_with", value: "outage" });
  assert.equal(triggerMatches(starts, ticketInput), true);

  const exact = trigger({ id: "exact", operator: "is", value: "outage: the chennai office link is down" });
  assert.equal(triggerMatches(exact, ticketInput), true);
  assert.equal(triggerMatches(exact, { ...ticketInput, subject: "Outage again" }), false);
});

test("tags match on any tag, and an inactive rule never fires", () => {
  const tagged = trigger({ id: "tagged", field: "tag", operator: "is", value: "vpn" });
  assert.equal(triggerMatches(tagged, { ...ticketInput, tags: ["Network", "VPN"] }), true);
  assert.equal(triggerMatches({ ...tagged, status: "inactive" }, { ...ticketInput, tags: ["VPN"] }), false);
  assert.equal(triggerMatches(tagged, ticketInput), false);
});

test("only the rules for the event in hand are evaluated", () => {
  const article = trigger({ id: "article", event: "article.created", value: "still not working" });
  const effect = evaluateTriggers([article], "ticket.created", ticketInput);
  assert.equal(effect.matched.length, 0);
  assert.deepEqual(effect.patch, {});
});

test("matches merge into one change set, first rule wins and tags add up", () => {
  const effect = evaluateTriggers(
    [
      trigger({
        id: "b",
        sortOrder: 20,
        setPriority: "high",
        setQueue: "security",
        setQueueName: "Security",
        addTag: "security",
      }),
      trigger({
        id: "a",
        sortOrder: 10,
        setPriority: "urgent",
        addTag: "outage",
      }),
    ],
    "ticket.created",
    ticketInput,
  );

  // `a` runs first, so its priority stands; `b` still moves the queue and tags.
  assert.deepEqual(effect.patch, {
    priority: "urgent",
    queueId: "security",
    addTags: ["outage", "security"],
  });
  assert.deepEqual(
    effect.matched.map((item) => item.id),
    ["a", "b"],
  );
  assert.equal(effect.lines.length, 2);
  assert.match(effect.lines[0], /^"a" fired: priority → Urgent, tag \+outage\./);
});

test("a rule that would change nothing still leaves its line", () => {
  const effect = evaluateTriggers(
    [trigger({ id: "same", setPriority: "normal" })],
    "ticket.created",
    ticketInput,
  );
  assert.equal(effect.matched.length, 1);
  assert.match(effect.lines[0], /no change needed/);
  assert.deepEqual(effect.patch, {});
});

test("a trigger reads back as one sentence", () => {
  const phishing = TRIGGER_SEED.find((item) => item.id === "phishing")!;
  assert.equal(
    triggerSummary(phishing),
    'A ticket is raised and subject contains "phish" → priority → High, queue → Security, tag +phishing',
  );
});

test("a trigger needs a condition, a consequence and a fresh name", () => {
  const base = {
    name: "Laptop requests",
    field: "subject",
    operator: "contains",
    value: "laptop",
    setState: "",
    setPriority: "",
    setQueue: "",
    addTag: "",
  };
  assert.match(triggerError(base) ?? "", /at least one change/);
  assert.equal(triggerError({ ...base, setQueue: "service-desk" }), null);
  assert.match(triggerError({ ...base, value: "", setQueue: "service-desk" }) ?? "", /looks for/);
  assert.match(
    triggerError({ ...base, setQueue: "service-desk" }, [{ id: "x", name: "laptop requests" }]) ?? "",
    /already a trigger/,
  );
});

/* -------------------------------------------------------------------------- */
/*  The nightly sweep                                                         */
/* -------------------------------------------------------------------------- */

const NOW = new Date("2026-11-19T12:00:00+05:30");

const sweepTicket = (overrides: Partial<SweepTicket> & { id: string }): SweepTicket => ({
  state: "open",
  updatedAt: ist("2026-11-19T11:00:00"),
  dueAt: ist("2026-11-20T18:00:00"),
  firstResponseAt: ist("2026-11-19T09:30:00"),
  firstResponseDueAt: ist("2026-11-19T10:00:00"),
  firstResponseBreachedAt: null,
  resolveBreachedAt: null,
  reminderSentAt: null,
  ...overrides,
});

test("a ticket pending past the limit is closed, not reminded", () => {
  const plan = planSweep(
    [
      sweepTicket({ id: "TT-1", state: "pending", updatedAt: ist("2026-11-11T09:00:00") }),
      sweepTicket({ id: "TT-2", state: "pending", updatedAt: ist("2026-11-16T09:00:00") }),
      sweepTicket({ id: "TT-3", state: "pending", updatedAt: ist("2026-11-19T09:00:00") }),
    ],
    NOW,
  );

  assert.deepEqual(plan.close, [{ id: "TT-1", days: 8 }]);
  assert.deepEqual(plan.remind, [{ id: "TT-2", days: 3 }]);
  assert.equal(plan.breach.length, 0);
});

test("a reminder is written once", () => {
  const plan = planSweep(
    [
      sweepTicket({
        id: "TT-1",
        state: "pending",
        updatedAt: ist("2026-11-16T09:00:00"),
        reminderSentAt: ist("2026-11-18T03:30:00"),
      }),
    ],
    NOW,
  );
  assert.equal(plan.remind.length, 0);
  assert.equal(plan.close.length, 0);
});

test("a missed promise is reported once, for whichever promise was missed", () => {
  const plan = planSweep(
    [
      // Unanswered past the first-response target.
      sweepTicket({
        id: "TT-1",
        firstResponseAt: null,
        firstResponseDueAt: ist("2026-11-19T09:00:00"),
        dueAt: ist("2026-11-21T18:00:00"),
      }),
      // Answered, but the resolution target has passed.
      sweepTicket({ id: "TT-2", dueAt: ist("2026-11-18T18:00:00") }),
      // Already logged: the sweep leaves it alone.
      sweepTicket({
        id: "TT-3",
        dueAt: ist("2026-11-18T18:00:00"),
        resolveBreachedAt: ist("2026-11-19T03:30:00"),
      }),
      // Closed: nothing to report.
      sweepTicket({ id: "TT-4", state: "closed", dueAt: ist("2026-11-01T18:00:00") }),
    ],
    NOW,
  );

  assert.deepEqual(plan.breach, [
    { id: "TT-1", kind: "first-response", days: 0 },
    { id: "TT-2", kind: "resolve", days: 0 },
  ]);
});

test("a ticket the sweep is closing is not also blamed for a missed resolution", () => {
  const plan = planSweep(
    [
      sweepTicket({
        id: "TT-1",
        state: "pending",
        updatedAt: ist("2026-11-01T09:00:00"),
        dueAt: ist("2026-11-02T18:00:00"),
      }),
    ],
    NOW,
  );
  assert.equal(plan.close.length, 1);
  assert.equal(plan.breach.length, 0);
});

test("the sweep says what it did, in the thread and in the response", () => {
  assert.match(
    sweepArticle({ id: "TT-1" }, "close", 8) ?? "",
    /waiting on the requester for 8 days, past the 7-day limit/,
  );
  assert.match(sweepArticle({ id: "TT-1" }, "first-response", 1) ?? "", /missed by 1 day\./);
  assert.match(sweepArticle({ id: "TT-1" }, "resolve", 0) ?? "", /missed by less than a day\./);
  assert.equal(
    sweepSummary({ close: [{ id: "a", days: 8 }], remind: [], breach: [] }),
    "1 closed, 0 reminded, 0 breaches logged",
  );
});

test("the sweep windows can come from the environment, and defaults hold", () => {
  assert.deepEqual(sweepSettingsFromEnv({}), DEFAULT_SWEEP);
  assert.deepEqual(
    sweepSettingsFromEnv({ TICKET_AUTO_CLOSE_DAYS: "3", TICKET_REMINDER_DAYS: "1" }),
    { autoClosePendingDays: 3, reminderPendingDays: 1 },
  );
  assert.deepEqual(
    sweepSettingsFromEnv({ TICKET_AUTO_CLOSE_DAYS: "nonsense" }),
    DEFAULT_SWEEP,
  );
});
