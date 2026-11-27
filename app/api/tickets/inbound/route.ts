import { NextResponse } from "next/server";
import {
  appendInboundTicketEmail,
  getTicketEmailSettings,
  listPublicTicketQueues,
  submitPublicTicket,
} from "@/lib/records/repository";
import {
  EMAIL_SUBJECT_MAX,
  inboundEmailError,
  inboundSubject,
  normaliseEmail,
  senderName,
  ticketReferenceIn,
  type InboundEmail,
} from "@/lib/tickets/email";
import { publicSubject } from "@/lib/tickets/public-form";
import { runWithServiceRole } from "@/lib/supabase/server";

/**
 * `POST /api/tickets/inbound` — one message in, one ticket or one article out.
 *
 * Any mail worker can call this: an IMAP poller, a Microsoft Graph
 * subscription, a shared-mailbox automation. The contract is JSON and a bearer
 * secret, because the sender is a machine and there is no session.
 *
 * The rules, in order:
 *   1. the secret has to match `TICKET_INBOUND_SECRET` (or `TICKET_EMAIL_SECRET`);
 *   2. the channel has to be on;
 *   3. a `[TT-1001]` in the subject, from the address already on that ticket,
 *      appends to it;
 *   4. anything else opens a new ticket in the channel's queue.
 *
 * `messageId` makes it idempotent: a worker that retries after a timeout gets
 * the ticket it already filed, not a second one.
 */
export const dynamic = "force-dynamic";

function secret(): string {
  return (process.env.TICKET_INBOUND_SECRET ?? process.env.TICKET_EMAIL_SECRET ?? "").trim();
}

function authorised(request: Request): boolean {
  const expected = secret();
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const direct = (request.headers.get("x-ticket-secret") ?? "").trim();
  return bearer === expected || direct === expected;
}

export async function POST(request: Request) {
  // A machine, not a person: this route has to see and write rows that no
  // session is allowed to touch. The bearer secret above is the authorisation.
  return runWithServiceRole(() => handle(request));
}

async function handle(request: Request) {
  if (!secret()) {
    return NextResponse.json(
      {
        error:
          "The inbound channel is not configured. Set TICKET_INBOUND_SECRET and call again.",
      },
      { status: 503 },
    );
  }
  if (!authorised(request)) {
    return NextResponse.json({ error: "That secret is not the inbound secret." }, { status: 401 });
  }

  let payload: Partial<InboundEmail> & { messageId?: string };
  try {
    payload = (await request.json()) as Partial<InboundEmail> & { messageId?: string };
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const error = inboundEmailError(payload);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const settings = await getTicketEmailSettings();
  if (!settings.enabled) {
    // 202, not 4xx: the worker did nothing wrong, the channel is just closed.
    return NextResponse.json(
      { ok: true, ignored: "email channel is off" },
      { status: 202 },
    );
  }

  const fromEmail = normaliseEmail(String(payload.fromEmail));
  const fromName = senderName({ fromName: payload.fromName, fromEmail });
  const body = String(payload.body ?? "").trim();
  const subject = String(payload.subject ?? "").trim();
  const messageId = payload.messageId?.trim() || null;
  const reference = ticketReferenceIn(subject);

  try {
    if (reference) {
      const ticketId = await appendInboundTicketEmail({
        reference,
        fromEmail,
        fromName,
        body,
        externalId: messageId,
      });
      if (ticketId) {
        return NextResponse.json({ ok: true, ticketId, appended: true });
      }
      // The reference pointed at nothing this sender owns; fall through and file
      // it as new work rather than dropping it.
    }

    const queues = await listPublicTicketQueues();
    const queue =
      queues.find((item) => item.id === settings.defaultQueueId) ?? queues[0];
    if (!queue) {
      return NextResponse.json(
        { error: "No queue is open to the email channel." },
        { status: 503 },
      );
    }

    // The subject line is the ticket title; a message with only a body gets its
    // first line, so nothing arrives untitled.
    const title =
      publicSubject(inboundSubject(subject)) ||
      publicSubject(body.split("\n")[0] ?? "") ||
      "Message from email";

    const ticket = await submitPublicTicket({
      subject: title.slice(0, EMAIL_SUBJECT_MAX),
      body,
      name: fromName,
      email: fromEmail,
      queueId: queue.id,
      channel: "email",
      externalId: messageId,
      systemNote: reference
        ? `Inbound email quoted ${reference}, but the sender is not the requester on that ticket — filed as a new ticket.`
        : "",
    });

    return NextResponse.json({ ok: true, ticketId: ticket.id, appended: false });
  } catch (cause) {
    console.error("[tickets] inbound email failed", cause);
    return NextResponse.json(
      { error: "The message could not be filed. Try again." },
      { status: 500 },
    );
  }
}
