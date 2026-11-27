import { NextResponse } from "next/server";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { mailReady } from "@/lib/email/smtp";
import { inMaintenance } from "@/lib/monitoring/core";
import { readBoard } from "@/lib/monitoring/run";
import { readMonitorSettings } from "@/lib/monitoring/store";

/**
 * `GET /api/monitoring/status` — the board as it stands.
 *
 * Reads only; nothing is probed. The page polls this while it is open so the
 * times ("checked 12s ago") stay honest, and asks `/api/monitoring/check` when
 * the newest answer has gone stale.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Sign in to see the monitoring board." }, { status: 401 });
  }

  if (!canAccessModule(user.role, "monitoring")) {
    return NextResponse.json({ error: "Monitoring is not open to your role." }, { status: 403 });
  }

  const [statuses, settings, canMail] = await Promise.all([
    readBoard(),
    readMonitorSettings(),
    mailReady(),
  ]);

  return NextResponse.json({
    statuses,
    alertsEnabled: settings.alertsEnabled,
    recipients: settings.recipientEmails,
    mailReady: canMail,
    intervalSeconds: settings.intervalSeconds,
    protocolFilter: settings.protocolFilter,
    maintenance: inMaintenance(settings.maintenance),
  });
}
