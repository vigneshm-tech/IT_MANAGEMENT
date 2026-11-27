"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { isRoleId, type RoleId } from "@/lib/roles";
import { assertCanCreateTask } from "@/lib/task-window";
import { taskWindowSettingsFor } from "@/lib/users/task-window";
import {
  appendTaskNote,
  createTask,
  listTasks,
  setTaskStatus,
  updateTask,
} from "@/lib/tasks/repository";
import { PLAN_STATUS_OPTIONS, TASK_STATUS_LABEL, TASK_STATUS_VALUES } from "@/lib/tasks/options";
import type { PlanStatus, TaskPriority, TaskStatus } from "@/lib/tasks/store";
import { formatDateTime } from "@/lib/format";
import {
  listActiveActivityTypes,
  listAssignableUsers,
  listModuleCustomFields,
  readCustomFieldForm,
  saveCustomFieldValues,
} from "@/lib/records/repository";
import { TASK_ACTIVITY_MODULE } from "@/lib/activity-types";
import type { FormState } from "@/lib/forms";

export type CreateTaskState = FormState;

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];
const STATUSES: TaskStatus[] = TASK_STATUS_VALUES;
const PLAN_STATUSES: PlanStatus[] = PLAN_STATUS_OPTIONS.map((option) => option.value);

type ParsedTask = {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string;
  assigneeName: string;
  assigneeRole: RoleId;
  dueDate: string | null;
  clientName: string;
  activityType: string;
  serverDetails: string;
  planStatus: PlanStatus;
  communication: string;
  referenceTicketNo: string;
};

/**
 * The assignee is a person, so the role is taken from the directory, never from
 * the submitted body. `listAssignableUsers()` is the same list the picker draws
 * from (active staff, names only).
 */
async function parseTaskForm(
  formData: FormData,
  activityTypes: string[],
): Promise<ParsedTask | { error: string }> {
  const title = String(formData.get("title") ?? "").trim();
  const assigneeId = String(formData.get("assigneeId") ?? "").trim();
  const status = String(formData.get("status") ?? "") as TaskStatus;
  const priority = String(formData.get("priority") ?? "medium") as TaskPriority;
  const activityType = String(formData.get("activityType") ?? "").trim();
  const planStatus = String(formData.get("planStatus") ?? "unplanned") as PlanStatus;
  const dueDate = String(formData.get("dueDate") ?? "");

  if (title.length < 4) {
    return { error: "Give the task a name of at least 4 characters." };
  }
  if (!assigneeId) {
    return { error: "Choose who the task is assigned to." };
  }
  if (!STATUSES.includes(status)) {
    return { error: "Choose a status." };
  }
  if (!PRIORITIES.includes(priority)) {
    return { error: "Choose a valid priority." };
  }
  if (!activityTypes.includes(activityType)) {
    return { error: "Choose an activity type from Masters → Activity types." };
  }
  if (!PLAN_STATUSES.includes(planStatus)) {
    return { error: "Choose whether the work is planned or unplanned." };
  }

  const assignee = (await listAssignableUsers()).find((person) => person.id === assigneeId);
  if (!assignee || !isRoleId(assignee.role) || assignee.role === "super_admin") {
    return { error: "That person is not available for assignment." };
  }

  return {
    title,
    description: String(formData.get("description") ?? "").trim(),
    priority,
    status,
    assigneeId: assignee.id,
    assigneeName: assignee.name,
    assigneeRole: assignee.role,
    dueDate: dueDate ? new Date(`${dueDate}T18:00:00+05:30`).toISOString() : null,
    clientName: String(formData.get("clientName") ?? "").trim(),
    activityType,
    serverDetails: String(formData.get("serverDetails") ?? "").trim(),
    planStatus,
    communication: String(formData.get("communication") ?? "").trim(),
    referenceTicketNo: String(formData.get("referenceTicketNo") ?? "").trim(),
  };
}

/**
 * Creates a task from the full-page form. The requester name and email are
 * taken from the session, never from the submitted body.
 */
