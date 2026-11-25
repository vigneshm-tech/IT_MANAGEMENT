"use client";

import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

/**
 * Who hears about an outage — and who hears about it again.
 *
 * The first list is told when a site changes state. The second is told when one
 * has been down long enough that somebody should be doing something; the webhook
 * carries the same line to whichever chat the team actually watches.
 */
export function AlertRecipientsForm({
  action,
  initialRecipients,
  initialEnabled,
  initialEscalation,
  initialMinutes,
  initialWebhook,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initialRecipients: string[];
  initialEnabled: boolean;
  initialEscalation: string[];
  initialMinutes: number;
  initialWebhook: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);

  return (
    <form action={formAction} className="border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">Alerts</p>
        <p className="text-[11px] text-muted">IT Manager and super admin only</p>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
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
            rows={2}
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

        <div className="border-t border-line pt-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Escalation</p>

          <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <div>
              <label htmlFor="alert-escalation" className="field-label">
                Second list
              </label>
              <input
                id="alert-escalation"
                name="escalationEmails"
                defaultValue={initialEscalation.join(", ")}
                placeholder="managers@example.com"
                className="field mt-1 w-full font-mono text-[12px]"
              />
            </div>
            <div>
              <label htmlFor="alert-minutes" className="field-label">
                After minutes
              </label>
              <input
                id="alert-minutes"
                name="escalateAfterMinutes"
                type="number"
                min={1}
                max={1440}
                defaultValue={initialMinutes}
                className="field mt-1 w-full tabular-nums text-[12px]"
              />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            A site still down after this long is mailed to the second list once — the first alert still
            goes out immediately.
          </p>

          <div className="mt-3">
            <label htmlFor="alert-webhook" className="field-label">
              Webhook (Slack, Teams or anything that takes a JSON POST)
            </label>
            <input
              id="alert-webhook"
              name="webhookUrl"
              type="url"
              defaultValue={initialWebhook}
              placeholder="https://hooks.slack.com/services/…"
              className="field mt-1 w-full font-mono text-[12px]"
            />
            <p className="mt-1 text-[11px] text-muted">
              Sent alongside the email, with the same wording. Leave empty for email only.
            </p>
          </div>
        </div>

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
