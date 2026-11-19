"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { isAssignableRole, ROLE_BY_ID } from "@/lib/roles";
import { assertCanCreateTask } from "@/lib/task-window";
import {
  appendTaskNote,
  createTask,
  listTasks,
  setTaskStatus,
  updateTask,
} from "@/lib/tasks/repository";
import { formatDateTime } from "@/lib/format";
import type { FormState } from "@/lib/forms";
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

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

/** Assignee team or leadership — the same rule the table has always used. */
function mayWorkOn(role: Parameters<typeof can>[0], taskAssignee: string): boolean {
  return can(role, "tasks", "edit") || taskAssignee === role;
}

export async function changeTaskStatusAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as TaskStatus;

  if (!STATUSES.includes(status)) {
    return { error: "Choose a valid status." };
  }

  const task = (await listTasks()).find((item) => item.id === id);
  if (!task) return { error: "That task no longer exists." };
  if (!mayWorkOn(user.role, task.assigneeRole)) {
    return { error: "Your role cannot move this task." };
  }

  const saved = await setTaskStatus(id, status);
  if (!saved) return { error: "The status could not be saved. Please try again." };

  revalidatePath("/modules/tasks");
  revalidatePath("/modules/dashboard");
  return { ok: true, message: `${id} moved to ${STATUS_LABEL[status]}.` };
}

export async function updateTaskAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  if (!can(user.role, "tasks", "edit")) {
    return { error: "Your role cannot edit tasks." };
  }

  const id = String(formData.get("id") ?? "");
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

  const saved = await updateTask(id, {
    title,
    description,
    priority,
    assigneeRole: assignee,
    dueDate: dueDate ? new Date(`${dueDate}T18:00:00+05:30`).toISOString() : null,
  });

  if (!saved) return { error: "The task could not be updated. Please try again." };

  revalidatePath("/modules/tasks");
  revalidatePath("/modules/dashboard");
  return { ok: true, message: `${id} updated.` };
}

export async function updateTaskNoteAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (note.length < 3) {
    return { error: "Write a note of at least 3 characters." };
  }
  if (note.length > 2000) {
    return { error: "Keep the note under 2000 characters." };
  }

  const task = (await listTasks()).find((item) => item.id === id);
  if (!task) return { error: "That task no longer exists." };
  if (!mayWorkOn(user.role, task.assigneeRole)) {
    return { error: "Your role cannot add notes to this task." };
  }

  const entry = `${formatDateTime(new Date())} · ${user.name}\n${note}`;
  const saved = await appendTaskNote(id, entry);
  if (!saved) return { error: "The note could not be saved. Please try again." };

  revalidatePath("/modules/tasks");
  return { ok: true, message: "Note added." };
}
