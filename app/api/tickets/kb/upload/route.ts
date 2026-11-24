import { NextResponse } from "next/server";
import { canAccessModule } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import {
  KB_FILE_MAX_BYTES,
  defaultTitleFromFile,
  formatBytes,
  kbFileError,
} from "@/lib/tickets/kb-files";
import { saveKbFile } from "@/lib/tickets/kb-files-store";

/**
 * `POST /api/tickets/kb/upload` — one file into the ticket knowledge base.
 *
 * Multipart rather than a server action, because the body is large and the
 * action body limit is smaller than one screenshot. Anyone who can open Tickets
 * may upload; the role is checked here, not only in the page that renders the
 * form.
 *
 * The file travels through this function and is written with the service role.
 * The bucket has no storage policies at all, so a browser cannot reach an object
 * even with a guessable path — reads go through the file route, which repeats
 * this check.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!canAccessModule(user.role, "tickets")) {
    return NextResponse.json({ error: "Your role cannot open Tickets." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "The upload could not be read. Try a smaller file." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }

  const tooBig = `Files are capped at ${formatBytes(KB_FILE_MAX_BYTES)}. Compress it or split it.`;
  if (file.size > KB_FILE_MAX_BYTES) {
    return NextResponse.json({ error: tooBig }, { status: 413 });
  }

  const fileName = (file.name || "upload").slice(0, 200);
  const title = String(form.get("title") ?? "").trim() || defaultTitleFromFile(fileName);
  const description = String(form.get("description") ?? "");
  const tags = String(form.get("tags") ?? "");

  const problem = kbFileError({
    title,
    description,
    fileName,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const record = await saveKbFile(
      {
        title,
        description,
        fileName,
        mimeType: file.type || "application/octet-stream",
        tags,
        uploadedById: user.id,
        uploadedByName: user.name,
      },
      bytes,
    );

    return NextResponse.json({
      ok: true,
      id: record.id,
      title: record.title,
      size: formatBytes(record.sizeBytes),
    });
  } catch (cause) {
    console.error("[tickets/kb] upload failed", cause);
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "The file could not be stored. Try again.",
      },
      { status: 500 },
    );
  }
}
