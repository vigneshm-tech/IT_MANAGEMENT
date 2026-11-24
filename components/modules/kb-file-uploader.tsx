"use client";

import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  KB_FILE_ACCEPT,
  KB_FILE_MAX_BYTES,
  formatBytes,
  kbFileError,
} from "@/lib/tickets/kb-files";

/**
 * One file into the ticket knowledge base.
 *
 * The browser posts multipart to `/api/tickets/kb/upload` rather than a server
 * action, because the action body limit is smaller than one screenshot. The same
 * validation runs here and in the route: this copy exists so a 5 MB file is
 * refused before it is sent, not after it has spent somebody's upload.
 */
export function KbFileUploader() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");

    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a file to upload.");
      setMessage(null);
      return;
    }

    const problem = kbFileError({
      title: String(data.get("title") ?? "").trim() || file.name,
      description: String(data.get("description") ?? ""),
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (problem) {
      setError(problem);
      setMessage(null);
      return;
    }

    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/tickets/kb/upload", {
        method: "POST",
        body: data,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        title?: string;
        size?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "The file could not be uploaded.");
        return;
      }

      setMessage(
        `“${payload.title ?? file.name}” added${payload.size ? ` · ${payload.size}` : ""}.`,
      );
      form.reset();
      setFileName("");
      setFileSize(0);
      router.refresh();
    } catch {
      setError("The upload did not reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="border border-line bg-surface"
      encType="multipart/form-data"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">Upload a file</p>
        <p className="text-[11px] text-muted">PDF, image, Office, text or zip · up to {formatBytes(KB_FILE_MAX_BYTES)}</p>
      </div>

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div className="sm:col-span-2">
          <label htmlFor="kb-file" className="field-label">
            File<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="kb-file"
            name="file"
            type="file"
            accept={KB_FILE_ACCEPT}
            required
            onChange={(event) => {
              const file = event.target.files?.[0];
              setFileName(file?.name ?? "");
              setFileSize(file?.size ?? 0);
              setError(null);
              setMessage(null);
            }}
            className="block w-full cursor-pointer border border-line bg-[#f9fafc] px-3 py-2 text-[12.5px] text-body file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-2.5 file:py-1.5 file:text-[11.5px] file:font-medium file:text-white"
          />
          {fileName && (
            <p className="mt-1 text-[11px] text-muted">
              {fileName} · {formatBytes(fileSize)}
              {fileSize > KB_FILE_MAX_BYTES && (
                <span className="ml-1 text-danger">— too large, the cap is {formatBytes(KB_FILE_MAX_BYTES)}</span>
              )}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="kb-title" className="field-label">
            Title
          </label>
          <input
            id="kb-title"
            name="title"
            maxLength={120}
            placeholder="Defaults to the file name"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="kb-tags" className="field-label">
            Tags
          </label>
          <input
            id="kb-tags"
            name="tags"
            maxLength={120}
            placeholder="e.g. vpn, runbook, vendor"
            className="field"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="kb-description" className="field-label">
            Description
          </label>
          <input
            id="kb-description"
            name="description"
            maxLength={500}
            placeholder="What it is, and when somebody would reach for it"
            className="field"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <div aria-live="polite" className="min-h-[18px]">
          {error && (
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-danger">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              {error}
            </p>
          )}
          {message && (
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {message}
            </p>
          )}
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-3.5 w-3.5" aria-hidden />
          )}
          {pending ? "Uploading…" : "Upload file"}
        </Button>
      </div>
    </form>
  );
}
