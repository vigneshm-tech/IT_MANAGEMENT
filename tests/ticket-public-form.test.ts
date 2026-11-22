import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  PUBLIC_MAX_PER_WINDOW,
  PUBLIC_MIN_FILL_MS,
  PUBLIC_WINDOW_MS,
  clientAddress,
  looksAutomated,
  publicSubmissionAllowed,
  recordPublicSubmission,
  resetPublicSubmissions,
} from "../lib/tickets/spam";
import {
  PUBLIC_BODY_MAX,
  checkPublicSubmission,
  cleanPublicTicket,
  publicTicketError,
  publicSubject,
  throttleMessage,
  type PublicTicketDraft,
} from "../lib/tickets/public-form";

const QUEUES = [{ id: "service-desk" }, { id: "security" }];

const draft = (overrides: Partial<PublicTicketDraft> = {}): PublicTicketDraft => ({
  name: "Ritu Shah",
  email: "ritu@acme.example",
  subject: "VPN drops every ten minutes",
  body: "It drops, then reconnects on its own.",
  queueId: "service-desk",
  ...overrides,
});

beforeEach(() => resetPublicSubmissions());

test("the happy draft passes", () => {
  assert.equal(publicTicketError(draft(), QUEUES), null);
});

test("every field has a sentence when it is wrong", () => {
  assert.match(publicTicketError(draft({ name: "R" }), QUEUES) ?? "", /your name/);
  assert.match(publicTicketError(draft({ email: "not-an-address" }), QUEUES) ?? "", /email address/);
  assert.match(publicTicketError(draft({ subject: "vpn" }), QUEUES) ?? "", /at least 4 characters/);
  assert.match(publicTicketError(draft({ body: "   " }), QUEUES) ?? "", /Describe the problem/);
  assert.match(
    publicTicketError(draft({ body: "x".repeat(PUBLIC_BODY_MAX + 1) }), QUEUES) ?? "",
    /Keep the message under/,
  );
  assert.match(publicTicketError(draft({ queueId: "nothing" }), QUEUES) ?? "", /Pick the team/);
});

test("with no queues offered, the queue field is not judged", () => {
  assert.equal(publicTicketError(draft({ queueId: "" }), []), null);
});

test("cleaning trims, collapses and lowercases the address", () => {
  const clean = cleanPublicTicket({
    name: "  Ritu   Shah ",
    email: " Ritu@ACME.example ",
    subject: "  VPN   keeps dropping ",
    body: "  It drops.  ",
    queueId: " service-desk ",
  });
  assert.deepEqual(clean, {
    name: "Ritu Shah",
    email: "ritu@acme.example",
    subject: "VPN keeps dropping",
    body: "It drops.",
    queueId: "service-desk",
  });
  assert.equal(publicSubject(" a \n b "), "a b");
});

test("five submissions an hour, then the sixth is refused until the window turns", () => {
  const now = 1_700_000_000_000;
  for (let index = 0; index < PUBLIC_MAX_PER_WINDOW; index += 1) {
    assert.equal(publicSubmissionAllowed("203.0.113.7", now).allowed, true);
    recordPublicSubmission("203.0.113.7", now);
  }

  const blocked = publicSubmissionAllowed("203.0.113.7", now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= PUBLIC_WINDOW_MS / 1000);

  // A different address has its own hour.
  assert.equal(publicSubmissionAllowed("198.51.100.2", now).allowed, true);

  // The window is rolling from the first submission, not from the last.
  assert.equal(publicSubmissionAllowed("203.0.113.7", now + PUBLIC_WINDOW_MS - 1).allowed, false);
  assert.equal(publicSubmissionAllowed("203.0.113.7", now + PUBLIC_WINDOW_MS).allowed, true);
});

test("the throttle message counts minutes, and says one minute in the singular", () => {
  assert.equal(throttleMessage(30), "That is a lot of tickets in one hour. Try again in about 1 minute, or reply to the confirmation email we already sent you.");
  assert.match(throttleMessage(600), /about 10 minutes/);
});

test("a filled honeypot or a too-fast form is a machine", () => {
  const now = 1_700_000_000_000;
  assert.match(looksAutomated({ honeypot: "http://spam.example", startedAt: now - 5000, now }) ?? "", /automated/);
  assert.match(looksAutomated({ honeypot: "", startedAt: now - 200, now }) ?? "", /too quick/);
  assert.equal(looksAutomated({ honeypot: "", startedAt: now - PUBLIC_MIN_FILL_MS - 1, now }), null);
  assert.equal(looksAutomated({ honeypot: "", startedAt: 0, now }), null);
});

test("the gate runs throttle, then automation, then fields", () => {
  const now = 1_700_000_000_000;
  const base = {
    ip: "203.0.113.9",
    honeypot: "",
    startedAt: now - 60_000,
    draft: draft(),
    queues: QUEUES,
    now,
  };

  assert.deepEqual(checkPublicSubmission(base), { ok: true });

  const automated = checkPublicSubmission({ ...base, honeypot: "bot" });
  assert.ok("error" in automated && /automated/.test(automated.error));

  const badFields = checkPublicSubmission({ ...base, draft: draft({ subject: "hi" }) });
  assert.ok("error" in badFields && /at least 4 characters/.test(badFields.error));

  for (let index = 0; index < PUBLIC_MAX_PER_WINDOW; index += 1) {
    recordPublicSubmission(base.ip, now);
  }
  const throttled = checkPublicSubmission({ ...base, honeypot: "bot" });
  assert.ok("error" in throttled && /one hour/.test(throttled.error));
});

test("a rejected submission does not spend the hour's quota", () => {
  const now = 1_700_000_000_000;
  for (let index = 0; index < PUBLIC_MAX_PER_WINDOW + 1; index += 1) {
    checkPublicSubmission({
      ip: "203.0.113.11",
      honeypot: "",
      startedAt: now - 60_000,
      draft: draft({ subject: "no" }),
      queues: QUEUES,
      now,
    });
  }
  assert.equal(publicSubmissionAllowed("203.0.113.11", now).allowed, true);
});

test("the client address comes from the proxy, first hop first", () => {
  const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });
  assert.equal(clientAddress(headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })), "203.0.113.5");
  assert.equal(clientAddress(headers({ "x-real-ip": "198.51.100.9" })), "198.51.100.9");
  assert.equal(clientAddress(headers({})), "unknown");
});
