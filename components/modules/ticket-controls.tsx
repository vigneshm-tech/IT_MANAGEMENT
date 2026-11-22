"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { updateTicketAction } from "@/app/(app)/modules/tickets/actions";
import { TICKET_PRIORITIES, TICKET_STATES } from "@/lib/tickets/core";
import type { AssignableUser, TicketQueueRecord, TicketRecord } from "@/lib/records/repository";

/** State, priority, queue, owner and tags in one save. Every change is logged. */
export function TicketControls({
  ticket,
  queues,
  people,
}: {
  ticket: TicketRecord;
  queues: TicketQueueRecord[];
  people: AssignableUser[];
}) {
  const [state, formAction, pending] = useActionState(updateTicketAction, {} as FormState);

  return (
    <form action={formAction} className="space-y-3 border border-line bg-surface px-4 py-4">
      <input type="hidden" name="ticketId" value={ticket.id} />

      <div>
        <label htmlFor="state" className="field-label">
          State
        </label>
        <select id="state" name="state" defaultValue={ticket.state} className="field">
          {TICKET_STATES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="priority" className="field-label">
          Priority
        </label>
        <select id="priority" name="priority" defaultValue={ticket.priority} className="field">
          {TICKET_PRIORITIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="queueId" className="field-label">
          Queue
        </label>
        <select id="queueId" name="queueId" defaultValue={ticket.queueId ?? ""} className="field">
          {queues.map((queue) => (
            <option key={queue.id} value={queue.id}>
              {queue.name}
            </option>
          ))}
          {!ticket.queueId && <option value="">No queue</option>}
        </select>
      </div>

      <div>
        <label htmlFor="ownerId" className="field-label">
          Owner
        </label>
        <select id="ownerId" name="ownerId" defaultValue={ticket.ownerId ?? ""} className="field">
          <option value="">Unassigned</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
          {ticket.ownerId && !people.some((person) => person.id === ticket.ownerId) && (
            <option value={ticket.ownerId}>{ticket.ownerName}</option>
          )}
        </select>
      </div>

      <div>
        <label htmlFor="tags" className="field-label">
          Tags
        </label>
        <input
          id="tags"
          name="tags"
          defaultValue={ticket.tags.join(", ")}
          placeholder="vpn, network"
          maxLength={200}
          className="field"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12px] text-danger"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p
          role="status"
          className="flex items-start gap-2 border border-[#cfe4d4] bg-success-soft px-3 py-2 text-[12px] text-success"
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <Button type="submit" variant="secondary" size="sm" disabled={pending} className="w-full">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        Save changes
      </Button>
    </form>
  );
}
