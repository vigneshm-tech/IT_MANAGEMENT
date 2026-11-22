"use client";

import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { submitPublicTicketAction, type PublicTicketFormState } from "@/app/support/new/actions";
import { HONEYPOT_FIELD } from "@/lib/tickets/spam";
import {
  PUBLIC_BODY_MAX,
  PUBLIC_NAME_MAX,
  PUBLIC_SUBJECT_MAX,
} from "@/lib/tickets/public-form";
import type { TicketQueueRecord } from "@/lib/records/repository";

/**
 * The public form.
 *
 * Two things here are for machines rather than people: the hidden honeypot field
 * (a bot fills it, a browser never shows it) and `startedAt`, which is when the
 * form was rendered — a submission inside 1.5 seconds came from a script.
 */
export function PublicTicketForm({ queues }: { queues: TicketQueueRecord[] }) {
  const [state, formAction, pending] = useActionState(submitPublicTicketAction, {} as PublicTicketFormState);
  const [startedAt, setStartedAt] = useState(0);

  useEffect(() => {
    setStartedAt(Date.now());
  }, []);

  if (state.ok && state.ticketId) {
    return (
      <div className="border border-[#cfe4d4] bg-surface px-5 py-6">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Ticket filed
        </p>
        <p className="mt-1.5 text-[13px] text-body">
          Your ticket number is{" "}
          <span className="font-mono text-[13.5px] font-semibold text-navy">{state.ticketId}</span>.
          Quote it in any email about this problem — replies that carry it land straight on the ticket.
        </p>
        <p className="mt-3 text-[12px] text-muted">
          We reply to the address you gave us. Nothing else is needed from you right now.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/support/kb"
            className="inline-flex h-9 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-[13px] font-medium text-navy hover:bg-[#f2f5fa]"
          >
            Browse the knowledge base
          </Link>
          <Link
            href="/support/new"
            className="inline-flex h-9 items-center justify-center rounded-md px-4 text-[13px] font-medium text-body hover:text-navy"
          >
            Raise another ticket
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="border border-line bg-surface">
      <input type="hidden" name="startedAt" value={startedAt} />
      <div aria-hidden className="hidden">
        <label htmlFor={HONEYPOT_FIELD}>Website</label>
        <input id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="field-label">
              Your name<span className="ml-0.5 text-danger">*</span>
            </label>
            <input
              id="name"
              name="name"
              required
              maxLength={PUBLIC_NAME_MAX}
              autoComplete="name"
              className="field"
            />
          </div>
          <div>
            <label htmlFor="email" className="field-label">
              Email<span className="ml-0.5 text-danger">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="field"
              placeholder="you@company.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="queueId" className="field-label">
            Who should look at this?
          </label>
          <select id="queueId" name="queueId" className="field" defaultValue={queues[0]?.id ?? ""}>
            {queues.map((queue) => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
                {queue.description ? ` — ${queue.description}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="subject" className="field-label">
            Subject<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="subject"
            name="subject"
            required
            minLength={4}
            maxLength={PUBLIC_SUBJECT_MAX}
            className="field"
            placeholder="One line: what is not working?"
          />
        </div>

        <div>
          <label htmlFor="body" className="field-label">
            What happened?<span className="ml-0.5 text-danger">*</span>
          </label>
          <textarea
            id="body"
            name="body"
            required
            rows={7}
            maxLength={PUBLIC_BODY_MAX}
            className="field resize-y"
            placeholder="What you were doing, what you saw, and when it started."
          />
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="mx-4 mb-3 flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger sm:mx-5"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">
          We use your name and address only to answer this ticket.
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Send className="h-3.5 w-3.5" aria-hidden />
          )}
          Send to the service desk
        </Button>
      </div>
    </form>
  );
}
