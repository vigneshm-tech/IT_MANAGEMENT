"use client";

import Link from "next/link";
import { AlertCircle, Loader2, Send } from "lucide-react";
import { useActionState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { createTicketAction } from "@/app/(app)/modules/tickets/actions";
import { TICKET_PRIORITIES } from "@/lib/tickets/core";
import type { TicketQueueRecord } from "@/lib/records/repository";

/** Raise a ticket: subject, queue, priority, optional tags, then the message. */
export function TicketCreateForm({ queues }: { queues: TicketQueueRecord[] }) {
  const [state, formAction, pending] = useActionState(createTicketAction, {} as FormState);

  return (
    <form action={formAction} className="border border-line bg-surface">
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div className="sm:col-span-2">
          <label htmlFor="subject" className="field-label">
            Subject<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="subject"
            name="subject"
            required
            minLength={4}
            maxLength={160}
            placeholder="One line: what is wrong or needed?"
            className="field"
          />
          <p className="mt-1 text-[11.5px] text-muted">
            Everything after this lives in the ticket thread — you can add detail below.
          </p>
        </div>

        <div>
          <label htmlFor="queueId" className="field-label">
            Queue<span className="ml-0.5 text-danger">*</span>
          </label>
          <select id="queueId" name="queueId" required defaultValue={queues[0]?.id ?? ""} className="field">
            {queues.map((queue) => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="priority" className="field-label">
            Priority
          </label>
          <select id="priority" name="priority" defaultValue="normal" className="field">
            {TICKET_PRIORITIES.map((priority) => (
              <option key={priority.id} value={priority.id}>
                {priority.label} — due in {priority.resolveHours}h
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tags" className="field-label">
            Tags
          </label>
          <input
            id="tags"
            name="tags"
            maxLength={160}
            placeholder="vpn, network"
            className="field"
          />
          <p className="mt-1 text-[11.5px] text-muted">
            Comma separated, up to 8. Used by the search and the reports.
          </p>
        </div>

        <div>
          <label htmlFor="channel" className="field-label">
            Came in through
          </label>
          <select id="channel" name="channel" defaultValue="web" className="field">
            <option value="web">Web</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="chat">Chat</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="body" className="field-label">
            What happened?<span className="ml-0.5 text-danger">*</span>
          </label>
          <textarea
            id="body"
            name="body"
            required
            rows={7}
            maxLength={8000}
            placeholder="Steps, impact, asset names, error messages, what you have already tried"
            className="field resize-none"
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">
          You are the requester. Agents in the queue are notified in their list.
        </p>
        <div className="flex items-center gap-2">
          <Link href="/modules/tickets" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Cancel
          </Link>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden />
            )}
            Raise ticket
          </Button>
        </div>
      </div>
    </form>
  );
}
