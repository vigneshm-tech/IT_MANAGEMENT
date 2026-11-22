import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMAIL_PROVIDERS,
  EMAIL_SEED_SETTINGS,
  EMAIL_SUBJECT_MAX,
  OUTBOX_MAX_ATTEMPTS,
  canEmailRequester,
  emailAddressError,
  emailSettingsError,
  inboundEmailError,
  inboundSubject,
  isEmailProvider,
  maskAddress,
  normaliseEmail,
  outboxStatusLabel,
  outboundSubject,
  senderName,
  ticketReferenceIn,
} from "../lib/tickets/email";
import { relayPayload } from "../lib/tickets/outbox";

test("an outgoing subject carries the ticket number, and the reply strips it again", () => {
  const subject = outboundSubject("TT-1001", "  VPN   drops on the Chennai link ");
  assert.equal(subject, "[TT-1001] VPN drops on the Chennai link");
  assert.equal(inboundSubject(subject), "VPN drops on the Chennai link");
  assert.equal(inboundSubject(`Re: ${subject}`), "VPN drops on the Chennai link");
  assert.equal(inboundSubject("RE: FWD: [TT-1001] VPN drops"), "VPN drops");
  assert.equal(inboundSubject("no tag here"), "no tag here");
  assert.ok(outboundSubject("TT-1", "x".repeat(400)).length <= EMAIL_SUBJECT_MAX + 12);
});

test("a ticket number is found in a subject, a body, or anywhere in between", () => {
  assert.equal(ticketReferenceIn("[TT-1001] VPN"), "TT-1001");
  assert.equal(ticketReferenceIn("Re: [TT-42] too short"), null);
  assert.equal(ticketReferenceIn("see tt-1000123 in the body"), "TT-1000123");
  assert.equal(ticketReferenceIn("TT-1001"), "TT-1001");
  assert.equal(ticketReferenceIn(null, undefined, "TT-999"), "TT-999");
  assert.equal(ticketReferenceIn("ticket 1001"), null);
  // Eight digits is not a reference we ever issue.
  assert.equal(ticketReferenceIn("TT-12345678"), null);
});

test("an address has to look like one, and is stored lowercase", () => {
  assert.equal(emailAddressError("ritu@acme.example"), null);
  assert.equal(emailAddressError("  "), "Enter an email address.");
  assert.match(emailAddressError("ritu@acme") ?? "", /does not look like/);
  assert.match(emailAddressError(`${"x".repeat(250)}@acme.example`) ?? "", /too long/);
  assert.equal(normaliseEmail(" Ritu@ACME.example "), "ritu@acme.example");
});

test("an inbound message needs a sender, a body and sane lengths", () => {
  const ok = { fromEmail: "ritu@acme.example", fromName: "Ritu", subject: "VPN", body: "It drops." };
  assert.equal(inboundEmailError(ok), null);
  assert.match(inboundEmailError({ ...ok, fromEmail: "nope" }) ?? "", /email address/);
  assert.match(inboundEmailError({ ...ok, body: "   " }) ?? "", /needs a body/);
  assert.match(inboundEmailError({ ...ok, body: "x".repeat(8001) }) ?? "", /under 8000/);
  assert.match(inboundEmailError({ ...ok, subject: "s".repeat(400) }) ?? "", /subject line is too long/);
});

test("a sender name falls back to a tidied local part", () => {
  assert.equal(senderName({ fromName: "  Ritu   Shah ", fromEmail: "x@y.example" }), "Ritu Shah");
  assert.equal(senderName({ fromName: "", fromEmail: "ritu.shah@acme.example" }), "Ritu Shah");
  assert.equal(senderName({ fromName: "   ", fromEmail: "ops@acme.example" }), "Ops");
});

test("the channel only needs an address when it is switched on", () => {
  const off = { ...EMAIL_SEED_SETTINGS, defaultQueueId: "", provider: "imap" as const };
  assert.equal(emailSettingsError(off), null);

  const on = { ...EMAIL_SEED_SETTINGS, enabled: true, address: "support@acme.example" };
  assert.equal(emailSettingsError(on), null);
  assert.match(emailSettingsError({ ...on, address: "" }) ?? "", /^Support address:/);
  assert.match(emailSettingsError({ ...on, defaultQueueId: "" }) ?? "", /queue/);
  assert.match(emailSettingsError({ ...on, mailbox: "  " }) ?? "", /mailbox/);
  assert.match(emailSettingsError({ ...on, relayUrl: "http://relay.example" }) ?? "", /https/);
  assert.match(emailSettingsError({ ...on, provider: "smtp" }) ?? "", /how the mailbox is read/);
});

test("a graph mailbox does not need a folder name", () => {
  const graph = {
    ...EMAIL_SEED_SETTINGS,
    enabled: true,
    address: "support@acme.example",
    provider: "graph",
    mailbox: "",
  };
  assert.equal(emailSettingsError(graph), null);
  assert.ok(isEmailProvider("graph"));
  assert.ok(!isEmailProvider("smtp"));
  assert.equal(EMAIL_PROVIDERS.length, 3);
});

test("a reply is only queued when there is somewhere to send it", () => {
  assert.equal(canEmailRequester({ requesterEmail: "ritu@acme.example" }, true), true);
  assert.equal(canEmailRequester({ requesterEmail: "ritu@acme.example" }, false), false);
  assert.equal(canEmailRequester({ requesterEmail: "nobody" }, true), false);
});

test("the outbox speaks in three states and stops after three attempts", () => {
  assert.equal(outboxStatusLabel("sent"), "Sent");
  assert.equal(outboxStatusLabel("failed"), "Failed");
  assert.equal(outboxStatusLabel("queued"), "Queued");
  assert.equal(outboxStatusLabel("something-else"), "Queued");
  assert.equal(OUTBOX_MAX_ATTEMPTS, 3);
});

test("the relay payload is what a mail relay would expect", () => {
  const payload = relayPayload({
    from: "support@acme.example",
    to: "ritu@acme.example",
    subject: "[TT-1001] VPN drops",
    body: "We are on it.",
    ticketId: "TT-1001",
  });
  assert.equal(payload.from, "support@acme.example");
  assert.equal(payload.to, "ritu@acme.example");
  assert.equal(payload.subject, "[TT-1001] VPN drops");
  assert.equal(payload.ticket_id, "TT-1001");
  assert.match(payload.text, /We are on it\./);
  assert.match(payload.text, /Ticket TT-1001/);
  assert.match(payload.text, /keep the ticket number in the subject/);
});

test("an unset address reads as unset, not as a blank", () => {
  assert.equal(maskAddress(""), "Not set");
  assert.equal(maskAddress("support@acme.example"), "support@acme.example");
});
