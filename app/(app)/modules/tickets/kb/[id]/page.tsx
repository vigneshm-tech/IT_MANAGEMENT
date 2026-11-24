import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDown, FileText, Lock } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { PageHeader } from "@/components/ui/page-header";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  KB_FILE_KIND_LABELS,
  canPreviewInline,
  formatBytes,
  kbFileKind,
} from "@/lib/tickets/kb-files";
import { getKbFileMeta, readKbFile } from "@/lib/tickets/kb-files-store";
import { deleteKbFileAction } from "../actions";

export const metadata: Metadata = { title: "Ticket knowledge base" };

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function TicketKbFilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }

  const { id } = await params;
  const record = await getKbFileMeta(id);
  if (!record) notFound();

  const kind = kbFileKind(record.fileName, record.mimeType);
  const inline = canPreviewInline(record.fileName, record.mimeType);
  const mayDelete = can(user.role, "tickets", "edit") || record.uploadedById === user.id;
  const src = `/api/tickets/kb/${record.id}/file`;

  // Text is read here so it renders as text rather than as a download.
  const text =
    kind === "text" ? (await readKbFile(record.id))?.bytes.toString("utf8").slice(0, 20_000) : null;

  return (
    <div className="space-y-5">
      <PageHeader title={record.title}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            <Link
              href="/modules/tickets/kb"
              className="inline-flex items-center gap-1 text-body hover:text-navy"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Knowledge base
            </Link>
            <span className="text-[#c2cbd9]">·</span>
            <span>
              {KB_FILE_KIND_LABELS[kind]} · {formatBytes(record.sizeBytes)}
            </span>
            <span className="text-[#c2cbd9]">·</span>
            <span>
              {record.uploadedByName || "Unknown"} · {WHEN.format(new Date(record.createdAt))}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`${src}?download=1`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-navy px-3 text-[12px] font-medium text-white transition-colors hover:bg-navy-soft"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden />
              Download
            </a>
            {mayDelete && (
              <form action={deleteKbFileAction}>
                <input type="hidden" name="id" value={record.id} />
                <button
                  type="submit"
                  className="inline-flex h-8 items-center rounded-md border border-[#f0d5d5] px-3 text-[12px] text-danger transition-colors hover:border-danger hover:bg-danger-soft"
                >
                  Delete
                </button>
              </form>
            )}
          </div>
        </div>
      </PageHeader>

      {record.description && (
        <p className="max-w-[80ch] text-[13px] text-body">{record.description}</p>
      )}

      {record.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {record.tags.map((tag) => (
            <span key={tag} className="rounded bg-[#eef2f8] px-1.5 py-0.5 text-[10.5px] text-body">
              {tag}
            </span>
          ))}
        </div>
      )}

      <section className="border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
          <p className="text-[12.5px] font-medium text-navy">Preview</p>
          <p className="text-[11px] text-muted">{record.fileName}</p>
        </div>

        {kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element -- streamed from a private route, not a static asset
          <img
            src={src}
            alt={record.title}
            className="mx-auto block max-h-[70vh] w-auto max-w-full bg-[#f5f7fb] p-4"
          />
        )}

        {kind === "pdf" && (
          <iframe
            src={src}
            title={record.title}
            className="h-[70vh] w-full bg-[#f5f7fb]"
          />
        )}

        {kind === "text" && (
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap px-4 py-4 text-[12.5px] leading-relaxed text-body sm:px-5">
            {text ?? "The file could not be read."}
          </pre>
        )}

        {!inline && (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <FileText className="h-8 w-8 text-[#b9c4d6]" aria-hidden />
            <p className="text-[12.5px] text-body">
              {KB_FILE_KIND_LABELS[kind]} files open on your machine rather than in the browser.
            </p>
            <a
              href={`${src}?download=1`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-navy transition-colors hover:border-navy"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden />
              Download {record.fileName}
            </a>
          </div>
        )}
      </section>

      <p className="flex items-start gap-1.5 text-[11.5px] text-muted">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        Private — visible only to people who can open Tickets.
      </p>
    </div>
  );
}
