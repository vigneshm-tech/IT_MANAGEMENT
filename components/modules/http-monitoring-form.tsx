"use client";

import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

/**
 * One question: do plain http URLs get monitored as well?
 *
 * On, every published binding is watched. Off, only the SSL-mapped ones are —
 * which is what most workspaces want, and it is a switch rather than a list of
 * exceptions so the IIS register stays the only place a site is described.
 */
export function HttpMonitoringForm({
  action,
  initialEnabled,
  counts,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initialEnabled: boolean;
  counts: { https: number; http: number };
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const total = counts.https + counts.http;

  return (
    <form action={formAction} className="border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">What to watch</p>
        <p className="text-[11px] text-muted">
          {counts.https + (initialEnabled ? counts.http : 0)} of {total} published bindings
        </p>
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

        <label className="flex items-start gap-2.5 border border-line px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-[#f7f9fd]">
          <input
            type="checkbox"
            name="monitorHttp"
            defaultChecked={initialEnabled}
            className="mt-0.5 h-3.5 w-3.5 rounded border-line-strong accent-[var(--color-navy)]"
          />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium text-navy">Enable HTTP monitoring</span>
            <span className="mt-0.5 block text-[11px] text-muted">
              On: every published binding is checked — {counts.https} https and {counts.http} http.
              Off: only the {counts.https} SSL-mapped {counts.https === 1 ? "URL" : "URLs"} are
              checked, and plain http bindings are ignored.
            </span>
          </span>
        </label>

        <p className="text-[11px] text-muted">
          The filter reads the IIS register as it is: a binding that gains or loses its SSL mapping
          moves in or out of the board on its own.
        </p>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden />
            )}
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
