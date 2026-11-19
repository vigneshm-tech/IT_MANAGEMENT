import { Clock, ListChecks, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { can } from "@/lib/access";
import { ROLE_BY_ID, ROLE_GROUPS } from "@/lib/roles";
import { taskWindowFor } from "@/lib/task-window";
import type { SessionUser } from "@/lib/auth/token";
import type { TaskRecord } from "@/lib/tasks/repository";
import { TaskActions } from "@/components/modules/task-actions";
import { formatDayMonth } from "@/lib/format";

const COLUMNS: Column[] = [
  { key: "title", label: "Task" },
  { key: "id", label: "Ref", type: "mono", width: "96px" },
  { key: "priority", label: "Priority", type: "status", width: "110px" },
  { key: "team", label: "Team", width: "190px" },
  { key: "due", label: "Due", type: "muted", width: "110px" },
  { key: "status", label: "Status", type: "status", align: "right", width: "120px" },
];

type TaskViewId = "requested" | "mine" | "group";

const TASK_VIEWS: { id: TaskViewId; label: string }[] = [
  { id: "requested", label: "Requested Tasks" },
  { id: "mine", label: "Task Assigned To Me" },
  { id: "group", label: "Task Assigned To My Group" },
];

export function TasksView({
  user,
  tasks,
  view = "requested",
}: {
  user: SessionUser;
  tasks: TaskRecord[];
  /** Sub-module selected in the tab strip; unknown values fall back to the queue. */
  view?: string;
}) {
  const window = taskWindowFor(user.role);
  const canEdit = can(user.role, "tasks", "edit");
  const canCreate = window.canCreate;

  const currentView: TaskViewId = TASK_VIEWS.some((tab) => tab.id === view)
    ? (view as TaskViewId)
    : "requested";

  const roleGroup = ROLE_BY_ID[user.role].group;
  const visibleTasks =
    currentView === "mine"
      ? tasks.filter((task) => task.assigneeRole === user.role)
      : currentView === "group"
        ? tasks.filter((task) => ROLE_BY_ID[task.assigneeRole]?.group === roleGroup)
        : tasks;

  const rows = visibleTasks.map((task) => ({
    id: task.id,
    cells: {
      title: task.title,
      id: task.id,
      priority: task.priority,
      team: ROLE_BY_ID[task.assigneeRole]?.label ?? "—",
      due: task.dueDate ? formatDayMonth(task.dueDate) : "—",
      status: task.status,
    },
  }));

  // View · Change status · Edit · Update notes, per task.
  const rowExtras = Object.fromEntries(
    visibleTasks.map((task) => [
      task.id,
      <TaskActions
        key={task.id}
        taskId={task.id}
        canEdit={canEdit}
        canContribute={canEdit || task.assigneeRole === user.role}
      />,
    ]),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Task Management"
        actions={
          canCreate ? (
            <Link
              href="/modules/tasks/new"
              className={buttonClass({ variant: "primary", className: "gap-1.5" })}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New task
            </Link>
          ) : (
            <button
              type="button"
              disabled
              title={`Tasks can be raised from ${window.message}`}
              className={buttonClass({ variant: "secondary", className: "opacity-55" })}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden />
              New task
            </button>
          )
        }
      >
        <div
          role="group"
          aria-label="Task views"
          className="flex flex-wrap items-center gap-1"
        >
          {TASK_VIEWS.map((tab) => {
            const active = tab.id === currentView;
            const href =
              tab.id === "requested" ? "/modules/tasks" : `/modules/tasks?view=${tab.id}`;
            return (
              <Link
                key={tab.id}
                href={href}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors ${
                  active
                    ? "border-gold text-navy"
                    : "border-transparent text-muted hover:text-navy"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </PageHeader>

      {window.restricted && !canCreate && (
        <div className="flex items-start gap-3 rounded-md border border-[#ecd9b6] bg-warning-soft px-4 py-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <div className="text-[12.5px] leading-relaxed text-[#7b5c1d]">
            <span className="font-medium text-[#6a4d12]">Task creation opens at 09:00 IST.</span>{" "}
            You can still pick up and close existing work outside the window.
          </div>
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowExtras={rowExtras}
        searchPlaceholder="Search tasks, teams or references"
        emptyState={
          currentView === "mine" ? (
            <EmptyState
              icon={ListChecks}
              title="Nothing assigned to your role"
              description={`Tasks routed to ${ROLE_BY_ID[user.role].label} will appear here.`}
            />
          ) : currentView === "group" ? (
            <EmptyState
              icon={ListChecks}
              title="Nothing assigned to your group"
              description={`Tasks routed to any ${ROLE_GROUPS[roleGroup].label} role will appear here.`}
            />
          ) : (
            <EmptyState
              icon={ListChecks}
              title="No tasks on the board"
              description="Work raised by any team will show up here with its owner, priority and due date."
              action={
                canCreate ? (
                  <Link
                    href="/modules/tasks/new"
                    className={buttonClass({ variant: "primary", size: "sm" })}
                  >
                    Create the first task
                  </Link>
                ) : undefined
              }
            />
          )
        }
      />
    </div>
  );
}
