import { NextResponse } from "next/server";
import { canAccessModule } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { canPreviewInline } from "@/lib/tickets/kb-files";
import { readKbFile } from "@/lib/tickets/kb-files-store";

/**
 * `GET /api/tickets/kb/<id>/file` — the file itself.
 *
 * Every read is a session check plus a module check, then a service-role
 * download: the bucket is private and has no policies, so this route is the only
 * way in. `?download=1` forces a save dialog; otherwise PDFs, images and text
 * open in the browser.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disposition(type: "inline" | "attachment", name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]+/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(name);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!canAccessModule(user.role, "tickets")) {
    return NextResponse.json({ error: "Your role cannot open Tickets." }, { status: 403 });
  }

  const { id } = await params;
  const stored = await readKbFile(id);
  if (!stored) {
    return NextResponse.json({ error: "That file is no longer in the library." }, { status: 404 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const inline = !download && canPreviewInline(stored.record.fileName, stored.record.mimeType);

  return new Response(new Uint8Array(stored.bytes), {
    headers: {
      "Content-Type": stored.record.mimeType || "application/octet-stream",
      "Content-Length": String(stored.bytes.byteLength),
      "Content-Disposition": disposition(inline ? "inline" : "attachment", stored.record.fileName),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
