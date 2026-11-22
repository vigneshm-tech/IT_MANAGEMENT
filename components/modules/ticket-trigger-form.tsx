"use client";

import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { TICKET_PRIORITIES, TICKET_STATES } from "@/lib/tickets/core";
import {
  TRIGGER_EVENTS,
  TRIGGER_FIELDS,
  TRIGGER_OPERATORS,
} from "@/lib/tickets/triggers";
import type { TicketQueueRecord } from "@/lib/records/repository";

/**
 * A trigger is one condition and a bundle of consequences. The fields are fixed
 * lists rather than free text, so a saved rule cannot name something the engine
 * would then fail to understand.
 */
export function TicketTriggerForm({
  action,
  queues,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  queues: TicketQueueRecord[];
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);

  return (
    <form action={formAction} className="border border-line bg-surface">
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div>
          <label htmlFor="trigger-name" className="field-label">
            Name<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="trigger-name"
            name="name"
            required
            minLength={3}
            maxLength={60}
            placeholder="e.g. Laptop requests go to onboarding"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="trigger-event" className="field-label">
            When
          </label>
          <select id="trigger-event" name="event" className="field" defaultValue="ticket.created">
            {TRIGGER_EVENTS.map((event) => (
              <option key={event.id} value={event.id}>
                {event.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-[1fr_150px_1fr]">
            <div>
              <label htmlFor="trigger-field" className="field-label">
                Look at
              </label>
              <select id="trigger-field" name="field" className="field" defaultValue="subject">
                {TRIGGER_FIELDS.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="trigger-operator" className="field-label">
                Compare
              </label>
              <select
                id="trigger-operator"
                name="operator"
                className="field"
                defaultValue="contains"
              >
                {TRIGGER_OPERATORS.map((operator) => (
                  <option key={operator.id} value={operator.id}>
                    {operator.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="trigger-value" className="field-label">
                Value<span className="ml-0.5 text-danger">*</span>
              </label>
              <input
                id="trigger-value"
                name="value"
                required
                maxLength={120}
                placeholder="e.g. laptop"
                className="field"
              />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Matching ignores case. A priority or state value has to be the id, e.g. <code>urgent</code>.
          </p>
        </div>

        <div>
          <label htmlFor="trigger-state" className="field-label">
            Then set state
          </label>
          <select id="trigger-state" name="setState" className="field" defaultValue="">
            <option value="">Leave unchanged</option>
            {TICKET_STATES.filter((item) => item.id !== "merged").map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="trigger-priority" className="field-label">
            Then set priority
          </label>
          <select id="trigger-priority" name="setPriority" className="field" defaultValue="">
            <option value="">Leave unchanged</option>
            {TICKET_PRIORITIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="trigger-queue" className="field-label">
            Then move to queue
          </label>
          <select id="trigger-queue" name="setQueue" className="field" defaultValue="">
            <option value="">Leave unchanged</option>
            {queues.map((queue) => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="trigger-tag" className="field-label">
            Then add tag
          </label>
          <input id="trigger-tag" name="addTag" maxLength={24} placeholder="laptop" className="field" />
        </div>

        <div>
          <label htmlFor="trigger-description" className="field-label">
            One-line description
          </label>
          <input
            id="trigger-description"
            name="description"
            maxLength={200}
            placeholder="What the rule is for"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="trigger-note" className="field-label">
            Note written to the thread
          </label>
          <input
            id="trigger-note"
            name="note"
            maxLength={300}
            placeholder="Routed by rule."
            className="field"
          />
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">
          Rules run in the order listed. The first rule to set a field wins; tags add up.
        </p>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          Add trigger
        </Button>
      </div>
    </form>
  );
}
