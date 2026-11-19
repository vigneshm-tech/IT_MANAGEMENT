"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { isRoleId, ROLE_BY_ID, type RoleId } from "@/lib/roles";
import { assertCanCreateTask } from "@/lib/task-window";
import {
  addTask,
  updateTaskStatus,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/store";

export type CreateTaskState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];
const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

export async function createTaskAction(
  _previous: CreateTaskState,
  formData: FormData,
): Promise<CreateTaskState> {
  const user = await requireUser();

  if (!can(user.role, "tasks", "create")) {
    return { error: "Your role cannot create tasks." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority") ?? "medium") as TaskPriority;
  const assignee = String(formData.get("assigneeRole") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");

  if (title.length < 4) {
    return { error: "Give the task a title of at least 4 characters." };
  }
  if (!isRoleId(assignee)) {
    return { error: "Choose a team to assign the task to." };
  }
  if (!PRIORITIES.includes(priority)) {
    return { error: "Choose a valid priority." };
  }

  // Authoritative window check — the client clock is never trusted.
  try {
    assertCanCreateTask(user.role);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Task creation is outside the allowed window.",
    };
  }

  const task = addTask({
    title,
    description,
    priority,
    status: "todo",
    assigneeRole: assignee,
    createdBy: { name: user.name, role: user.role },
    dueDate: dueDate ? new Date(`${dueDate}T18:00:00`).toISOString() : null,
  });

  revalidatePath("/modules/tasks");
  revalidatePath("/modules/dashboard");

  return {
    ok: true,
    message: `${task.id} created and assigned to ${ROLE_BY_ID[assignee as RoleId].label}.`,
  };
}

export async function updateTaskStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as TaskStatus;

  if (!STATUSES.includes(status)) return;

  const { listTasks } = await import("@/lib/tasks/store");
  const task = listTasks().find((item) => item.id === id);
  if (!task) return;

  const canManageAny = can(user.role, "tasks", "edit");
  const isOwnTeam = task.assigneeRole === user.role;
  if (!canManageAny && !isOwnTeam) return;

  updateTaskStatus(id, status);
  revalidatePath("/modules/tasks");
}
