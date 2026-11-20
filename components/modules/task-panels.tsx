"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { TASK_STATUS_OPTIONS, taskStatusHint } from "@/lib/tasks/options";
import type { FormState } from "@/lib/forms";
import type { TaskStatus } from "@/lib/tasks/store";
import { changeTaskStatusAction, updateTaskNoteAction } from "@/app/(app)/modules/tasks/actions";

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
      >
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p className="flex items-center gap-2 border border-[#cfe4d4] bg-success-soft px-3 py-2 text-[12.5px] text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        {state.message}
      </p>
    );
  }
  return null;
}

/** Inline status control — a plain form on the page, never a dialog. */
export function TaskStatusPanel({
  taskId,
  current,
  canMove,
}: {
  taskId: string;
  current: TaskStatus;
  canMove: boolean;
}) {
  const [state, formAction, pending] = useActionState(changeTaskStatusAction, {} as FormState);
  const [status, setStatus] = useState<TaskStatus>(current);

  return (
    <section id="status" className="scroll-mt-24 border border-line bg-surface">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-navy">Status</h2>
      </div>

      {canMove ? (
        <form action={formAction} className="space-y-3 px-4 py-4 sm:px-5">
          <input type="hidden" name="id" value={taskId} />
          <div className="sm:max-w-xs">
            <label htmlFor="task-status" className="field-label">
              Set status
            </label>
            <select
              id="task-status"
              name="status"
              required
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
              className="field"
            >
              {TASK_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] text-muted">{taskStatusHint(status)}</p>
          </div>

          <Feedback state={state} />

          <div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Save status
            </Button>
          </div>
        </form>
      ) : (
        <div className="px-4 py-4 text-[12.5px] text-muted sm:px-5">Read only for your role.</div>
      )}
    </section>
  );
}

/** Inline note composer. Notes are append-only. */
export function TaskNotesPanel({
  taskId,
  notes,
  canNote,
}: {
  taskId: string;
  notes: string;
  canNote: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateTaskNoteAction, {} as FormState);

  return (
    <section id="notes" className="scroll-mt-24 border border-line bg-surface">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-navy">Notes</h2>
      </div>

      <div className="px-4 py-4 sm:px-5">
        {notes ? (
          <p className="whitespace-pre-line border-l-2 border-line pl-3 text-[12.5px] leading-relaxed text-body">
            {notes}
          </p>
        ) : (
          <p className="text-[12.5px] text-muted">No notes yet.</p>
        )}

        {canNote && (
          <form action={formAction} className="mt-4 space-y-3 border-t border-line pt-4">
            <input type="hidden" name="id" value={taskId} />
            <div>
              <label htmlFor="task-note" className="field-label">
                Add a note
              </label>
              <textarea
                id="task-note"
                name="note"
                rows={3}
                required
                minLength={3}
                maxLength={2000}
                placeholder="What moved, what is blocked, what happens next"
                className="field resize-none"
              />
            </div>

            <Feedback state={state} />

            <div>
              <Button type="submit" size="sm" disabled={pending}>
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Add note
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
