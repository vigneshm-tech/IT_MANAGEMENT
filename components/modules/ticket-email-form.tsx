"use client";

import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { EMAIL_PROVIDERS } from "@/lib/tickets/email";
import type { TicketEmailSettingsRecord, TicketQueueRecord } from "@/lib/records/repository";

/**
 * The email channel's settings.
 *
 * One address in, one relay out. The inbound side is a signed route the mail
 * worker posts to; the outbound side is a queue the app fills and a dispatcher
 * empties. Neither side needs a mailbox password stored here.
 */
export function TicketEmailForm({
  action,
  settings,
  queues,
  canEdit,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  settings: TicketEmailSettingsRecord;
  queues: TicketQueueRecord[];
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const disabled = !canEdit || pending;

  return (
    <form action={formAction} className="border border-line bg-surface">
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div className="sm:col-span-2">
          <label className="flex items-start gap-2.5 border border-line px-3 py-2.5">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={settings.enabled}
              disabled={disabled}
              className="mt-0.5 h-4 w-4 accent-navy"
            />
            <span>
              <span className="block text-[12.5px] font-medium text-navy">Email channel on</span>
              <span className="mt-0.5 block text-[11.5px] text-muted">
                Public replies are sent and incoming mail opens tickets.
              </span>
            </span>
          </label>
        </div>

        <div>
          <label htmlFor="email-address" className="field-label">
            Support address
          </label>
          <input
            id="email-address"
            name="address"
            type="email"
            defaultValue={settings.address}
            placeholder="support@yourcompany.com"
            className="field"
            disabled={disabled}
          />
        </div>

        <div>
          <label htmlFor="email-provider" className="field-label">
            How the mailbox is read
          </label>
          <select
            id="email-provider"
            name="provider"
            defaultValue={settings.provider}
            className="field"
            disabled={disabled}
          >
            {EMAIL_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted">
            {EMAIL_PROVIDERS.find((provider) => provider.id === settings.provider)?.hint}
          </p>
        </div>

        <div>
          <label htmlFor="email-mailbox" className="field-label">
            Mail folder
          </label>
          <input
            id="email-mailbox"
            name="mailbox"
            defaultValue={settings.mailbox}
            placeholder="INBOX"
            className="field"
            disabled={disabled}
          />
        </div>

        <div>
          <label htmlFor="email-queue" className="field-label">
            New mail lands in
          </label>
          <select
            id="email-queue"
            name="defaultQueueId"
            defaultValue={settings.defaultQueueId ?? queues[0]?.id ?? ""}
            className="field"
            disabled={disabled}
          >
            {queues.map((queue) => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="email-relay" className="field-label">
            Outbound relay URL
          </label>
          <input
            id="email-relay"
            name="relayUrl"
            type="url"
            defaultValue={settings.relayUrl}
            placeholder="https://relay.yourcompany.com/send"
            className="field"
            disabled={disabled}
          />
          <p className="mt-1 text-[11px] text-muted">
            Leave empty to queue replies without sending.
          </p>
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="mx-4 mb-4 flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger sm:mx-5"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p
          role="status"
          className="mx-4 mb-4 flex items-start gap-2 border border-[#cfe4d4] bg-success-soft px-3 py-2 text-[12.5px] text-success sm:mx-5"
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">
          {canEdit
            ? "The inbound secret is set on the server."
            : "Your role can read the channel but not change it."}
        </p>
        {canEdit && (
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden />
            )}
            Save channel
          </Button>
        )}
      </div>
    </form>
  );
}
