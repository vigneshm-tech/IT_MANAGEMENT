import { NextResponse } from "next/server";
import { statusTone } from "@/lib/monitoring/core";
import { readBoardView } from "@/lib/monitoring/run";
import { readMonitorSettings } from "@/lib/monitoring/store";
import { runWithServiceRole } from "@/lib/supabase/server";

/**
 * `GET /api/monitoring/summary` — a read-only view for a status page or badge.
 *
 * Gated by a token the IT Manager sets under Monitoring → Settings, because a
 * board that names internal hosts should not be readable by guessing its URL.
 * An empty token turns the endpoint off rather than leaving it open.
 */
export const dynamic = "force-dynamic";

function tokenFrom(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return new URL(request.url).searchParams.get("token") ?? "";
}

export async function GET(request: Request) {
  const settings = await readMonitorSettings();
  if (!settings.summaryToken) {
    return NextResponse.json({ error: "The summary endpoint is turned off." }, { status: 404 });
  }
  if (tokenFrom(request) !== settings.summaryToken) {
    return NextResponse.json({ error: "A valid token is required." }, { status: 401 });
  }

  return runWithServiceRole(async () => {
    const { statuses, uptime24h } = await readBoardView();
    const sites = statuses.map((row) => ({
      site: row.site,
      url: row.url,
      status: statusTone(row),
      ok: row.ok,
      latencyMs: row.latencyMs,
      checkedAt: row.checkedAt,
      uptime24h: uptime24h.get(row.key)
        ? Math.round((uptime24h.get(row.key)!.up / Math.max(1, uptime24h.get(row.key)!.checks)) * 1000) / 10
        : null,
    }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      counts: {
        sites: sites.length,
        up: sites.filter((site) => site.status === "up").length,
        slow: sites.filter((site) => site.status === "slow").length,
        down: sites.filter((site) => site.status === "down").length,
      },
      sites,
    });
  });
}
