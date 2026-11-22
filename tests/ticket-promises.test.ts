import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_CALENDAR,
  SLA_SEED,
  addBusinessMinutes,
  businessMinutesBetween,
  calendarError,
  calendarFor,
  computeSlaTargets,
  formatCountdown,
  isBusinessTime,
  isSlaOverdue,
  matchSla,
  minutesToTime,
  nextBusinessInstant,
  slaError,
  slaState,
  timeToMinutes,
  type BusinessCalendar,
  type SlaRule,
} from "../lib/tickets/sla";
import { buildTicketReport, reportCsv, reportDuration } from "../lib/tickets/reports";

/** Friday 20 November 2026, 17:00 IST — ten minutes before the office closes. */
const FRIDAY_LATE = new Date("2026-11-20T17:00:00+05:30");
/** Saturday 21 November 2026, 10:00 IST. */
const SATURDAY = new Date("2026-11-21T10:00:00+05:30");
/** Monday 23 November 2026, 09:00 IST. */
const MONDAY_OPEN = new Date("2026-11-23T09:00:00+05:30");

const ist = (iso: string) => new Date(`${iso}+05:30`).toISOString();

test("a four-hour promise made on Friday evening lands on Monday afternoon", () => {
  const due = addBusinessMinutes(FRIDAY_LATE, 240);
  // 60 minutes left on Friday (until 18:00), then 180 on Monday from 09:00 = 12:00.
  assert.equal(due.toISOString(), MONDAY_OPEN.toISOString().replace("03:30", "06:30"));
  assert.equal(due.toISOString(), new Date("2026-11-23T12:00:00+05:30").toISOString());
});

test("the clock skips weekends, evenings and closed days", () => {
  assert.equal(nextBusinessInstant(SATURDAY).toISOString(), MONDAY_OPEN.toISOString());
  assert.equal(
    nextBusinessInstant(new Date("2026-11-20T19:30:00+05:30")).toISOString(),
    MONDAY_OPEN.toISOString(),
  );
  assert.equal(
    nextBusinessInstant(new Date("2026-11-24T11:00:00+05:30")).toISOString(),
    new Date("2026-11-24T11:00:00+05:30").toISOString(),
  );
});

test("opening hours are open time, everything else is not", () => {
  assert.equal(isBusinessTime(new Date("2026-11-24T10:00:00+05:30"), DEFAULT_CALENDAR), true);
  assert.equal(isBusinessTime(new Date("2026-11-24T08:59:00+05:30"), DEFAULT_CALENDAR), false);
  assert.equal(isBusinessTime(SATURDAY, DEFAULT_CALENDAR), false);
  assert.equal(isBusinessTime(new Date("2026-11-22T10:00:00+05:30"), DEFAULT_CALENDAR), false);
});

test("office minutes between two instants leave the weekend out", () => {
  const friday = new Date("2026-11-20T17:00:00+05:30");
  const mondayTen = new Date("2026-11-23T10:00:00+05:30");
  // 60 minutes on Friday plus 60 on Monday; Saturday and Sunday are not counted.
  assert.equal(businessMinutesBetween(friday, mondayTen), 120);
  assert.equal(businessMinutesBetween(mondayTen, friday), 0);
});

test("a shift can move the clock, and a deleted shift falls back", () => {
  const nights: BusinessCalendar = {
    ...DEFAULT_CALENDAR,
    id: "nights",
    days: [1, 2, 3, 4, 5, 6, 0],
    startMinute: 22 * 60,
    endMinute: 23 * 60,
  };
  // Saturday 21:00 → the shift opens at 22:00 the same evening.
  assert.equal(
    addBusinessMinutes(new Date("2026-11-21T21:00:00+05:30"), 30, nights).toISOString(),
    new Date("2026-11-21T22:30:00+05:30").toISOString(),
  );
  assert.equal(calendarFor([], "gone").id, DEFAULT_CALENDAR.id);
  assert.equal(calendarFor([nights], "gone").id, nights.id);
});

