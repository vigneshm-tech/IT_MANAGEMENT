"use client";

import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { updateTicketAction } from "@/app/(app)/modules/tickets/actions";
import type {
  IssuePriorityOption,
  IssueStatusOption,
  ProjectMember,
} from "@/lib/integrations/redmine";

type IssueSnapshot = {
  id: number;
  subject: string;
  description: string;
  statusId: number;
  priorityId: number;
  assigneeId: number | null;
};

/** Inline edit form for one issue — saves with `PUT /issues/<id>.json`. */
export function TicketUpdateForm({
  issue,
  statuses,
  priorities,
  members,
}: {
  issue: IssueSnapshot;
  statuses: IssueStatusOption[];
  priorities: IssuePriorityOption[];
  members: ProjectMember[];
  baseUrl: string;
}) {
  const [state, formAction, pending] = useActionState(updateTicketAction, {} as FormState);

  return (
    <form action={formAction} className="border border-line bg-surface">
      <input type="hidden" name="id" value={issue.id} />

      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-navy">
          Update ticket
        </h2>
        <p className="mt-1 text-[11.5px] text-muted">
          Saved straight to Redmine as issue #{issue.id}.
        </p>
      </div>

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
            maxLength={255}
            defaultValue={issue.subject}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="statusId" className="field-label">
            Status
          </label>
          <select id="statusId" name="statusId" defaultValue={issue.statusId} className="field">
            {statuses.length === 0 ? (
              <option value={issue.statusId}>Keep current status</option>
            ) : (
              statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label htmlFor="priorityId" className="field-label">
            Priority
          </label>
          <select id="priorityId" name="priorityId" defaultValue={issue.priorityId} className="field">
            {priorities.length === 0 ? (
              <option value={issue.priorityId}>Keep current priority</option>
            ) : (
              priorities.map((priority) => (
                <option key={priority.id} value={priority.id}>
                  {priority.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label htmlFor="assigneeId" className="field-label">
            Assigned to
          </label>
          <select
            id="assigneeId"
            name="assigneeId"
            defaultValue={issue.assigneeId ?? "none"}
            className="field"
          >
            <option value="none">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
            {issue.assigneeId !== null && !members.some((m) => m.id === issue.assigneeId) && (
              <option value={issue.assigneeId}>Keep current assignee</option>
            )}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="description" className="field-label">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={6}
            maxLength={8000}
            defaultValue={issue.description}
            className="field resize-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="notes" className="field-label">
            Add a comment
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={4000}
            placeholder="Optional note stored as a journal entry with the update"
            className="field resize-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">
          Nothing is written until you save. Status and priority come from your Redmine settings.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/modules/tickets"
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Cancel
          </Link>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Save changes
          </Button>
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
    </form>
  );
}
