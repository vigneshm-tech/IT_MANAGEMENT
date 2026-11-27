import { NextResponse } from "next/server";
import { sendDigest } from "@/lib/monitoring/digest";
import { runWithServiceRole } from "@/lib/supabase/server";

/**
 * `GET /api/monitoring/digest` — the daily summary, for a scheduler.
 *
 * Same secret as the sweep. Vercel's cron slots are spoken for, so this is
 * available to an external scheduler rather than added as a third job.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") && header.slice(7).trim() === secret;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Pass the scheduler secret." }, { status: 401 });
  }

  return runWithServiceRole(async () => {
    const result = await sendDigest();
    return NextResponse.json({
      sent: result.sent,
      message: result.message,
      down: result.digest.down,
      slow: result.digest.slow,
      incidents: result.digest.incidents,
      sites: result.digest.sites.length,
    });
  });
}