test("the most specific service rule wins, and inactive rules never do", () => {
  const rules: SlaRule[] = SLA_SEED.map((rule) => ({ ...rule }));
  // A queue rule is more specific than a priority rule, so Security wins.
  assert.equal(matchSla(rules, { queueId: "security", priority: "urgent" })?.id, "security");
  assert.equal(matchSla(rules, { queueId: "security", priority: "normal" })?.id, "security");
  assert.equal(matchSla(rules, { queueId: "applications", priority: "urgent" })?.id, "urgent");
  assert.equal(matchSla(rules, { queueId: "applications", priority: "normal" })?.id, "standard");
  assert.equal(matchSla(rules, { queueId: null, priority: "low" })?.id, "standard");

  const quiet = rules.map((rule) => ({ ...rule, status: "inactive" as const }));
  assert.equal(matchSla(quiet, { queueId: "security", priority: "urgent" }), null);
});

test("a ticket's promise is cut at creation on the office clock", () => {
  const created = new Date("2026-11-20T17:00:00+05:30").toISOString();
  const targets = computeSlaTargets(
    { createdAt: created, priority: "urgent", queueId: "service-desk" },
    SLA_SEED,
    [DEFAULT_CALENDAR],
  );
  // No queue rule for the service desk, so the urgent rule applies on priority.
  assert.equal(targets.slaId, "urgent");
  // 30 first-response minutes: 30 of the 60 left on Friday.
  assert.equal(targets.firstResponseDueAt, ist("2026-11-20T17:30:00"));
  // 240 minutes: Friday 18:00 plus 180 on Monday = 12:00 Monday.
  assert.equal(targets.resolveDueAt, ist("2026-11-23T12:00:00"));
});

test("with no rule at all the priority ladder still promises something", () => {
  const created = new Date("2026-11-20T17:00:00+05:30").toISOString();
  const targets = computeSlaTargets(
    { createdAt: created, priority: "urgent", queueId: "no-such-queue" },
    [],
    [DEFAULT_CALENDAR],
  );
  assert.equal(targets.slaId, null);
  assert.equal(targets.firstResponseDueAt, null);
  // urgent is four hours on the priority ladder: 60 on Friday, 180 on Monday.
  assert.equal(targets.resolveDueAt, ist("2026-11-23T12:00:00"));
});

const promisedTicket = {
  state: "open",
  createdAt: ist("2026-11-20T09:00:00"),
  dueAt: ist("2026-11-20T12:00:00"),
  closedAt: null,
  firstResponseAt: null,
  firstResponseDueAt: ist("2026-11-20T09:30:00"),
  firstResponseBreachedAt: null,
  resolveBreachedAt: null,
};

test("the nearer promise is the one the countdown talks about", () => {
  const waiting = slaState(promisedTicket, new Date("2026-11-20T09:20:00+05:30"));
  assert.equal(waiting.focus, "first-response");
  assert.equal(waiting.label, "1st reply due in 10m");
  assert.equal(waiting.atRisk, true);

  const answered = slaState(
    { ...promisedTicket, firstResponseAt: ist("2026-11-20T09:15:00") },
    new Date("2026-11-20T09:20:00+05:30"),
  );
  assert.equal(answered.focus, "resolve");
  assert.equal(answered.label, "2h 40m left");
  assert.equal(answered.firstResponseMet, true);
});

