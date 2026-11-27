/**
 * The outbound half of the email channel.
 *
 * An agent's public reply is written to `ticket_outbox`; a dispatcher (cron, or
 * the host's scheduler) empties the queue by POSTing it to the relay. Nothing
 * here sends mail directly — the app never holds an SMTP password, which is the
 * whole point of the split.
 */

import {
  markTicketOutboxFailed,
  markTicketOutboxSent,
  queueTicketEmail,
  type TicketEmailSettingsRecord,
  type TicketOutboxRecord,
} from "../records/repository";
import { canEmailRequester, outboundSubject } from "./email";

export type ReplyTicket = {
  id: string;
  subject: string;
  requesterEmail: string;
  requesterName: string;
  state: string;
};

/**
 * Queues an agent's reply for delivery. Returns null when the channel is off or
 * the ticket has no usable address — a missing email is not an error the agent
 * has to see, because the reply is still on the ticket.
 */
export async function enqueueReplyEmail(
  ticket: ReplyTicket,
  body: string,
  settings: { enabled: boolean },
): Promise<TicketOutboxRecord | null> {
  if (!canEmailRequester(ticket, settings.enabled)) return null;

  const queued = await queueTicketEmail({
    ticketId: ticket.id,
    toAddress: ticket.requesterEmail,
    subject: outboundSubject(ticket.id, ticket.subject),
    body: body.trim(),
  });

  return queued;
}

/** The body of the plain-text message a relay sends. */
export function relayPayload(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
  ticketId: string;
}): { from: string; to: string; subject: string; text: string; ticket_id: string } {
  return {
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: `${input.body}\n\n—\nTicket ${input.ticketId}. Reply to this message and keep the ticket number in the subject.\n`,
    ticket_id: input.ticketId,
  };
}

/**
 * Hands one queued message to the relay.
 *
 * Returns the same shape as the dispatcher route so the two paths behave
 * identically; the reply action calls it inline (best effort, short timeout) so
 * a reply leaves as soon as it is written, and the route retries whatever did
 * not make it. A relay that answers slowly must never hold up the agent's form,
 * hence the five-second abort.
 */
export async function sendQueuedEmail(
  item: Pick<TicketOutboxRecord, "id" | "ticketId" | "toAddress" | "subject" | "body">,
  settings: Pick<TicketEmailSettingsRecord, "address" | "relayUrl">,
  options: { secret: string; timeoutMs?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!settings.relayUrl) return { ok: false, error: "No relay is configured." };

  try {
    const response = await fetch(settings.relayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.secret}`,
      },
      body: JSON.stringify(
        relayPayload({
          from: settings.address,
          to: item.toAddress,
          subject: item.subject,
          body: item.body,
          ticketId: item.ticketId,
        }),
      ),
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 240);
      throw new Error(`Relay answered ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    await markTicketOutboxSent(item.id);
    return { ok: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The relay did not answer.";
    await markTicketOutboxFailed({ id: item.id, error: message });
    return { ok: false, error: message };
  }
}
