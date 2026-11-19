"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { isAssignableRole, ROLE_BY_ID } from "@/lib/roles";
import { assertCanCreateTask } from "@/lib/task-window";
import { createTask, listTasks, setTaskStatus } from "@/lib/tasks/repository";
import type { TaskPriority, TaskStatus } from "@/lib/tasks/store";

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
  if (!isAssignableRole(assignee)) {
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

  try {
    const task = await createTask(user, {
      title,
      description,
      priority,
      assigneeRole: assignee,
      dueDate: dueDate ? new Date(`${dueDate}T18:00:00+05:30`).toISOString() : null,
    });

    revalidatePath("/modules/tasks");
    revalidatePath("/modules/dashboard");

    return {
      ok: true,
      message: `${task.id} created and assigned to ${ROLE_BY_ID[assignee].label}.`,
    };
  } catch (error) {
    console.error("[tasks] create failed", error);
    return { error: "The task could not be saved. Please try again." };
  }
}

export async function updateTaskStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as TaskStatus;

  if (!STATUSES.includes(status)) return;

  const task = (await listTasks()).find((item) => item.id === id);
  if (!task) return;

  const canManageAny = can(user.role, "tasks", "edit");
  const isOwnTeam = task.assigneeRole === user.role;
  if (!canManageAny && !isOwnTeam) return;

  await setTaskStatus(id, status);
  revalidatePath("/modules/tasks");
}
