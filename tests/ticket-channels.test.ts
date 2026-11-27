import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendInboundTicketEmail,
  createKbArticle,
  createKbCategory,
  deleteKbArticle,
  getKbArticle,
  getTicket,
  getTicketEmailSettings,
  listDueTicketOutbox,
  listKbArticles,
  listKbCategories,
  listPublicTicketQueues,
  listTicketOutbox,
  markTicketOutboxFailed,
  markTicketOutboxSent,
  queueTicketEmail,
  saveTicketEmailSettings,
  submitPublicTicket,
  updateKbArticle,
  updateKbCategory,
  updateTicket,
} from "../lib/records/repository";

test("the public form files a ticket with no profile and a promise", async () => {
  const ticket = await submitPublicTicket({
    subject: "  Printer   on the second floor jams ",
    body: "Tray 2 jams every time.",
    name: "Ritu Shah",
    email: "Ritu.Shah@ACME.example",
    queueId: "service-desk",
    channel: "web",
  });

  assert.match(ticket.id, /^TT-\d+$/);
  assert.equal(ticket.subject, "Printer on the second floor jams");
  assert.equal(ticket.requesterId, null);
  assert.equal(ticket.requesterEmail, "ritu.shah@acme.example");
  assert.equal(ticket.state, "new");
  assert.equal(ticket.channel, "web");
  // The promise is cut from the same rules the agent form uses.
  assert.ok(ticket.firstResponseDueAt);
  assert.ok(ticket.dueAt);

  const stored = await getTicket(ticket.id);
  assert.equal(stored?.id, ticket.id);
});

test("an email-channel ticket keeps its address and its article kind", async () => {
  const ticket = await submitPublicTicket({
    subject: "Mailbox is full again",
    body: "I deleted everything and it is still full.",
    name: "Daniel Roy",
    email: "daniel.roy@northwind.example",
    queueId: "security",
    channel: "email",
    systemNote: "Filed from the inbound mail hook.",
  });

  assert.equal(ticket.channel, "email");
  assert.equal(ticket.queueId, "security");
});

test("a reply from the ticket's own address is appended, and reopens a closed ticket", async () => {
  const ticket = await submitPublicTicket({
    subject: "VPN drops on the Chennai link",
    body: "It drops every ten minutes.",
    name: "Ritu Shah",
    email: "ritu.vpn@acme.example",
    queueId: "service-desk",
  });

  await updateTicket(ticket.id, { state: "closed" });

  const appended = await appendInboundTicketEmail({
    reference: ticket.id,
    fromEmail: "ritu.vpn@acme.example",
    fromName: "Ritu Shah",
    body: "It is still dropping.",
  });
  assert.equal(appended, ticket.id);

  const reopened = await getTicket(ticket.id);
  assert.equal(reopened?.state, "open");
  assert.equal(reopened?.closedAt, null);
  assert.equal(reopened?.reopenCount, 1);
});

test("a reply from somebody else is not appended", async () => {
  const ticket = await submitPublicTicket({
    subject: "Shared mailbox will not open",
    body: "Outlook says the mailbox is unavailable.",
    name: "Ritu Shah",
    email: "ritu.shared@acme.example",
    queueId: "service-desk",
  });

  const appended = await appendInboundTicketEmail({
    reference: ticket.id,
    fromEmail: "someone.else@acme.example",
    fromName: "Someone Else",
    body: "Let me in.",
  });
  assert.equal(appended, null);

  const untouched = await getTicket(ticket.id);
  assert.equal(untouched?.state, "new");
});

test("only the queues marked public are offered to a visitor", async () => {
  const queues = await listPublicTicketQueues();
  assert.deepEqual(
    queues.map((queue) => queue.id),
    ["service-desk", "security"],
  );
  assert.ok(queues.every((queue) => queue.isPublic && queue.status === "active"));
});

