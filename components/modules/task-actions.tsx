"use client";

import {
  AlertCircle,
  CheckCircle2,
  Eye,
  GitBranch,
  Loader2,
  NotebookPen,
  PencilLine,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { StatusPill, humanise } from "@/components/ui/status-pill";
import { ROLE_BY_ID, VISIBLE_ROLES } from "@/lib/roles";
import { formatDate, formatDateTime } from "@/lib/format";
import type { FormState } from "@/lib/forms";
import type { TaskRecord } from "@/lib/tasks/repository";
import type { TaskStatus } from "@/lib/tasks/store";
import {
  changeTaskStatusAction,
  updateTaskAction,
  updateTaskNoteAction,
} from "@/app/(app)/modules/tasks/actions";

type Mode = "view" | "edit" | "status" | "notes" | null;

const STATUS_CHOICES: { value: TaskStatus; label: string; hint: string }[] = [
  { value: "todo", label: "To do", hint: "Queued, not started" },
  { value: "in_progress", label: "In progress", hint: "Being worked on" },
  { value: "done", label: "Done", hint: "Complete and closed" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="mt-1 text-[12.5px] text-navy">{children}</dd>
    </div>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
      >
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-[12.5px] text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * Per-task options: view the record, move its status, edit its body, or append
 * a working note. Editing is leadership-only; moving and noting are allowed for
 * the owning team as well — the same rule the server actions enforce.
 */
export function TaskActions({
  task,
  canEdit,
  canContribute,
}: {
  task: TaskRecord;
  canEdit: boolean;
  canContribute: boolean;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [session, setSession] = useState(0);

  function open(next: Exclude<Mode, null>) {
    setSession((value) => value + 1);
    setMode(next);
  }

  const items: RowMenuItem[] = [
    {
      label: "View task",
      icon: <Eye className="h-3.5 w-3.5" aria-hidden />,
      onSelect: () => open("view"),
    },
  ];

  if (canContribute) {
    items.push({
      label: "Change status",
      icon: <GitBranch className="h-3.5 w-3.5" aria-hidden />,
      onSelect: () => open("status"),
    });
  }
  if (canEdit) {
    items.push({
      label: "Edit task",
      icon: <PencilLine className="h-3.5 w-3.5" aria-hidden />,
      onSelect: () => open("edit"),
    });
  }
  if (canContribute) {
    items.push({
      label: "Update notes",
      icon: <NotebookPen className="h-3.5 w-3.5" aria-hidden />,
      onSelect: () => open("notes"),
    });
  }

  return (
    <>
      <RowMenu label={`Options for ${task.id}`} items={items} />

      {/* View -------------------------------------------------------------- */}
      <Dialog
        open={mode === "view"}
        onClose={() => setMode(null)}
        title={task.title}
        description={`${task.id} · raised by ${task.createdByName}`}
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => setMode(null)}>
              Close
            </Button>
          </div>
        }
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <Field label="Status">
            <StatusPill status={task.status} label={humanise(task.status)} />
          </Field>
          <Field label="Priority">
            <StatusPill status={task.priority} label={humanise(task.priority)} />
          </Field>
          <Field label="Assigned team">{ROLE_BY_ID[task.assigneeRole]?.label ?? "—"}</Field>
          <Field label="Due">{task.dueDate ? formatDate(task.dueDate) : "—"}</Field>
          <Field label="Raised">{formatDateTime(task.createdAt)}</Field>
          <Field label="Requester role">{ROLE_BY_ID[task.createdByRole]?.label ?? "—"}</Field>
        </dl>

        <section className="mt-5 border-t border-line pt-4">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Description
          </h3>
          <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-body">
            {task.description || "No description was added."}
          </p>
        </section>

        <section className="mt-5 border-t border-line pt-4">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Notes</h3>
          {task.notes ? (
            <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-body">
              {task.notes}
            </p>
          ) : (
            <p className="mt-1.5 text-[12.5px] text-muted">
              No notes yet. Use “Update notes” to record progress.
            </p>
          )}
        </section>
      </Dialog>

      {/* Change status ----------------------------------------------------- */}
      {mode === "status" && <StatusForm key={session} task={task} onDone={() => setMode(null)} />}

      {/* Edit -------------------------------------------------------------- */}
      {mode === "edit" && <EditForm key={session} task={task} onDone={() => setMode(null)} />}

      {/* Notes ------------------------------------------------------------- */}
      {mode === "notes" && <NoteForm key={session} task={task} onDone={() => setMode(null)} />}
    </>
  );
}

function StatusForm({
  task,
  onDone,
}: {
  task: TaskRecord;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(changeTaskStatusAction, {} as FormState);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (state.ok) {
      const timer = window.setTimeout(() => {
        setOpen(false);
        onDone();
      }, 600);
      return () => window.clearTimeout(timer);
    }
  }, [state, onDone]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        setOpen(false);
        onDone();
      }}
      title="Change status"
      description={`${task.id} · currently ${humanise(task.status)}`}
      size="sm"
      footer={
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setOpen(false);
              onDone();
            }}
          >
            Cancel
          </Button>
        </div>
      }
    >
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={task.id} />

        <div className="space-y-1.5">
          {STATUS_CHOICES.map((choice) => {
            const active = choice.value === task.status;
            return (
              <button
                key={choice.value}
                type="submit"
                name="status"
                value={choice.value}
                disabled={pending}
                aria-pressed={active}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                  active
                    ? "border-gold bg-[#fbf7ee]"
                    : "border-line hover:border-line-strong hover:bg-[#f7f9fc]"
                }`}
              >
                <span>
                  <span className="block text-[12.5px] font-medium text-navy">{choice.label}</span>
                  <span className="block text-[11.5px] text-muted">{choice.hint}</span>
                </span>
                {active && (
                  <span className="text-[11px] uppercase tracking-[0.1em] text-[#8a7238]">
                    Current
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {pending && (
          <p className="flex items-center gap-2 text-[12px] text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Saving…
          </p>
        )}
        <Feedback state={state} />
      </form>
    </Dialog>
  );
}

function EditForm({ task, onDone }: { task: TaskRecord; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(updateTaskAction, {} as FormState);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      onDone();
    }
  }, [state, onDone]);

  const dueValue = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "";

  return (
    <Dialog
      open={open}
      onClose={() => {
        setOpen(false);
        onDone();
      }}
      title="Edit task"
      description={task.id}
      size="lg"
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={task.id} />

        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={`${task.id}-title`} className="field-label">
              Task title<span className="ml-0.5 text-danger">*</span>
            </label>
            <input
              id={`${task.id}-title`}
              name="title"
              defaultValue={task.title}
              required
              minLength={4}
              className="field"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor={`${task.id}-description`} className="field-label">
              Description
            </label>
            <textarea
              id={`${task.id}-description`}
              name="description"
              rows={3}
              defaultValue={task.description}
              className="field resize-none"
            />
          </div>

          <div>
            <label htmlFor={`${task.id}-assignee`} className="field-label">
              Assign to<span className="ml-0.5 text-danger">*</span>
            </label>
            <select
              id={`${task.id}-assignee`}
              name="assigneeRole"
              defaultValue={task.assigneeRole}
              required
              className="field"
            >
              {VISIBLE_ROLES.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${task.id}-priority`} className="field-label">
              Priority<span className="ml-0.5 text-danger">*</span>
            </label>
            <select
              id={`${task.id}-priority`}
              name="priority"
              defaultValue={task.priority}
              required
              className="field"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label htmlFor={`${task.id}-due`} className="field-label">
              Due date
            </label>
            <input
              id={`${task.id}-due`}
              name="dueDate"
              type="date"
              defaultValue={dueValue}
              className="field"
            />
          </div>
        </div>

        <Feedback state={state} />

        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setOpen(false);
              onDone();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function NoteForm({ task, onDone }: { task: TaskRecord; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(updateTaskNoteAction, {} as FormState);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      onDone();
    }
  }, [state, onDone]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        setOpen(false);
        onDone();
      }}
      title="Update notes"
      description={`${task.id} · notes are appended, never overwritten`}
      size="md"
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={task.id} />

        <div>
          <label htmlFor={`${task.id}-note`} className="field-label">
            New note<span className="ml-0.5 text-danger">*</span>
          </label>
          <textarea
            id={`${task.id}-note`}
            name="note"
            rows={4}
            required
            minLength={3}
            maxLength={2000}
            placeholder="What moved, what is blocked, what happens next"
            className="field resize-none"
          />
        </div>

        {task.notes && (
          <div className="border-t border-line pt-3">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Existing notes
            </h3>
            <p className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-line text-[12px] leading-relaxed text-muted">
              {task.notes}
            </p>
          </div>
        )}

        <Feedback state={state} />

        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setOpen(false);
              onDone();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Add note
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
