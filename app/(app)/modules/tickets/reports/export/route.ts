import { NextResponse } from "next/server";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listTickets } from "@/lib/records/repository";
import { buildTicketReport, reportCsv } from "@/lib/tickets/reports";

/**
 * `GET /modules/tickets/reports/export`
 *
 * The same report the page shows, as a file. Built from the tickets at the
 * moment of the request rather than from a stored snapshot, so the CSV and the
 * screen can never disagree.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Sign in to download the report." }, { status: 401 });
  }

  if (!can(user.role, "tickets", "edit")) {
    return NextResponse.json(
      { error: "Ticket reports are for the agents who work the queues." },
      { status: 403 },
    );
  }

  const report = buildTicketReport(await listTickets());
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(reportCsv(report), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tasktornado-tickets-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