test("a missed promise reads as late, and a met one reads as met", () => {
  const late = slaState(promisedTicket, new Date("2026-11-20T09:40:00+05:30"));
  assert.equal(late.label, "1st reply late 10m");
  assert.equal(late.atRisk, false);

  const met = slaState(
    {
      ...promisedTicket,
      state: "closed",
      closedAt: ist("2026-11-20T11:00:00"),
      firstResponseAt: ist("2026-11-20T09:15:00"),
    },
    new Date("2026-11-20T13:00:00+05:30"),
  );
  assert.equal(met.label, "Met");

  const closedLate = slaState(
    { ...promisedTicket, state: "closed", closedAt: ist("2026-11-20T13:00:00") },
    new Date("2026-11-20T14:00:00+05:30"),
  );
  assert.equal(closedLate.label, "Closed late");

  const untracked = slaState(
    { ...promisedTicket, dueAt: null, firstResponseDueAt: null },
    new Date("2026-11-20T09:00:00+05:30"),
  );
  assert.equal(untracked.tracked, false);
  assert.equal(untracked.label, "No target");
});

test("overdue means a promise has run out and the ticket is still open", () => {
  const afterFirst = new Date("2026-11-20T09:40:00+05:30");
  assert.equal(isSlaOverdue(promisedTicket, afterFirst), true);
  assert.equal(
    isSlaOverdue({ ...promisedTicket, firstResponseAt: ist("2026-11-20T09:10:00") }, afterFirst),
    false,
  );
  assert.equal(isSlaOverdue({ ...promisedTicket, state: "closed" }, afterFirst), false);
});

test("countdowns read in days, hours and minutes", () => {
  assert.equal(formatCountdown(45), "45m");
  assert.equal(formatCountdown(150), "2h 30m");
  assert.equal(formatCountdown(2880), "2d");
  assert.equal(formatCountdown(3000), "2d 2h");
  assert.equal(formatCountdown(-20), "20m");
});

test("a shift needs days, ordered hours and a name", () => {
  assert.equal(calendarError({ name: "Weekend", days: [6, 0], startMinute: 540, endMinute: 780 }), null);
  assert.match(calendarError({ name: "Weekend", days: [], startMinute: 540, endMinute: 780 }) ?? "", /working day/);
  assert.match(calendarError({ name: "Weekend", days: [1], startMinute: 780, endMinute: 540 }) ?? "", /after/);
  assert.match(calendarError({ name: "Weekend", days: [1], startMinute: 540, endMinute: 570 }) ?? "", /hour/);
  assert.equal(timeToMinutes("09:30"), 570);
  assert.equal(timeToMinutes("9:30"), 570);
  assert.equal(timeToMinutes("24:00"), null);
  assert.equal(minutesToTime(1080), "18:00");
});

test("a service target has to answer before it resolves", () => {
  assert.equal(slaError({ name: "Security", firstResponseMinutes: 60, resolveMinutes: 480 }), null);
  assert.match(
    slaError({ name: "Security", firstResponseMinutes: 480, resolveMinutes: 60 }) ?? "",
    /shorter/,
  );
  assert.match(slaError({ name: "Security", firstResponseMinutes: 0, resolveMinutes: 60 }) ?? "", /first-response/);
});

/* -------------------------------------------------------------------------- */
/*  Reports                                                                   */
/* -------------------------------------------------------------------------- */

function reportTicket(
  overrides: Partial<Parameters<typeof buildTicketReport>[0][number]> & { id: string },
): Parameters<typeof buildTicketReport>[0][number] {
  return {
    state: "open",
    priority: "normal",
    queueName: "Service desk",
    ownerName: "Arun Prakash",
    createdAt: ist("2026-11-17T10:00:00"),
    updatedAt: ist("2026-11-17T10:00:00"),
    closedAt: null,
    dueAt: ist("2026-11-20T18:00:00"),
    firstResponseAt: null,
    firstResponseDueAt: ist("2026-11-18T10:00:00"),
    firstResponseBreachedAt: null,
    resolveBreachedAt: null,
    reopenCount: 0,
    ...overrides,
  };
}

const REPORT_NOW = new Date("2026-11-19T12:00:00+05:30");

