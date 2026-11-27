"use client";

import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { formatInterval } from "@/lib/monitoring/core";

/**
 * How often the board checks by itself.
 *
 * Two boxes, minutes and seconds, because that is how the interval is said out
 * loud. The server clamps what it is given and repeats the result back, so what
 * is stored is never a guess about what was typed.
 */
export function CheckScheduleForm({
  action,
  initialSeconds,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initialSeconds: number;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const minutes = Math.floor(initialSeconds / 60);
  const seconds = initialSeconds % 60;

  return (
    <form action={formAction} className="border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">Check schedule</p>
        <p className="text-[11px] text-muted">Currently every {formatInterval(initialSeconds)}</p>
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

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-24">
            <label htmlFor="check-minutes" className="field-label">
              Minutes
            </label>
            <input
              id="check-minutes"
              name="minutes"
              type="number"
              min={0}
              max={60}
              inputMode="numeric"
              defaultValue={minutes}
              className="field mt-1 w-full tabular-nums text-[12px]"
            />
          </div>
          <div className="w-24">
            <label htmlFor="check-seconds" className="field-label">
              Seconds
            </label>
            <input
              id="check-seconds"
              name="seconds"
              type="number"
              min={0}
              max={59}
              inputMode="numeric"
              defaultValue={seconds}
              className="field mt-1 w-full tabular-nums text-[12px]"
            />
          </div>
          <p className="pb-1.5 text-[11px] text-muted">
            10 sec to 60 min. Shorter intervals notice an outage sooner and cost more probes.
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden />
            )}
            Save schedule
          </Button>
        </div>
      </div>
    </form>
  );
}
