import { NextResponse } from "next/server";
import {
  getTicketEmailSettings,
  listDueTicketOutbox,
  markTicketOutboxFailed,
  markTicketOutboxSent,
} from "@/lib/records/repository";
import { OUTBOX_MAX_ATTEMPTS } from "@/lib/tickets/email";
import { relayPayload } from "@/lib/tickets/outbox";
import { runWithServiceRole } from "@/lib/supabase/server";

/**
 * `POST /api/tickets/outbox` — the dispatcher.
 *
 * Vercel's scheduler calls it with `Authorization: Bearer $TICKET_OUTBOX_SECRET`;
 * from a laptop, pass `x-outbox-secret`. With no secret configured the route
 * refuses to run: an open endpoint that sends mail on behalf of the company is
 * not something to leave lying around.
 *
 * Each message is POSTed to the configured relay as JSON. Success marks it sent;
 * a failure records the error and leaves it queued until the third attempt,
 * after which it is parked as `failed` for a human to look at.
 */
export const dynamic = "force-dynamic";

function secret(): string {
  return (process.env.TICKET_OUTBOX_SECRET ?? process.env.CRON_SECRET ?? "").trim();
}

function authorised(request: Request): boolean {
  const expected = secret();
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const direct = (request.headers.get("x-outbox-secret") ?? "").trim();
  return bearer === expected || direct === expected;
}

export async function POST(request: Request) {
  return runWithServiceRole(() => handle(request));
}

async function handle(request: Request) {
  if (!secret()) {
    return NextResponse.json(
      {
        error:
          "The dispatcher is not configured. Set TICKET_OUTBOX_SECRET (or CRON_SECRET) and call again.",
      },
      { status: 503 },
    );
  }
  if (!authorised(request)) {
    return NextResponse.json({ error: "That secret is not the dispatcher's secret." }, { status: 401 });
  }

  const settings = await getTicketEmailSettings();
  const due = await listDueTicketOutbox(20);

  if (!settings.enabled) {
    return NextResponse.json({ ok: true, skipped: "email channel is off", due: due.length });
  }
  if (!settings.relayUrl) {
    // Nothing is attempted, so nothing burns an attempt: the queue waits for a
    // relay to be configured.
    return NextResponse.json({
      ok: true,
      skipped: "no relay configured",
      due: due.length,
    });
  }

  let sent = 0;
  const failed: { id: string; error: string }[] = [];

  for (const item of due) {
    try {
      const response = await fetch(settings.relayUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret()}`,
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
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 240);
        throw new Error(`Relay answered ${response.status}${detail ? `: ${detail}` : ""}`);
      }

      await markTicketOutboxSent(item.id);
      sent += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The relay did not answer.";
      console.error(`[tickets] outbox ${item.id} failed`, message);
      await markTicketOutboxFailed({ id: item.id, error: message });
      failed.push({ id: item.id, error: message });
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    due: due.length,
    sent,
    failed,
    maxAttempts: OUTBOX_MAX_ATTEMPTS,
  });
}
