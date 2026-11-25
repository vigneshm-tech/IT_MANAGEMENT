"use client";

import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

/** "2026-11-25T18:00:00.000Z" → the value a datetime-local box wants, in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * A window where the site is expected to be down.
 *
 * Probes keep running — knowing a site is down during a deploy is exactly what
 * you want — but nothing is emailed, and the board says the window is open
 * rather than sitting red with no explanation.
 */
export function MaintenanceForm({
  action,
  initialFrom,
  initialTo,
  initialNote,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initialFrom: string | null;
  initialTo: string | null;
  initialNote: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);

  return (
    <form action={formAction} className="border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">Maintenance window</p>
        <p className="text-[11px] text-muted">Silences alerts, not the checks</p>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        {state.error && (
          <p
            role="alert"
            className="flex items-start gap-2 border border-[#f0d5d5] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {state.error}
          </p>
        )}
        {state.message && !state.error && (
          <p className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-3 py-2 text-[12.5px] text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {state.message}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,200px)_minmax(0,1fr)]">
          <div>
            <label htmlFor="maintenance-from" className="field-label">
              From
            </label>
            <input
              id="maintenance-from"
              name="from"
              type="datetime-local"
              defaultValue={toLocalInput(initialFrom)}
              className="field mt-1 w-full text-[12px]"
            />
          </div>
          <div>
            <label htmlFor="maintenance-to" className="field-label">
              To
            </label>
            <input
              id="maintenance-to"
              name="to"
              type="datetime-local"
              defaultValue={toLocalInput(initialTo)}
              className="field mt-1 w-full text-[12px]"
            />
          </div>
          <div>
            <label htmlFor="maintenance-note" className="field-label">
              What is happening
            </label>
            <input
              id="maintenance-note"
              name="note"
              defaultValue={initialNote}
              maxLength={200}
              placeholder="IIS patch window — WEB01"
              className="field mt-1 w-full text-[12px]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[11.5px] text-body">
            <input
              type="checkbox"
              name="clear"
              className="h-3.5 w-3.5 rounded border-line-strong"
            />
            Clear the window and let alerts run again
          </label>

          <Button type="submit" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden />
            )}
            Save window
          </Button>
        </div>
      </div>
    </form>
  );
}
