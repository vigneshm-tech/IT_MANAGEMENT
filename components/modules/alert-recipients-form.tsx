"use client";

import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

/**
 * The alert recipients.
 *
 * One textarea, because that is how a list of addresses arrives from a person —
 * pasted out of a mail thread, separated by commas or new lines. The server
 * parses it, says which entry did not look like an address, and saves the rest.
 */
export function AlertRecipientsForm({
  action,
  initialRecipients,
  initialEnabled,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initialRecipients: string[];
  initialEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);

  return (
    <form action={formAction} className="border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">Alert recipients</p>
        <p className="text-[11px] text-muted">IT Manager and super admin only</p>
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

        <div>
          <label htmlFor="alert-recipients" className="field-label">
            Send alerts to
          </label>
          <textarea
            id="alert-recipients"
            name="recipients"
            rows={3}
            defaultValue={initialRecipients.join(", ")}
            placeholder="it-team@example.com, ops@example.com"
            className="field mt-1 w-full font-mono text-[12px] leading-relaxed"
          />
          <p className="mt-1 text-[11px] text-muted">
            Commas or new lines. A mail goes out when a site goes down and again when it comes back.
          </p>
        </div>

        <label className="flex items-start gap-2 text-[12.5px] text-body">
          <input
            type="checkbox"
            name="alertsEnabled"
            defaultChecked={initialEnabled}
            className="mt-0.5 h-3.5 w-3.5 rounded border-line-strong"
          />
          <span>
            Email the recipients when a site goes down
            <span className="mt-0.5 block text-[11px] text-muted">
              Turning this off keeps the board live but sends nothing.
            </span>
          </span>
        </label>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden />
            )}
            Save alerts
          </Button>
        </div>
      </div>
    </form>
  );
}
