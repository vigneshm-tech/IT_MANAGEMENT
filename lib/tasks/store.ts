import { VISIBLE_ROLES, type RoleId } from "../roles";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export type Task = {
  id: string;
  title: string;
  description: string;
  /** Append-only working notes; entries are separated by a blank line. */
  notes: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeRole: RoleId;
  createdBy: { name: string; role: RoleId };
  createdAt: string;
  dueDate: string | null;
};

/**
 * In-memory task store for the first milestone. It is intentionally isolated
 * behind this module so swapping in Supabase tables (`tasks`, `task_events`)
 * later only touches this file and the server actions.
 */
const globalForTasks = globalThis as unknown as { __taskTornadoTasks?: Task[] };

function seed(): Task[] {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const tasks: Omit<Task, "notes">[] = [
    {
      id: "TSK-1042",
      title: "Patch Windows estate before Friday maintenance window",
      description:
        "12 servers are two patch cycles behind. Stage the update rings and confirm reboot approvals.",
      priority: "high",
      status: "in_progress",
      assigneeRole: "it_engineer",
      createdBy: { name: "Meera Raghavan", role: "it_manager" },
      createdAt: new Date(now - 26 * hour).toISOString(),
      dueDate: new Date(now + 30 * hour).toISOString(),
    },
    {
      id: "TSK-1041",
      title: "Acme Corp — onboarding environment checklist",
      description: "Validate tenant provisioning, SSO mapping and handover documentation.",
      priority: "medium",
      status: "todo",
      assigneeRole: "implementation_engineer",
      createdBy: { name: "Priya Nair", role: "implementation_lead" },
      createdAt: new Date(now - 8 * hour).toISOString(),
      dueDate: new Date(now + 72 * hour).toISOString(),
    },
    {
      id: "TSK-1040",
      title: "Ticket #4821 escalation — payment gateway timeouts",
      description: "Reproduce the timeout, capture logs and confirm with the client contact.",
      priority: "critical",
      status: "todo",
      assigneeRole: "l2_support_engineer",
      createdBy: { name: "Karthik Raman", role: "l2_support_lead" },
      createdAt: new Date(now - 3 * hour).toISOString(),
      dueDate: new Date(now + 6 * hour).toISOString(),
    },
    {
      id: "TSK-1039",
      title: "Regression pack for release 4.8",
      description: "Smoke suite passed; finish the regression pack for billing and reports.",
      priority: "medium",
      status: "in_progress",
      assigneeRole: "testing_engineer",
      createdBy: { name: "Lakshmi Narayan", role: "testing_manager" },
      createdAt: new Date(now - 50 * hour).toISOString(),
      dueDate: new Date(now + 48 * hour).toISOString(),
    },
    {
      id: "TSK-1038",
      title: "Rotate API credentials for the reporting service",
      description: "Rotate keys, update the vault and confirm no downtime during the switch.",
      priority: "high",
      status: "done",
      assigneeRole: "development_engineer",
      createdBy: { name: "Anand Krishnan", role: "development_manager" },
      createdAt: new Date(now - 96 * hour).toISOString(),
      dueDate: null,
    },
  ];

  return tasks.map((task) => ({ ...task, notes: "" }));
}

export function listTasks(): Task[] {
  if (!globalForTasks.__taskTornadoTasks) {
    globalForTasks.__taskTornadoTasks = seed();
  }
  return globalForTasks.__taskTornadoTasks;
}

let counter = 1050;

export function addTask(input: Omit<Task, "id" | "createdAt">): Task {
  const tasks = listTasks();
  const task: Task = {
    ...input,
    id: `TSK-${counter++}`,
    createdAt: new Date().toISOString(),
  };
  tasks.unshift(task);
  return task;
}

export type TaskPatch = Partial<
  Pick<Task, "title" | "description" | "priority" | "assigneeRole" | "dueDate">
>;

export function updateTask(id: string, patch: TaskPatch): Task | null {
  const task = listTasks().find((item) => item.id === id);
  if (!task) return null;
  Object.assign(task, patch);
  return task;
}

export function appendTaskNote(id: string, entry: string): Task | null {
  const task = listTasks().find((item) => item.id === id);
  if (!task) return null;
  task.notes = task.notes ? `${task.notes}\n\n${entry}` : entry;
  return task;
}

export function updateTaskStatus(id: string, status: TaskStatus): Task | null {
  const task = listTasks().find((item) => item.id === id);
  if (!task) return null;
  task.status = status;
  return task;
}

export function assigneeOptions(): { value: RoleId; label: string; group: string }[] {
  return VISIBLE_ROLES.map((role) => ({
    value: role.id,
    label: role.label,
    group: role.group,
  }));
}
