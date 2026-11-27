import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createKbCategory,
  createTicketQueue,
  deleteKbCategory,
  deleteTicketQueue,
  listKbArticles,
  listKbCategories,
  listTicketCalendars,
  listTicketMacros,
  listTicketQueues,
  listTicketSlas,
  listTicketTriggers,
  submitPublicTicket,
  updateKbCategory,
  updateTicketCalendar,
  updateTicketMacro,
  updateTicketQueue,
  updateTicketSla,
  updateTicketTrigger,
} from "../lib/records/repository";
import { canConfigureTickets, canReadTicketAdmin } from "../lib/tickets/admin";

/* -------------------------------------------------------------------------- */
/*  Who may configure the desk                                                */
/* -------------------------------------------------------------------------- */

test("the ticket registers are edited by whoever edits master data or administers tickets", () => {
  for (const role of ["super_admin", "it_manager", "management"] as const) {
    assert.equal(canConfigureTickets(role), true, `${role} should configure tickets`);
    assert.equal(canReadTicketAdmin(role), true);
  }

  // The support desk works the registers but does not rewrite them.
  assert.equal(canConfigureTickets("l2_support_engineer"), false);
  assert.equal(canReadTicketAdmin("l2_support_engineer"), true);

  // Everyone else raises tickets; the registers are not theirs to read.
  assert.equal(canConfigureTickets("development_engineer"), false);
  assert.equal(canReadTicketAdmin("development_engineer"), false);
});

/* -------------------------------------------------------------------------- */
/*  Queues                                                                    */
/* -------------------------------------------------------------------------- */

test("a queue can be added, renamed, offered publicly and removed", async () => {
  const created = await createTicketQueue({
    name: "  Field   support ",
    description: "On-site visits",
    isPublic: true,
  });

  assert.equal(created.name, "Field support");
  assert.equal(created.id, "field-support");
  assert.equal(created.status, "active");
  assert.ok((await listTicketQueues(true)).some((queue) => queue.id === created.id));

  assert.equal(await updateTicketQueue(created.id, { name: "Field & site" }), true);
  assert.equal(await updateTicketQueue(created.id, { isPublic: false }), true);

  const renamed = (await listTicketQueues(true)).find((queue) => queue.id === created.id);
  assert.equal(renamed?.name, "Field & site");
  assert.equal(renamed?.isPublic, false);
  // The id survives the rename, so tickets filed against it keep their queue.
  assert.equal(renamed?.id, "field-support");

  assert.deepEqual(await deleteTicketQueue(created.id), { ok: true });
  assert.equal((await listTicketQueues(true)).some((queue) => queue.id === created.id), false);
});

test("a queue holding tickets is refused rather than deleted", async () => {
  const ticket = await submitPublicTicket({
    subject: "Laptop will not boot",
    body: "It stops at the vendor logo.",
    name: "A Visitor",
    email: "visitor@acme.example",
    queueId: "service-desk",
    channel: "web",
  });
  assert.ok(ticket.id);

  const result = await deleteTicketQueue("service-desk");
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /Deactivate/);
  assert.ok((await listTicketQueues(true)).some((queue) => queue.id === "service-desk"));
});

/* -------------------------------------------------------------------------- */
/*  Targets, shifts, triggers and macros                                      */
/* -------------------------------------------------------------------------- */

test("a service target is edited in place instead of re-created", async () => {
  const before = (await listTicketSlas(true)).find((rule) => rule.id === "urgent");
  assert.ok(before);

  assert.equal(
    await updateTicketSla("urgent", { firstResponseMinutes: 15, resolveMinutes: 180, name: "Urgent" }),
    true,
  );

  const after = (await listTicketSlas(true)).find((rule) => rule.id === "urgent");
  assert.equal(after?.id, "urgent");
  assert.equal(after?.name, "Urgent");
  assert.equal(after?.firstResponseMinutes, 15);
  assert.equal(after?.resolveMinutes, 180);
  // A field the patch did not mention keeps its value.
  assert.equal(after?.priority, "urgent");

  assert.equal(await updateTicketSla("nope", { name: "Ghost" }), false);
});

test("a shift's days and hours can be changed", async () => {
  const before = (await listTicketCalendars(true)).find((calendar) => calendar.id === "ist-extended");
  assert.ok(before);

  assert.equal(
    await updateTicketCalendar("ist-extended", {
      days: [1, 2, 3, 4, 5],
      startMinute: 9 * 60,
      endMinute: 21 * 60,
    }),
    true,
  );

  const after = (await listTicketCalendars(true)).find((calendar) => calendar.id === "ist-extended");
  assert.deepEqual(after?.days, [1, 2, 3, 4, 5]);
  assert.equal(after?.startMinute, 540);
  assert.equal(after?.endMinute, 1260);
  assert.equal(await updateTicketCalendar("nope", { name: "Ghost" }), false);
});

test("a trigger's condition and consequences can be rewritten", async () => {
  const trigger = (await listTicketTriggers(true))[0];
  assert.ok(trigger);

  assert.equal(
    await updateTicketTrigger(trigger.id, {
      name: "Phishing goes to security",
      value: "phish",
      operator: "starts_with",
      setPriority: "urgent",
      setQueue: "security",
      addTag: "phishing",
    }),
    true,
  );

  const after = (await listTicketTriggers(true)).find((item) => item.id === trigger.id);
  assert.equal(after?.name, "Phishing goes to security");
  assert.equal(after?.value, "phish");
  assert.equal(after?.operator, "starts_with");
  assert.equal(after?.setPriority, "urgent");
  assert.equal(after?.setQueue, "security");
  assert.equal(after?.addTag, "phishing");
  assert.equal(await updateTicketTrigger("nope", { name: "Ghost" }), false);
});

test("a macro's bundle can be edited without changing its id", async () => {
  const macro = (await listTicketMacros(true))[0];
  assert.ok(macro);

  assert.equal(
    await updateTicketMacro(macro.id, {
      setState: "pending",
      setPriority: "low",
      setQueue: "applications",
      addTag: "parked",
    }),
    true,
  );

  const after = (await listTicketMacros(true)).find((item) => item.id === macro.id);
  assert.equal(after?.setState, "pending");
  assert.equal(after?.setPriority, "low");
  assert.equal(after?.setQueue, "applications");
  assert.equal(after?.addTag, "parked");
  assert.equal(await updateTicketMacro("nope", { name: "Ghost" }), false);
});

/* -------------------------------------------------------------------------- */
/*  KB categories                                                             */
/* -------------------------------------------------------------------------- */

test("a KB category is edited, and one holding articles is refused a delete", async () => {
  const created = await createKbCategory({ name: "Printing", description: "Paper and toners" });
  assert.equal(await updateKbCategory(created.id, { name: "Printers" }), true);
  assert.equal(
    (await listKbCategories(true)).find((category) => category.id === created.id)?.name,
    "Printers",
  );

  // Empty shelf: removable.
  assert.deepEqual(await deleteKbCategory(created.id), { ok: true });

  // A shelf the seeded articles sit on is not.
  const articles = await listKbArticles({ includeInternal: true, includeInactive: true });
  const used = articles[0];
  assert.ok(used);
  const refused = await deleteKbCategory(used.categoryId);
  assert.equal(refused.ok, false);
  assert.match(refused.reason ?? "", /deactivate/i);
});
