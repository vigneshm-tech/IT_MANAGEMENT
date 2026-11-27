/**
 * The email channel's vocabulary.
 *
 * Zammad turns a mailbox into a queue: a message from an unknown sender opens a
 * ticket, a reply on a known thread appends to it, and a reply from an agent
 * goes back out under the same subject. The only thing that makes that work is
 * the ticket number in the subject line, so it is the first thing here.
 *
 * The channel is deliberately split into two halves: inbound is a signed POST
 * that any mail worker (IMAP poller, Microsoft Graph subscription, a Zapier
 * action) can make, and outbound is a queue the app fills and a dispatcher
 * empties. Neither half needs the app to hold a mailbox password.
 */

export type EmailProvider = "imap" | "graph" | "relay";

export const EMAIL_PROVIDERS: { id: EmailProvider; label: string; hint: string }[] = [
  {
    id: "imap",
    label: "IMAP poller",
    hint: "A worker reads the mailbox and posts each message to the inbound route.",
  },
  {
    id: "graph",
    label: "Microsoft 365 (Graph)",
    hint: "A Graph subscription posts each new message to the inbound route.",
  },
  {
    id: "relay",
    label: "Relay / webhook",
    hint: "Any other service that can post JSON, e.g. a shared mailbox automation.",
  },
];

export function isEmailProvider(value: string): value is EmailProvider {
  return value === "imap" || value === "graph" || value === "relay";
}

export const EMAIL_BODY_MAX = 8000;
export const EMAIL_SUBJECT_MAX = 160;

/** `[TT-1001]` first (we write it), then a bare `TT-1001` anywhere. */
const TICKET_REFERENCE = /\bTT-(\d{3,7})\b/i;

export function ticketReferenceIn(...parts: (string | null | undefined)[]): string | null {
  for (const part of parts) {
    if (!part) continue;
    const match = TICKET_REFERENCE.exec(part);
    if (match) return `TT-${match[1]}`;
  }
  return null;
}

/** What goes out: `[TT-1001] VPN drops on the Chennai link`. */
export function outboundSubject(ticketId: string, subject: string): string {
  const clean = subject.replace(/\s+/g, " ").trim().slice(0, EMAIL_SUBJECT_MAX);
  return `[${ticketId}] ${clean}`;
}

/** Strips our own tag, so a loop (mail → ticket → mail) does not nest it. */
export function inboundSubject(raw: string): string {
  // "Re: [TT-1001] …" is the usual shape, so the prefixes and the tag have to be
  // peeled in either order — hence the loop rather than two fixed passes.
  let text = raw.trim();
  for (let pass = 0; pass < 3; pass += 1) {
    const next = text
      .replace(/^(re|fw|fwd):\s*/i, "")
      .replace(/^(\[[^\]]{1,24}\]\s*)+/, "");
    if (next === text) break;
    text = next;
  }
  return text.replace(/\s+/g, " ").trim().slice(0, EMAIL_SUBJECT_MAX);
}

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function emailAddressError(raw: string): string | null {
  const email = normaliseEmail(raw);
  if (!email) return "Enter an email address.";
  if (email.length > 254) return "That email address is too long.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "That does not look like an email address.";
  return null;
}

export type InboundEmail = {
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  /** Optional; helps a worker retry the same message without filing it twice. */
  messageId?: string;
};

/** Validates the JSON a mail worker posts. */
export function inboundEmailError(payload: Partial<InboundEmail>): string | null {
  const emailError = emailAddressError(String(payload.fromEmail ?? ""));
  if (emailError) return emailError;
  if (!String(payload.subject ?? "").trim() && !String(payload.body ?? "").trim()) {
    return "A message needs a subject or a body.";
  }
  if (String(payload.body ?? "").trim().length === 0) return "A message needs a body.";
  if (String(payload.body ?? "").length > EMAIL_BODY_MAX) {
    return `Keep an inbound message under ${EMAIL_BODY_MAX} characters.`;
  }
  if (String(payload.subject ?? "").length > EMAIL_SUBJECT_MAX * 2) {
    return "That subject line is too long to be real.";
  }
  return null;
}

/** The sender as a name, falling back to the local part of the address. */
export function senderName(payload: { fromName?: string; fromEmail: string }): string {
  const name = (payload.fromName ?? "").replace(/\s+/g, " ").trim();
  if (name) return name.slice(0, 80);
  const local = normaliseEmail(payload.fromEmail).split("@")[0] ?? "Requester";
  return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export type EmailSettingsInput = {
  enabled: boolean;
  address: string;
  provider: string;
  mailbox: string;
  relayUrl: string;
  defaultQueueId: string;
};

/**
 * Settings for the channel. The inbound secret never lives in the database —
 * it is `TICKET_INBOUND_SECRET` in the environment — so this form cannot leak it
 * to anyone who can read the table.
 */
export function emailSettingsError(input: EmailSettingsInput): string | null {
  if (!isEmailProvider(input.provider)) return "Pick how the mailbox is read.";
  if (!input.enabled) return null;

  const addressError = emailAddressError(input.address);
  if (addressError) return `Support address: ${addressError.toLowerCase()}`;
  if (!input.defaultQueueId) return "Pick the queue a new email lands in.";
  if (input.provider !== "graph" && !input.mailbox.trim()) {
    return "Name the mailbox the worker reads, e.g. INBOX.";
  }
  if (input.relayUrl.trim() && !/^https:\/\/.+/i.test(input.relayUrl.trim())) {
    return "The outbound relay has to be an https:// address.";
  }
  return null;
}

/** Does this ticket have somewhere to send a reply? */
export function canEmailRequester(ticket: { requesterEmail: string }, enabled: boolean): boolean {
  if (!enabled) return false;
  return emailAddressError(ticket.requesterEmail) === null;
}

export const OUTBOX_MAX_ATTEMPTS = 3;

/** "sent", "queued" or "failed" — the dispatcher's own words. */
export function outboxStatusLabel(status: string): string {
  if (status === "sent") return "Sent";
  if (status === "failed") return "Failed";
  return "Queued";
}

/** The single row the channel keeps, mirrored in demo mode. */
export const EMAIL_SEED_SETTINGS = {
  enabled: false,
  address: "",
  provider: "imap" as EmailProvider,
  mailbox: "INBOX",
  relayUrl: "",
  defaultQueueId: "service-desk",
};

/** Redacted for display: the inbound secret is an environment variable, never a row. */
export function maskAddress(address: string): string {
  return address ? address : "Not set";
}
