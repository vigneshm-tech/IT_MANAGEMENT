"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CLIENT_IMPORT_COLUMNS, IMPORT_MAX_ROWS } from "@/lib/clients-import";
import { importClientsAction, type ImportState } from "@/app/(app)/modules/clients/import/actions";

/** Bulk import: a CSV file or a paste, never a dialog. */
export function ClientImportForm() {
  const [state, formAction, pending] = useActionState(importClientsAction, {} as ImportState);

  return (
    <form action={formAction} className="space-y-4">
      <section className="border border-line bg-surface">
        <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <div>
            <label htmlFor="file" className="field-label">
              CSV file
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              className="block w-full rounded-md border border-line-strong bg-surface px-2.5 py-2 text-[12.5px] text-body file:mr-3 file:rounded file:border-0 file:bg-[#eef2f8] file:px-2.5 file:py-1.5 file:text-[12px] file:font-medium file:text-navy"
            />
          </div>

          <div>
            <span className="field-label">Template</span>
            <Link
              href="/modules/clients/import/template"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[12.5px] font-medium text-navy transition-colors hover:bg-[#f2f5fa]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download CSV template
            </Link>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="csv" className="field-label">
              Or paste rows
            </label>
            <textarea
              id="csv"
              name="csv"
              rows={8}
              spellCheck={false}
              placeholder={`${CLIENT_IMPORT_COLUMNS.join(",")}\nAcme Manufacturing,ACME,Manufacturing,Ritu Shah,ritu.shah@acme.example,9840012345,IN,,,,`}
              className="field resize-y font-mono text-[11.5px]"
            />
            <p className="mt-1 text-[11.5px] text-muted">
              First line is the header. {CLIENT_IMPORT_COLUMNS.join(", ")}. Up to {IMPORT_MAX_ROWS} rows;
              a file wins over the paste box.
            </p>
          </div>
        </div>
      </section>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      {state.ok && state.message && (
        <p className="flex items-center gap-2 border border-[#cfe4d4] bg-success-soft px-3 py-2 text-[12.5px] text-success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          {state.message}
        </p>
      )}

      {state.issues && state.issues.length > 0 && (
        <ul className="space-y-1 border border-line bg-surface px-4 py-3 text-[12px] text-body">
          {state.issues.map((issue) => (
            <li key={issue} className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden />
              {issue}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-end gap-2">
        <Link
          href="/modules/clients"
          className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-4 text-[13px] font-medium text-navy transition-colors hover:bg-[#f2f5fa]"
        >
          Done
        </Link>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          Import clients
        </Button>
      </div>
    </form>
  );
}
