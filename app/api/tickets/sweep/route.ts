import { NextResponse } from "next/server";
import { listTickets, recordTicketSystemEvent, updateTicket } from "@/lib/records/repository";
import { planSweep, sweepArticle, sweepSettingsFromEnv } from "@/lib/tickets/scheduler";
import { runWithServiceRole } from "@/lib/supabase/server";

/**
 * `GET /api/tickets/sweep` — the nightly job.
 *
 * Vercel's scheduler calls this with `Authorization: Bearer $CRON_SECRET`; from
 * a laptop, pass `x-sweep-secret` with the same value. With no secret
 * configured the route refuses to run, because a job that closes tickets must
 * never be open to the internet.
 *
 * The decisions come from `planSweep`, which is pure. This file only writes,
 * and every write goes through the same repository calls the UI uses — so the
 * sweep cannot produce a ticket state the app could not have produced itself.
 */
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.TICKET_SWEEP_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const direct = (request.headers.get("x-sweep-secret") ?? "").trim();
  return bearer === secret || direct === secret;
}

export async function GET(request: Request) {
  // The job runs without a session, so it must run with the service role or it
  // would see an empty board and quietly do nothing.
  return runWithServiceRole(() => handle(request));
}

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.TICKET_SWEEP_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "The sweep is not configured. Set CRON_SECRET (or TICKET_SWEEP_SECRET) and call again.",
      },
      { status: 503 },
    );
  }
  if (!authorised(request)) {
    return NextResponse.json({ error: "That secret is not the sweep's secret." }, { status: 401 });
  }

  const now = new Date();
  const settings = sweepSettingsFromEnv();
  const tickets = await listTickets();
  const plan = planSweep(tickets, now, settings);

  let closed = 0;
  let reminded = 0;
  let breaches = 0;
  const failures: string[] = [];

  for (const entry of plan.breach) {
    try {
      // Stamp first: if writing the article fails, the breach is still recorded
      // and the next run will not repeat itself.
      await updateTicket(
        entry.id,
        entry.kind === "first-response"
          ? { firstResponseBreachedAt: now.toISOString() }
          : { resolveBreachedAt: now.toISOString() },
      );
      await recordTicketSystemEvent(entry.id, sweepArticle(entry, entry.kind, entry.days, settings));
      breaches += 1;
    } catch (cause) {
      console.error(`[tickets] sweep breach failed for ${entry.id}`, cause);
      failures.push(entry.id);
    }
  }

  for (const entry of plan.remind) {
    try {
      await updateTicket(entry.id, { reminderSentAt: now.toISOString() });
      await recordTicketSystemEvent(entry.id, sweepArticle(entry, "remind", entry.days, settings));
      reminded += 1;
    } catch (cause) {
      console.error(`[tickets] sweep reminder failed for ${entry.id}`, cause);
      failures.push(entry.id);
    }
  }

  for (const entry of plan.close) {
    try {
      await updateTicket(entry.id, { state: "closed" });
      await recordTicketSystemEvent(entry.id, sweepArticle(entry, "close", entry.days, settings));
      closed += 1;
    } catch (cause) {
      console.error(`[tickets] sweep close failed for ${entry.id}`, cause);
      failures.push(entry.id);
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    at: now.toISOString(),
    settings,
    counted: { close: plan.close.length, remind: plan.remind.length, breach: plan.breach.length },
    written: { closed, reminded, breaches },
    failures,
  });
}
