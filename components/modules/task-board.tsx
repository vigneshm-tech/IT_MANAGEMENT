"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  Filter,
  Loader2,
  Lock,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  createTaskAction,
  updateTaskStatusAction,
  type CreateTaskState,
} from "@/app/(app)/modules/tasks/actions";
import { ROLE_BY_ID, ROLE_GROUPS, type RoleId } from "@/lib/roles";

export type TaskCardData = {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "todo" | "in_progress" | "done";
  assigneeRole: RoleId;
  createdByName: string;
  createdByRole: RoleId;
  createdLabel: string;
  dueLabel: string | null;
  overdue: boolean;
};

type FilterId = "all" | "open" | "done" | "team";

const PRIORITY_META = {
  low: { label: "Low", color: "#94a3b8" },
  medium: { label: "Medium", color: "#38bdf8" },
  high: { label: "High", color: "#fb923c" },
  critical: { label: "Critical", color: "#fb7185" },
} as const;

const STATUS_META = {
  todo: { label: "To do", icon: Circle },
  in_progress: { label: "In progress", icon: CircleDot },
  done: { label: "Done", icon: CheckCircle2 },
} as const;

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "team", label: "My team" },
  { id: "done", label: "Done" },
];

const initialState: CreateTaskState = {};

export function TaskBoard({
  tasks,
  userRole,
  userName,
  canCreate,
  restricted,
  windowMessage,
  opensAtLabel,
  canEdit,
}: {
  tasks: TaskCardData[];
  userRole: RoleId;
  userName: string;
  canCreate: boolean;
  restricted: boolean;
  windowMessage: string;
  opensAtLabel: string;
  canEdit: boolean;
}) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [panelOpen, setPanelOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createTaskAction, initialState);
  const [toast, setToast] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.message) {
      setToast(state.message);
      setPanelOpen(false);
      formRef.current?.reset();
    }
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [panelOpen]);

  const counts = useMemo(
    () => ({
      total: tasks.length,
      open: tasks.filter((task) => task.status !== "done").length,
      done: tasks.filter((task) => task.status === "done").length,
      team: tasks.filter((task) => task.assigneeRole === userRole).length,
    }),
    [tasks, userRole],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "open":
        return tasks.filter((task) => task.status !== "done");
      case "done":
        return tasks.filter((task) => task.status === "done");
      case "team":
        return tasks.filter((task) => task.assigneeRole === userRole);
      default:
        return tasks;
    }
  }, [tasks, filter, userRole]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-line/70 bg-surface/50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-muted">
            <Circle className="h-3.5 w-3.5" aria-hidden />
            {counts.open} open
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-success/25 bg-success/10 px-2.5 py-1.5 text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {counts.done} done
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-muted">
            <Filter className="h-3.5 w-3.5" aria-hidden />
            {counts.team} for your team
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line bg-surface/70 p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={filter === option.id}
                className={clsx(
                  "relative rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                  filter === option.id ? "text-white" : "text-muted hover:text-ink",
                )}
              >
                {filter === option.id && (
                  <motion.span
                    layoutId="task-filter"
                    className="absolute inset-0 rounded-md bg-brand/80"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative">{option.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            disabled={!canCreate}
            title={canCreate ? "Create a task" : windowMessage}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition",
              canCreate
                ? "bg-gradient-to-r from-brand to-[#5b8cff] text-white shadow-[0_10px_24px_-14px_rgba(124,92,255,0.9)] hover:brightness-110"
                : "cursor-not-allowed border border-line bg-surface-2/60 text-muted",
            )}
          >
            {canCreate ? (
              <>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New task
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Opens {opensAtLabel} IST
              </>
            )}
          </button>
        </div>
      </div>

      {restricted && !canCreate && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/[0.07] px-3.5 py-2.5 text-[12px] text-warning/90">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium text-warning">Engineer window closed.</span> {windowMessage}{" "}
            You can still update the status of tasks assigned to your team.
          </p>
        </div>
      )}

      <AnimatePresence initial={false}>
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-dashed border-line bg-surface/40 p-10 text-center"
          >
            <p className="text-[13px] font-medium text-ink">Nothing in this view</p>
            <p className="mt-1 text-[12px] text-muted">Switch filters to see other tasks.</p>
          </motion.div>
        ) : (
          <motion.ul layout className="space-y-2.5">
            <AnimatePresence initial={false}>
              {filtered.map((task) => {
                const priority = PRIORITY_META[task.priority];
                const assignee = ROLE_BY_ID[task.assigneeRole];
                const creator = ROLE_BY_ID[task.createdByRole];
                const editable = canEdit || task.assigneeRole === userRole;
                const StatusIcon = STATUS_META[task.status].icon;
                return (
                  <motion.li
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="group relative overflow-hidden rounded-2xl border border-line/70 bg-surface/50 p-4 transition hover:border-white/15 hover:bg-surface-2/50"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{ backgroundColor: priority.color, opacity: task.status === "done" ? 0.35 : 0.9 }}
                    />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">
                            {task.id}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: `${priority.color}18`, color: priority.color }}
                          >
                            {priority.label}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: `${assignee.accent}16`,
                              color: assignee.accent,
                            }}
                          >
                            {assignee.label}
                          </span>
                        </div>

                        <h3
                          className={clsx(
                            "mt-2 text-[13.5px] font-medium",
                            task.status === "done" ? "text-muted line-through" : "text-ink",
                          )}
                        >
                          {task.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">
                          {task.description}
                        </p>

                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted/80">
                          <span className="inline-flex items-center gap-1">
                            <Sparkles className="h-3 w-3" aria-hidden />
                            {task.createdByName} · {creator.shortLabel}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden />
                            {task.createdLabel}
                          </span>
                          {task.dueLabel && (
                            <span
                              className={clsx(
                                "inline-flex items-center gap-1",
                                task.overdue && task.status !== "done" && "text-danger",
                              )}
                            >
                              <CalendarClock className="h-3 w-3" aria-hidden />
                              Due {task.dueLabel}
                              {task.overdue && task.status !== "done" && " · overdue"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {editable ? (
                          <form action={updateTaskStatusAction} className="flex rounded-lg border border-line bg-surface/70 p-0.5">
                            <input type="hidden" name="id" value={task.id} />
                            {(["todo", "in_progress", "done"] as const).map((status) => {
                              const meta = STATUS_META[status];
                              const active = task.status === status;
                              return (
                                <button
                                  key={status}
                                  type="submit"
                                  name="status"
                                  value={status}
                                  aria-pressed={active}
                                  title={`Mark ${meta.label.toLowerCase()}`}
                                  className={clsx(
                                    "flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium transition",
                                    active
                                      ? status === "done"
                                        ? "bg-success/15 text-success"
                                        : "bg-brand/20 text-brand-soft"
                                      : "text-muted hover:text-ink",
                                  )}
                                >
                                  {active ? (
                                    <Check className="h-3 w-3" aria-hidden />
                                  ) : (
                                    <meta.icon className="h-3 w-3" aria-hidden />
                                  )}
                                  <span className="hidden lg:inline">{meta.label}</span>
                                </button>
                              );
                            })}
                          </form>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2/60 px-2.5 py-1 text-[11px] text-muted">
                            <StatusIcon className="h-3 w-3" aria-hidden />
                            {STATUS_META[task.status].label}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Create panel */}
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPanelOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-task-title"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-line bg-surface shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
                <div>
                  <h2 id="new-task-title" className="text-[15px] font-semibold text-ink">
                    New task
                  </h2>
                  <p className="text-[11.5px] text-muted">
                    Raised by {userName} · {ROLE_BY_ID[userRole].label}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="rounded-lg border border-line bg-surface-2/60 p-1.5 text-muted transition hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form ref={formRef} action={formAction} className="flex-1 space-y-4 overflow-y-auto p-5">
                <div>
                  <label htmlFor="title" className="mb-1.5 block text-[12px] font-medium text-ink/80">
                    Title
                  </label>
                  <input
                    id="title"
                    name="title"
                    required
                    minLength={4}
                    placeholder="What needs to happen?"
                    className="w-full rounded-lg border border-line bg-base/60 px-3 py-2 text-[13px] text-ink placeholder:text-muted/60 focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </div>

                <div>
                  <label htmlFor="description" className="mb-1.5 block text-[12px] font-medium text-ink/80">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={4}
                    placeholder="Context, acceptance criteria, links…"
                    className="w-full resize-none rounded-lg border border-line bg-base/60 px-3 py-2 text-[13px] text-ink placeholder:text-muted/60 focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="priority" className="mb-1.5 block text-[12px] font-medium text-ink/80">
                      Priority
                    </label>
                    <select
                      id="priority"
                      name="priority"
                      defaultValue="medium"
                      className="w-full rounded-lg border border-line bg-base/60 px-2.5 py-2 text-[12.5px] text-ink focus:border-brand/60 focus:outline-none"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="dueDate" className="mb-1.5 block text-[12px] font-medium text-ink/80">
                      Due date
                    </label>
                    <input
                      id="dueDate"
                      name="dueDate"
                      type="date"
                      className="w-full rounded-lg border border-line bg-base/60 px-2.5 py-2 text-[12.5px] text-ink focus:border-brand/60 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="assigneeRole" className="mb-1.5 block text-[12px] font-medium text-ink/80">
                    Assign to team
                  </label>
                  <select
                    id="assigneeRole"
                    name="assigneeRole"
                    defaultValue={userRole}
                    className="w-full rounded-lg border border-line bg-base/60 px-2.5 py-2 text-[12.5px] text-ink focus:border-brand/60 focus:outline-none"
                  >
                    {(Object.keys(ROLE_GROUPS) as (keyof typeof ROLE_GROUPS)[]).map((group) => (
                      <optgroup key={group} label={ROLE_GROUPS[group].label}>
                        {Object.values(ROLE_BY_ID)
                          .filter((role) => role.group === group)
                          .map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.label}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <AnimatePresence initial={false}>
                  {state.error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      role="alert"
                      className="overflow-hidden"
                    >
                      <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-[12px] text-rose-200">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {state.error}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="rounded-lg border border-line/70 bg-surface-2/50 px-3 py-2 text-[11px] text-muted">
                  <span className="font-medium text-ink/80">Window enforced server-side.</span>{" "}
                  {windowMessage}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-brand to-[#5b8cff] px-3 py-2.5 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-70"
                  >
                    {pending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Creating…
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" aria-hidden />
                        Create task
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanelOpen(false)}
                    className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-[12.5px] font-medium text-muted transition hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            role="status"
            aria-live="polite"
            className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-success/30 bg-surface/95 px-4 py-2.5 text-[12.5px] text-success shadow-xl backdrop-blur"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {toast}
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-1 rounded p-0.5 text-muted transition hover:text-ink"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
