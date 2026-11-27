import { NextResponse } from "next/server";
import { runSync } from "@/lib/servers/inventory";
import { runWithServiceRole } from "@/lib/supabase/server";

/**
 * `GET /api/servers/sync` — the nightly Action1 snapshot.
 *
 * Vercel's scheduler calls this with `Authorization: Bearer $CRON_SECRET`; from
 * a laptop, pass `x-sync-secret` with the same value. With no secret configured
 * the route refuses to run: a job that spends somebody's API quota must not be
 * open to the internet.
 *
 * The whole point of this route is that nobody waits for it. Servers, Patching,
 * the dashboard and the task form read the stored snapshot; this job is what
 * keeps that snapshot a day old at worst.
 */
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const direct = (request.headers.get("x-sync-secret") ?? "").trim();
  return bearer === secret || direct === secret;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Set CRON_SECRET before calling the inventory sync." },
      { status: 503 },
    );
  }
  if (!authorised(request)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  // No session: everything here runs with the service role.
  const result = await runWithServiceRole(() => runSync("system", "schedule"));

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, message: result.message },
      { status: result.reason === "failed" ? 502 : 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    endpointCount: result.endpointCount,
    durationMs: result.durationMs,
    capturedAt: result.inventory.capturedAt,
  });
}
