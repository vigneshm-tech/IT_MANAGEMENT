import { NextResponse } from "next/server";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { loadPatchReportModel } from "@/lib/patching/report-model";
import { buildPatchReportPdf } from "@/lib/patching/report-pdf";

/**
 * `GET /modules/patching/report/pdf?plans=<id>,<id>`
 *
 * The report as a file instead of a print preview. Printing through the browser
 * stamps the page title, the URL and the date into every margin and is at the
 * mercy of the dialog's settings — the PDF is drawn here, so the sheet carries
 * the wordmark and our own footer and nothing else.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Sign in to download the report." }, { status: 401 });
  }

  if (!canAccessModule(user.role, "patching")) {
    return NextResponse.json({ error: "Patching Plans is not open to your role." }, { status: 403 });
  }

  const plans = new URL(request.url).searchParams.get("plans") ?? "";
  const result = await loadPatchReportModel(user.id, plans);

  if (result.kind === "empty") {
    return NextResponse.json(
      { error: "Tick the endpoints that have a plan, then prepare the report again." },
      { status: 400 },
    );
  }

  const pdf = await buildPatchReportPdf(result.model);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="patching-report-${stamp}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