test("the report counts work by queue, owner and state", () => {
  const report = buildTicketReport(
    [
      reportTicket({ id: "TT-1", firstResponseAt: ist("2026-11-17T10:30:00") }), // 30m
      reportTicket({
        id: "TT-2",
        queueName: "Security",
        ownerName: "Meera Raghavan",
        state: "closed",
        closedAt: ist("2026-11-18T12:00:00"),
        firstResponseAt: ist("2026-11-17T11:30:00"), // 90m
        reopenCount: 1,
      }),
      reportTicket({ id: "TT-3", state: "pending", ownerName: "" }),
      reportTicket({ id: "TT-4", state: "merged" }),
      reportTicket({ id: "TT-5", state: "closed", closedAt: ist("2026-11-18T09:00:00") }),
    ],
    REPORT_NOW,
  );

  assert.deepEqual(report.totals, { open: 1, pending: 1, closed: 2, merged: 1, all: 5 });
  assert.equal(report.byQueue.find((row) => row.name === "Security")?.total, 1);
  assert.equal(report.byQueue.some((row) => row.name === "—"), false);
  // Merged tickets are left out of the queue table: their work lives elsewhere.
  assert.equal(
    report.byQueue.reduce((sum, row) => sum + row.total, 0),
    4,
  );
  // Only open work is in anybody's column: pending waits on requesters and
  // closed work is done.
  assert.equal(
    report.byOwner.reduce((sum, row) => sum + row.total, 0),
    1,
  );
  assert.equal(report.byOwner[0]?.name, "Arun Prakash");
  assert.equal(report.firstResponse.medianMinutes, 60);
  assert.equal(report.firstResponse.answered, 2);
  assert.equal(report.reopen.reopened, 1);
  assert.equal(report.reopen.closedEver, 2);
  assert.equal(report.reopen.percent, 50);
});

test("six Monday-to-Sunday weeks, oldest first", () => {
  const report = buildTicketReport(
    [
      reportTicket({ id: "TT-1" }),
      reportTicket({ id: "TT-2", state: "closed", closedAt: ist("2026-11-18T12:00:00") }),
      reportTicket({ id: "TT-3", createdAt: ist("2026-11-03T10:00:00") }),
    ],
    REPORT_NOW,
  );

  assert.equal(report.weeks.length, 6);
  assert.equal(report.weeks.at(-1)?.weekStart, "2026-11-16");
  assert.equal(report.weeks.at(-1)?.created, 2);
  assert.equal(report.weeks.at(-1)?.closed, 1);
  assert.equal(report.weeks.at(-3)?.created, 1);
  assert.equal(report.weeks.at(-1)?.label, "16 Nov");
});

test("a breach is counted once, and at-risk work is counted before it breaches", () => {
  const report = buildTicketReport(
    [
      reportTicket({ id: "TT-1", resolveBreachedAt: ist("2026-11-19T09:00:00") }),
      reportTicket({
        id: "TT-2",
        createdAt: ist("2026-11-19T10:00:00"),
        dueAt: ist("2026-11-19T12:30:00"),
        firstResponseDueAt: ist("2026-11-19T10:30:00"),
        firstResponseAt: ist("2026-11-19T10:10:00"),
      }),
      reportTicket({ id: "TT-3", state: "closed", closedAt: ist("2026-11-18T12:00:00") }),
    ],
    REPORT_NOW,
  );

  assert.equal(report.sla.tracked, 3);
  assert.equal(report.sla.breached, 1);
  // TT-2 is inside the last quarter of its two-hour window.
  assert.equal(report.sla.atRisk, 1);
});

test("the CSV carries every section the page shows", () => {
  const csv = reportCsv(
    buildTicketReport([reportTicket({ id: "TT-1" })], REPORT_NOW),
  );
  for (const heading of ["# Ticket report", "# By queue", "# By owner", "# By state", "# Weekly"]) {
    assert.ok(csv.includes(heading), `${heading} missing from the CSV`);
  }
  assert.ok(csv.includes('"Service desk","1","0","1"'));
  assert.ok(csv.includes('"Median first response (minutes)",""'));
  assert.equal(reportDuration(90), "1h 30m");
  assert.equal(reportDuration(null), "—");
});
