import { Check, ListChecks, Trash2 } from "lucide-react";
import type { TicketTaskRecord } from "@/lib/records/repository";
import { checklistProgress } from "@/lib/tickets/core";
import {
  addTicketTaskAction,
  deleteTicketTaskAction,
  toggleTicketTaskAction,
} from "@/app/(app)/modules/tickets/actions";

/**
 * The checklist lives in the sidebar and writes through plain form Posts —
 * ticking a box is a server action, so a stale tab cannot half-apply it.
 */
export function TicketChecklist({
  ticketId,
  tasks,
  canEdit,
}: {
  ticketId: string;
  tasks: TicketTaskRecord[];
  canEdit: boolean;
}) {
  const progress = checklistProgress(tasks);

  return (
    <section className="border border-line bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
          <ListChecks className="h-3.5 w-3.5" aria-hidden />
          Checklist
        </h2>
        <span className="text-[11.5px] tabular-nums text-muted">{progress.label}</span>
      </header>

      {tasks.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-muted">
          Add the steps for this ticket.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {tasks.map((task) => (
            <li key={task.id} className="group flex items-start gap-2 px-4 py-2.5">
              <form action={toggleTicketTaskAction} className="flex items-start gap-2">
                <input type="hidden" name="ticketId" value={ticketId} />
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="done" value={task.done ? "0" : "1"} />
                <button
                  type="submit"
                  disabled={!canEdit}
                  aria-label={task.done ? `Untick ${task.title}` : `Tick ${task.title}`}
                  className={
                    task.done
                      ? "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-success bg-success-soft text-success"
                      : "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-line text-transparent transition-colors hover:border-navy/40"
                  }
                >
                  <Check className="h-3 w-3" aria-hidden />
                </button>
                <span
                  className={
                    task.done
                      ? "text-[12.5px] leading-snug text-muted line-through"
                      : "text-[12.5px] leading-snug text-body"
                  }
                >
                  {task.title}
                </span>
              </form>

              {canEdit && (
                <form action={deleteTicketTaskAction} className="ml-auto">
                  <input type="hidden" name="ticketId" value={ticketId} />
                  <input type="hidden" name="taskId" value={task.id} />
                  <button
                    type="submit"
                    aria-label={`Remove ${task.title}`}
                    className="text-[#b9c4d6] opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form action={addTicketTaskAction} className="flex items-center gap-2 border-t border-line px-3 py-2.5">
          <input type="hidden" name="ticketId" value={ticketId} />
          <input
            name="title"
            required
            minLength={2}
            maxLength={160}
            placeholder="Add a step…"
            aria-label="New checklist item"
            className="field h-8 flex-1 text-[12.5px]"
          />
          <button
            type="submit"
            className="shrink-0 border border-line bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-body transition-colors hover:border-navy/30 hover:text-navy"
          >
            Add
          </button>
        </form>
      )}
    </section>
  );
}
