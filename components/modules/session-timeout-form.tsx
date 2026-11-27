"use client";

import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { SESSION_TIMEOUT_OPTIONS } from "@/lib/session-policy";

/**
 * How long a sign-in lasts, chosen once for the workspace.
 *
 * A plain select: the offered lives, from an hour to *until sign out*. Nothing
 * is explained in the panel — the options say what they mean, and the current
 * choice is repeated back after saving.
 */
export function SessionTimeoutForm({
  action,
  initialMinutes,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initialMinutes: number;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);

  return (
    <form action={formAction} className="border-y border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-[13px] font-semibold text-navy">Login timeout</h2>
        {state.message && !state.error && (
          <span className="flex items-center gap-1.5 text-[11.5px] text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {state.message}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 px-4 py-4 sm:px-5">
        <div className="w-56">
          <label htmlFor="session-timeout" className="field-label">
            Signed in for
          </label>
          <select
            id="session-timeout"
            name="timeoutMinutes"
            defaultValue={String(initialMinutes)}
            className="field mt-1 w-full text-[12.5px]"
          >
            {SESSION_TIMEOUT_OPTIONS.map((option) => (
              <option key={option.minutes} value={option.minutes}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Save className="h-3.5 w-3.5" aria-hidden />
          )}
          Save
        </Button>
      </div>

      {state.error && (
        <p
          role="alert"
          className="flex items-center gap-2 border-t border-[#f0d5d5] bg-danger-soft px-4 py-2 text-[12px] text-danger sm:px-5"
        >
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {state.error}
        </p>
      )}
    </form>
  );
}
