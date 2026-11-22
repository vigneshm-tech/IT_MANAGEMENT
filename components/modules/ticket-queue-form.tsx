"use client";

import { AlertCircle, CheckCircle2, Loader2, Plus, Save, X } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import type { TicketQueueRecord } from "@/lib/records/repository";

/**
 * Add or edit a queue. One form for both, because a queue is three fields and
 * the only difference is whether they start filled in.
 */
export function TicketQueueForm({
  action,
  queue,
  canEdit,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  queue?: TicketQueueRecord;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const prefix = queue ? `queue-${queue.id}` : "queue-new";

  if (!canEdit) {
    return (
      <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
        Your role can read the queues but not change them.
      </p>
    );
  }

  return (
    <form action={formAction} className="border border-line bg-surface">
      {queue && <input type="hidden" name="id" value={queue.id} />}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">
          {queue ? `Editing "${queue.name}"` : "New queue"}
        </p>
        {queue && (
          <Link
            href="/modules/tickets/masters/queues"
            className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-navy"
          >
            <X className="h-3 w-3" aria-hidden />
            Cancel
          </Link>
        )}
      </div>

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-[1fr_1.6fr] sm:px-5">
        <div>
          <label htmlFor={`${prefix}-name`} className="field-label">
            Name<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id={`${prefix}-name`}
            name="name"
            required
            minLength={2}
            maxLength={60}
            defaultValue={queue?.name ?? ""}
            placeholder="e.g. Field support"
            className="field"
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-description`} className="field-label">
            Description
          </label>
          <input
            id={`${prefix}-description`}
            name="description"
            maxLength={200}
            defaultValue={queue?.description ?? ""}
            placeholder="What belongs in this queue"
            className="field"
          />
        </div>
        <label
          htmlFor={`${prefix}-public`}
          className="flex items-start gap-2.5 border border-line px-3 py-2.5 sm:col-span-2"
        >
          <input
            id={`${prefix}-public`}
            type="checkbox"
            name="isPublic"
            defaultChecked={queue?.isPublic ?? false}
            className="mt-0.5 h-4 w-4 accent-navy"
          />
          <span>
            <span className="block text-[12.5px] font-medium text-navy">
              Offered on the public form
            </span>
            <span className="mt-0.5 block text-[11.5px] text-muted">
              A visitor at /support/new can file into this queue without an account.
            </span>
          </span>
        </label>
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

      <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : queue ? (
            <Save className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          {queue ? "Save queue" : "Add queue"}
        </Button>
      </div>
    </form>
  );
}
