import { Clock, ListChecks, Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RecordDialog, type FieldDef } from "@/components/ui/record-dialog";
import { DataTable, type Column, type RowAction } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { can } from "@/lib/access";
import { ROLE_BY_ID, VISIBLE_ROLES, type RoleId } from "@/lib/roles";
import { taskWindowFor } from "@/lib/task-window";
import type { SessionUser } from "@/lib/auth/token";
import type { TaskRecord } from "@/lib/tasks/repository";
import { createTaskAction, updateTaskStatusAction } from "@/app/(app)/modules/tasks/actions";
import { formatDayMonth } from "@/lib/format";

const COLUMNS: Column[] = [
  { key: "title", label: "Task" },
  { key: "id", label: "Ref", type: "mono", width: "96px" },
  { key: "priority", label: "Priority", type: "status", width: "110px" },
  { key: "team", label: "Team", width: "190px" },
  { key: "due", label: "Due", type: "muted", width: "110px" },
  { key: "status", label: "Status", type: "status", align: "right", width: "120px" },
];

function fields(): FieldDef[] {
  return [
    { name: "title", label: "Task title", type: "text", required: true, span: 2, placeholder: "What needs to happen?" },
    { name: "description", label: "Description", type: "textarea", span: 2, placeholder: "Context, links and acceptance criteria" },
    {
      name: "assigneeRole",
      label: "Assign to",
      type: "select",
      required: true,
      options: VISIBLE_ROLES.map((role) => ({ value: role.id, label: role.label })),
      defaultValue: "l2_support_engineer",
    },
    {
      name: "priority",
      label: "Priority",
      type: "select",
      required: true,
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
        { value: "critical", label: "Critical" },
      ],
      defaultValue: "medium",
    },
    { name: "dueDate", label: "Due date", type: "date" },
  ];
}

function nextAction(status: TaskRecord["status"]): RowAction {
  if (status === "done") return { label: "Reopen", value: "todo" };
  if (status === "in_progress") return { label: "Complete", value: "done" };
  return { label: "Start", value: "in_progress" };
}

export function TasksView({
  user,
  tasks,
  autoOpen = false,
}: {
  user: SessionUser;
  tasks: TaskRecord[];
  autoOpen?: boolean;
}) {
  const window = taskWindowFor(user.role);
  const canEdit = can(user.role, "tasks", "edit");
  const canCreate = window.canCreate;

  const rows = tasks.map((task) => {
    const mayUpdate = canEdit || task.assigneeRole === user.role;
    return {
      id: task.id,
      cells: {
        title: task.title,
        id: task.id,
        priority: task.priority,
        team: ROLE_BY_ID[task.assigneeRole]?.label ?? "—",
        due: task.dueDate ? formatDayMonth(task.dueDate) : "—",
        status: task.status,
      },
      actions: mayUpdate ? [nextAction(task.status)] : [],
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Task Management"
        actions={
          canCreate ? (
            <RecordDialog
              title="New task"
              triggerLabel="New task"
              submitLabel="Create task"
              fields={fields()}
              action={createTaskAction}
              defaultOpen={autoOpen}
              size="lg"
            />
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
      />

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
        rowAction={updateTaskStatusAction}
        searchPlaceholder="Search tasks, teams or references"
        emptyState={
          <EmptyState
            icon={ListChecks}
            title="No tasks on the board"
            description="Work raised by any team will show up here with its owner, priority and due date."
            action={
              canCreate ? (
                <RecordDialog
                  title="New task"
                  description="Assigned work appears on the board immediately."
                  triggerLabel="Create the first task"
                  submitLabel="Create task"
                  fields={fields()}
                  action={createTaskAction}
                  size="lg"
                />
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}