test("the outbox queues a reply, marks it sent, and retires it after three failures", async () => {
  const ticket = await submitPublicTicket({
    subject: "Laptop will not reach the endpoint agent",
    body: "It has been an hour.",
    name: "Nisha Verma",
    email: "nisha@acme.example",
    queueId: "service-desk",
  });

  const queued = await queueTicketEmail({
    ticketId: ticket.id,
    toAddress: "Nisha@ACME.example",
    subject: `[${ticket.id}] Laptop will not reach the endpoint agent`,
    body: "We are looking at it.",
  });
  assert.equal(queued.status, "queued");
  assert.equal(queued.attempts, 0);
  assert.equal(queued.toAddress, "nisha@acme.example");

  assert.ok((await listDueTicketOutbox()).some((item) => item.id === queued.id));
  assert.equal(await markTicketOutboxSent(queued.id), true);

  const sent = (await listTicketOutbox(ticket.id)).find((item) => item.id === queued.id);
  assert.equal(sent?.status, "sent");
  assert.ok(sent?.sentAt);
  assert.ok(!(await listDueTicketOutbox()).some((item) => item.id === queued.id));

  // A failed attempt stays queued, and only the third one parks it.
  const retried = await queueTicketEmail({
    ticketId: ticket.id,
    toAddress: "nisha@acme.example",
    subject: `[${ticket.id}] second try`,
    body: "Trying again.",
  });
  await markTicketOutboxFailed({ id: retried.id, error: "relay said 502" });
  assert.equal((await listDueTicketOutbox()).find((item) => item.id === retried.id)?.attempts, 1);
  await markTicketOutboxFailed({ id: retried.id, error: "relay said 502" });
  await markTicketOutboxFailed({ id: retried.id, error: "relay said 502" });

  const parked = (await listTicketOutbox(ticket.id)).find((item) => item.id === retried.id);
  assert.equal(parked?.status, "failed");
  assert.equal(parked?.attempts, 3);
  assert.match(parked?.lastError ?? "", /502/);
});

test("the channel's settings round-trip, and are off by default", async () => {
  const initial = await getTicketEmailSettings();
  assert.equal(initial.enabled, false);
  assert.equal(initial.provider, "imap");

  const saved = await saveTicketEmailSettings({
    enabled: true,
    address: "support@acme.example",
    provider: "graph",
    relayUrl: "https://relay.acme.example/send",
    defaultQueueId: "service-desk",
  });
  assert.equal(saved.enabled, true);
  assert.equal(saved.provider, "graph");
  assert.equal((await getTicketEmailSettings()).address, "support@acme.example");

  await saveTicketEmailSettings({ enabled: false });
});

test("knowledge base categories and articles can be written, edited and removed", async () => {
  const category = await createKbCategory({ name: "Printing", description: "Paper and toner" });
  assert.equal(category.id, "printing");
  assert.equal(category.status, "active");

  assert.equal(await updateKbCategory(category.id, { status: "inactive" }), true);
  assert.equal(
    (await listKbCategories(true)).find((item) => item.id === category.id)?.status,
    "inactive",
  );
  assert.equal(
    (await listKbCategories()).some((item) => item.id === category.id),
    false,
  );

  await updateKbCategory(category.id, { status: "active" });

  const article = await createKbArticle({
    title: "Replace the toner cartridge",
    summary: "Which cartridge, and what the display says.",
    body: "Open the front cover, pull the old cartridge out, and slide the new one in until it clicks.",
    categoryId: category.id,
    visibility: "public",
    tags: ["Toner", "printer"],
  });
  assert.equal(article.id, "replace-the-toner-cartridge");
  assert.equal(article.categoryName, "Printing");
  assert.deepEqual(article.tags, ["toner", "printer"]);

  assert.equal(
    (await getKbArticle(article.id))?.title,
    "Replace the toner cartridge",
  );

  assert.equal(await updateKbArticle(article.id, { visibility: "internal" }), true);
  const hidden = await getKbArticle(article.id);
  assert.equal(hidden?.visibility, "internal");

  assert.ok(
    (await listKbArticles({ includeInternal: false })).every(
      (item) => item.id !== article.id,
    ),
  );

  assert.equal(await deleteKbArticle(article.id), true);
  assert.equal(await getKbArticle(article.id), null);
});