export async function createTaskAction(
  _previous: CreateTaskState,
  formData: FormData,
): Promise<CreateTaskState> {
  const user = await requireUser();

  if (!can(user.role, "tasks", "create")) {
    return { error: "Your role cannot create tasks." };
  }

  const activityTypes = await listActiveActivityTypes(TASK_ACTIVITY_MODULE);
  if (activityTypes.length === 0) {
    return { error: "No activity types are configured — add one under Masters → Activity types." };
  }

  const parsed = await parseTaskForm(formData, activityTypes);
  if ("error" in parsed) return parsed;

  // Authoritative window check — the client clock is never trusted.
  try {
    assertCanCreateTask(user.role, new Date(), await taskWindowSettingsFor(user));
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Task creation is outside the allowed window.",
    };
  }

  let createdId: string;
  try {
    const task = await createTask(user, {
      ...parsed,
      requestedByName: user.name,
      requestedByEmail: user.email,
    });
    createdId = task.id;
    const fields = await listModuleCustomFields(TASK_ACTIVITY_MODULE);
    await saveCustomFieldValues(task.id, readCustomFieldForm(formData, fields));
  } catch (error) {
    console.error("[tasks] create failed", error);
    return { error: "The task could not be saved. Please try again." };
  }

  revalidatePath("/modules/tasks");
  revalidatePath("/modules/dashboard");
  redirect(`/modules/tasks/${createdId}?created=1`);
}

export async function updateTaskAction(
  _previous: CreateTaskState,
  formData: FormData,
): Promise<CreateTaskState> {
  const user = await requireUser();

  if (!can(user.role, "tasks", "edit")) {
    return { error: "Your role cannot edit tasks." };
  }

  const id = String(formData.get("id") ?? "");
  const parsed = await parseTaskForm(
    formData,
    await listActiveActivityTypes(TASK_ACTIVITY_MODULE),
  );
  if ("error" in parsed) return parsed;

  const existing = (await listTasks()).find((item) => item.id === id);
  if (!existing) return { error: "That task no longer exists." };

  // The requester is historical — it is never re-read from the form body.
  const saved = await updateTask(id, {
    ...parsed,
    requestedByName: existing.requestedByName || existing.createdByName,
    requestedByEmail: existing.requestedByEmail,
  });
  if (!saved) return { error: "The task could not be updated. Please try again." };
  const fields = await listModuleCustomFields(TASK_ACTIVITY_MODULE);
  await saveCustomFieldValues(id, readCustomFieldForm(formData, fields));

  revalidatePath("/modules/tasks");
  revalidatePath(`/modules/tasks/${id}`);
  revalidatePath("/modules/dashboard");
  redirect(`/modules/tasks/${id}?updated=1`);
}

/** The assigned person, their team's leadership, or the owning role. */
function mayWorkOn(
  user: { id: string; role: RoleId },
  task: { assigneeId: string; assigneeRole: string },
): boolean {
  return (
    can(user.role, "tasks", "edit") ||
    task.assigneeId === user.id ||
    task.assigneeRole === user.role
  );
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
  if (!mayWorkOn(user, task)) {
    return { error: "Your role cannot move this task." };
  }

  const saved = await setTaskStatus(id, status);
  if (!saved) return { error: "The status could not be saved. Please try again." };

  revalidatePath("/modules/tasks");
  revalidatePath(`/modules/tasks/${id}`);
  revalidatePath("/modules/dashboard");
  return { ok: true, message: `Moved to ${TASK_STATUS_LABEL[status]}.` };
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
  if (!mayWorkOn(user, task)) {
    return { error: "Your role cannot add notes to this task." };
  }

  const entry = `${formatDateTime(new Date())} · ${user.name}\n${note}`;
  const saved = await appendTaskNote(id, entry);
  if (!saved) return { error: "The note could not be saved. Please try again." };

  revalidatePath("/modules/tasks");
  revalidatePath(`/modules/tasks/${id}`);
  return { ok: true, message: "Note added." };
}
