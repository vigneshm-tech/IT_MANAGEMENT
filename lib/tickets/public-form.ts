/**
 * The public form's field rules, in one place.
 *
 * The database function repeats the subject, body and email checks (it has to —
 * it is reachable with the anon key), but the sentence a visitor actually reads
 * is written here, so the form and the route agree on every limit.
 */

import { emailAddressError, normaliseEmail } from "./email";
import { looksAutomated, publicSubmissionAllowed } from "./spam";

export const PUBLIC_NAME_MIN = 2;
export const PUBLIC_NAME_MAX = 120;
export const PUBLIC_SUBJECT_MIN = 4;
export const PUBLIC_SUBJECT_MAX = 160;
export const PUBLIC_BODY_MAX = 8000;

export function normalisePublicName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function publicSubject(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export type PublicTicketDraft = {
  name: string;
  email: string;
  subject: string;
  body: string;
  queueId: string;
};

/** The first thing wrong with the draft, or null. */
export function publicTicketError(
  draft: PublicTicketDraft,
  queues: { id: string }[] = [],
): string | null {
  const name = normalisePublicName(draft.name);
  if (name.length < PUBLIC_NAME_MIN) return "Tell us your name so we know who we are replying to.";
  if (name.length > PUBLIC_NAME_MAX) return `Keep your name under ${PUBLIC_NAME_MAX} characters.`;

  const addressError = emailAddressError(draft.email);
  if (addressError) return addressError;

  const subject = publicSubject(draft.subject);
  if (subject.length < PUBLIC_SUBJECT_MIN) {
    return `Give it a subject of at least ${PUBLIC_SUBJECT_MIN} characters — it becomes the ticket title.`;
  }
  if (subject.length > PUBLIC_SUBJECT_MAX) return `Keep the subject under ${PUBLIC_SUBJECT_MAX} characters.`;

  if (draft.body.trim().length === 0) return "Describe the problem — a line or two is enough.";
  if (draft.body.length > PUBLIC_BODY_MAX) return `Keep the message under ${PUBLIC_BODY_MAX} characters.`;

  if (queues.length > 0 && !queues.some((queue) => queue.id === draft.queueId)) {
    return "Pick the team that should look at this.";
  }
  return null;
}

/** Normalises a draft for storage: no smart quotes, no padding. */
export function cleanPublicTicket(draft: PublicTicketDraft): PublicTicketDraft {
  return {
    name: normalisePublicName(draft.name).slice(0, PUBLIC_NAME_MAX),
    email: normaliseEmail(draft.email),
    subject: publicSubject(draft.subject),
    body: draft.body.trim(),
    queueId: draft.queueId.trim(),
  };
}

/**
 * What a visitor sees when they have used up the hour. Written for a person,
 * because the person who hits it is usually a colleague with three problems,
 * not a bot.
 */
export function throttleMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `That is a lot of tickets in one hour. Try again in about ${minutes} ${
    minutes === 1 ? "minute" : "minutes"
  }, or reply to the confirmation email we already sent you.`;
}

/**
 * The gate, in the order it should be applied: throttle first (cheap), then the
 * honeypot (only a bot fills it), then the field rules. It does not count the
 * attempt — the caller records it once the ticket is actually stored, so a
 * validation typo never eats into somebody's hour.
 */
export function checkPublicSubmission(input: {
  ip: string;
  honeypot: string;
  startedAt: number;
  draft: PublicTicketDraft;
  queues: { id: string }[];
  now?: number;
}): { error: string } | { ok: true } {
  const now = input.now ?? Date.now();
  const gate = publicSubmissionAllowed(input.ip, now);
  if (!gate.allowed) return { error: throttleMessage(gate.retryAfterSeconds) };

  const automated = looksAutomated({
    honeypot: input.honeypot,
    startedAt: input.startedAt,
    now,
  });
  if (automated) return { error: automated };

  const error = publicTicketError(input.draft, input.queues);
  if (error) return { error };

  return { ok: true };
}
