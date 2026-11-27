import { NextResponse } from "next/server";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listPatchInbox, listPendingApprovals } from "@/lib/records/repository";

/**
 * The bell's heartbeat.
 *
 * The shell renders the count, but a page that is already open cannot know that
 * something new arrived — so the nav polls this tiny endpoint and rings the
 * chime when the number goes up. It returns a number and nothing else, so it
 * stays cheap; the list itself is refreshed by `router.refresh()` at that point.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    let count = 0;
    if (can(user.role, "approvals", "approve")) {
      count += (await listPendingApprovals()).length;
    }
    count += (await listPatchInbox(user.id)).length;

    return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Signed out or the read failed: the bell simply shows nothing new.
    return NextResponse.json({ count: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
}
