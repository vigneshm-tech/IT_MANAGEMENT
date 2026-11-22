"use client";

import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { TICKET_PRIORITIES, TICKET_STATES } from "@/lib/tickets/core";
import type { TicketQueueRecord } from "@/lib/records/repository";

/** A macro is a name plus the handful of changes it applies. */
export function TicketMacroForm({
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
          <label htmlFor="name" className="field-label">
            Name<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            minLength={3}
            maxLength={60}
            placeholder="e.g. Escalate to security"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="addTag" className="field-label">
            Add tag
          </label>
          <input id="addTag" name="addTag" maxLength={24} placeholder="escalation" className="field" />
        </div>
        <div>
          <label htmlFor="setState" className="field-label">
            Set state
          </label>
          <select id="setState" name="setState" defaultValue="" className="field">
            <option value="">Leave unchanged</option>
            {TICKET_STATES.filter((state) => state.id !== "merged").map((state) => (
              <option key={state.id} value={state.id}>
                {state.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="setPriority" className="field-label">
            Set priority
          </label>
          <select id="setPriority" name="setPriority" defaultValue="" className="field">
            <option value="">Leave unchanged</option>
            {TICKET_PRIORITIES.map((priority) => (
              <option key={priority.id} value={priority.id}>
                {priority.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="setQueue" className="field-label">
            Move to queue
          </label>
          <select id="setQueue" name="setQueue" defaultValue="" className="field">
            <option value="">Leave unchanged</option>
            {queues.map((queue) => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="description" className="field-label">
            One-line description
          </label>
          <input
            id="description"
            name="description"
            maxLength={200}
            placeholder="Shown in the macro picker"
            className="field"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="note" className="field-label">
            Note written to the thread
          </label>
          <input
            id="note"
            name="note"
            maxLength={400}
            placeholder="Escalated to Security at urgent priority."
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

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">A macro must change at least one thing.</p>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          Add macro
        </Button>
      </div>
    </form>
  );
}
