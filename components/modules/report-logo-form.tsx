"use client";

import { AlertCircle, CheckCircle2, ImageUp, Loader2, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

/**
 * The report logo setting.
 *
 * One file input and one button: pick a PNG or JPG, upload it, and every
 * patching report downloaded from then on carries it in the header. Removing it
 * puts the TaskTornado wordmark back — the report is never left without a mark,
 * so "no logo" is a real choice rather than an empty header.
 */
export function ReportLogoForm({
  uploadAction,
  removeAction,
  hasLogo,
  currentName,
}: {
  uploadAction: (state: FormState, formData: FormData) => Promise<FormState>;
  removeAction: (state: FormState, formData: FormData) => Promise<FormState>;
  hasLogo: boolean;
  currentName: string;
}) {
  const [uploadState, upload, uploading] = useActionState(uploadAction, {} as FormState);
  const [removeState, remove, removing] = useActionState(removeAction, {} as FormState);

  const error = uploadState.error ?? removeState.error;
  const message = uploadState.message ?? removeState.message;

  return (
    <div className="border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-navy">
          <ImageUp className="h-3.5 w-3.5" aria-hidden />
          Report logo
        </p>
        <p className="text-[11px] text-muted">PNG or JPG, up to 400 KB</p>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 border border-[#f0d5d5] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}
        {message && !error && (
          <p className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-3 py-2 text-[12.5px] text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {message}
          </p>
        )}

        <form action={upload} className="flex flex-wrap items-center gap-3">
          <input
            id="report-logo-file"
            name="logo"
            type="file"
            accept="image/png,image/jpeg"
            className="text-[12px] text-body file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:text-[12px] file:font-medium file:text-navy hover:file:bg-[#f2f5fa]"
          />
          <Button type="submit" size="sm" disabled={uploading}>
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <ImageUp className="h-3.5 w-3.5" aria-hidden />
            )}
            Upload logo
          </Button>
        </form>

        {hasLogo && (
          <form action={remove} className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <p className="min-w-0 flex-1 truncate text-[11.5px] text-muted">
              In use: <span className="text-body">{currentName || "uploaded image"}</span>
            </p>
            <Button type="submit" size="sm" variant="danger" disabled={removing}>
              {removing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              )}
              Use the TaskTornado logo
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
