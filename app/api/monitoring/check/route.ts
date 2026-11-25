import { NextResponse } from "next/server";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { newestAgeSeconds, runChecks } from "@/lib/monitoring/run";
import { readChecks, readMonitorSettings } from "@/lib/monitoring/store";
import { runWithServiceRole } from "@/lib/supabase/server";

/**
 * `POST /api/monitoring/check` — probe every published URL now.
 *
 * Called by the board while it is open (when the last answer has gone stale) and
 * by its *Check now* button. It is a POST because it writes: the result of every
 * probe is stored, and a state change is emailed.
 *
 * `GET` is the same work behind a shared secret, so an external scheduler can
 * keep the board fresh when nobody has it open — Vercel's own cron list is left
 * alone because the plan limits how many jobs it will run and the nightly
 * ticket sweep and server sync already own those slots.
 */
export const dynamic = "force-dynamic";
/** Probing a long register is allowed to take longer than the default budget. */
export const maxDuration = 60;

function scheduledAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") && header.slice(7).trim() === secret;
}

export async function GET(request: Request) {
  if (!scheduledAuthorised(request)) {
    return NextResponse.json(
      { error: "Use the board, or pass the scheduler secret." },
      { status: 401 },
    );
  }
  return runWithServiceRole(async () => {
    // Honour the interval set under Monitoring → Settings: a scheduler may call
    // as often as it likes, but a URL is not probed more often than configured.
    const [settings, checks] = await Promise.all([readMonitorSettings(), readChecks()]);
    const age = newestAgeSeconds(checks.values());
    if (age !== null && age < settings.intervalSeconds) {
      return NextResponse.json({
        skipped: true,
        ageSeconds: age,
        intervalSeconds: settings.intervalSeconds,
      });
    }

    const summary = await runChecks();
    return NextResponse.json({ checked: summary.statuses.length, alerts: summary.alerts });
  });
}

export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Sign in to run a check." }, { status: 401 });
  }

  if (!canAccessModule(user.role, "monitoring")) {
    return NextResponse.json({ error: "Monitoring is not open to your role." }, { status: 403 });
  }

  const summary = await runChecks();
  return NextResponse.json({ statuses: summary.statuses, alerts: summary.alerts });
}
