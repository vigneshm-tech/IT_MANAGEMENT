import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FileDown, FileText, FolderOpen, Lock, Search, X } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { KbFileUploader } from "@/components/modules/kb-file-uploader";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  KB_FILE_KIND_LABELS,
  formatBytes,
  kbFileKind,
  matchesKbFile,
} from "@/lib/tickets/kb-files";
import { listKbFiles } from "@/lib/tickets/kb-files-store";
import { deleteKbFileAction } from "./actions";

export const metadata: Metadata = { title: "Ticket knowledge base" };

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function TicketKbPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; delete?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }

  const { q = "", delete: deleteId } = await searchParams;
  const files = await listKbFiles();
  const visible = files.filter((file) => matchesKbFile(file, q));
  const deleting = deleteId ? files.find((file) => file.id === deleteId) : undefined;
  const mayEdit = can(user.role, "tickets", "edit");

  return (
    <div className="space-y-5">
      <PageHeader title="Knowledge base">
        <div className="flex flex-wrap items-center justify-end gap-3 pb-4">
          <div className="flex items-center gap-2">
            <Link
              href="/modules/tickets"
              className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[12px] text-body transition-colors hover:border-navy hover:text-navy"
            >
              All tickets
            </Link>
            <Link
              href="/modules/kb"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-body transition-colors hover:border-navy hover:text-navy"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              Written articles
            </Link>
          </div>
        </div>
      </PageHeader>

      {deleting && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-[#f0d5d5] bg-danger-soft px-4 py-3">
          <p className="text-[12.5px] text-danger">
            Delete <span className="font-medium">“{deleting.title}”</span>? This cannot be undone.
          </p>
          <div className="flex items-center gap-2">
            <Link
              href="/modules/tickets/kb"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[11.5px] text-body hover:border-navy hover:text-navy"
            >
              <X className="h-3 w-3" aria-hidden />
              Cancel
            </Link>
            <form action={deleteKbFileAction}>
              <input type="hidden" name="id" value={deleting.id} />
              <button
                type="submit"
                className="inline-flex h-7 items-center rounded-md bg-danger px-2.5 text-[11.5px] font-medium text-white hover:bg-[#a83232]"
              >
                Delete file
              </button>
            </form>
          </div>
        </div>
      )}

      <KbFileUploader />

      <form action="/modules/tickets/kb" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search titles, descriptions, tags and file names…"
            aria-label="Search files"
            className="field pl-9"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border border-line px-3 text-[12px] text-body transition-colors hover:border-navy hover:text-navy"
        >
          Search
        </button>
        {q && (
          <Link
            href="/modules/tickets/kb"
            className="text-[11.5px] text-muted hover:text-navy hover:underline"
          >
            Clear
          </Link>
        )}
      </form>

      {visible.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={q ? `Nothing matches “${q}”` : "The library is empty"}
          description={
            q
              ? "Try a shorter word, or clear the search."
              : "Upload the PDFs, screenshots and exports the desk keeps reaching for."
          }
        />
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[780px] text-left">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.09em] text-muted">
                <th className="px-4 py-2.5 font-medium sm:px-5">File</th>
                <th className="px-3 py-2.5 font-medium">Tags</th>
                <th className="px-3 py-2.5 font-medium">Size</th>
                <th className="px-3 py-2.5 font-medium">Uploaded</th>
                <th className="px-4 py-2.5 text-right font-medium sm:px-5">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((file) => {
                const kind = kbFileKind(file.fileName, file.mimeType);
                const mayDelete = mayEdit || file.uploadedById === user.id;
                return (
                  <tr key={file.id}>
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex items-start gap-2.5">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                        <div className="min-w-0">
                          <Link
                            href={`/modules/tickets/kb/${file.id}`}
                            className="text-[12.5px] font-medium text-navy hover:underline"
                          >
                            {file.title}
                          </Link>
                          <p className="mt-0.5 text-[11px] text-muted">
                            {KB_FILE_KIND_LABELS[kind]} · {file.fileName}
                          </p>
                          {file.description && (
                            <p className="mt-0.5 max-w-[52ch] text-[11.5px] text-body">
                              {file.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {file.tags.length === 0 ? (
                        <span className="text-[11.5px] text-muted">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {file.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-[#eef2f8] px-1.5 py-0.5 text-[10.5px] text-body"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[11.5px] text-body">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="px-3 py-3 text-[11.5px] text-body">
                      {file.uploadedByName || "—"}
                      <span className="block text-[10.5px] text-muted">
                        {WHEN.format(new Date(file.createdAt))}
                      </span>
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/modules/tickets/kb/${file.id}`}
                          className="inline-flex h-7 items-center rounded-md border border-line px-2 text-[11.5px] text-body transition-colors hover:border-navy hover:text-navy"
                        >
                          View
                        </Link>
                        <a
                          href={`/api/tickets/kb/${file.id}/file?download=1`}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 text-[11.5px] text-body transition-colors hover:border-navy hover:text-navy"
                        >
                          <FileDown className="h-3 w-3" aria-hidden />
                          Download
                        </a>
                        {mayDelete && (
                          <Link
                            href={`/modules/tickets/kb?delete=${file.id}`}
                            className="inline-flex h-7 items-center rounded-md border border-[#f0d5d5] px-2 text-[11.5px] text-danger transition-colors hover:border-danger hover:bg-danger-soft"
                          >
                            Delete
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11.5px] text-muted">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        Files are private to people who can open Tickets.
      </p>
    </div>
  );
}
