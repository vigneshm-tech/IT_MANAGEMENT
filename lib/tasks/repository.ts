import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import type { SessionUser } from "../auth/token";
import type { RoleId } from "../roles";
import {
  addTask as addMemoryTask,
  appendTaskNote as appendMemoryTaskNote,
  listTasks as listMemoryTasks,
  updateTask as updateMemoryTask,
  updateTaskStatus as updateMemoryTaskStatus,
  type TaskPriority,
  type TaskStatus,
} from "./store";

export type TaskRecord = {
  id: string;
  title: string;
  description: string;
  /** Append-only working notes; entries are separated by a blank line. */
  notes: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeRole: RoleId;
  createdByName: string;
  createdByRole: RoleId;
  createdAt: string;
  dueDate: string | null;
};

export type NewTaskInput = {
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeRole: RoleId;
  dueDate: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assignee_role: RoleId;
  created_by_name: string | null;
  created_by_role: RoleId;
  created_at: string;
  due_date: string | null;
};

function fromRow(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    notes: row.notes ?? "",
    priority: row.priority,
    status: row.status,
    assigneeRole: row.assignee_role,
    createdByName: row.created_by_name ?? "TaskTornado",
    createdByRole: row.created_by_role,
    createdAt: row.created_at,
    dueDate: row.due_date,
  };
}

function memoryTasks(): TaskRecord[] {
  return listMemoryTasks().map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    notes: task.notes,
    priority: task.priority,
    status: task.status,
    assigneeRole: task.assigneeRole,
    createdByName: task.createdBy.name,
    createdByRole: task.createdBy.role,
    createdAt: task.createdAt,
    dueDate: task.dueDate,
  }));
}

/** Tasks are persisted in Supabase when configured, otherwise in memory. */
export async function listTasks(): Promise<TaskRecord[]> {
  if (!isSupabaseConfigured) return memoryTasks();

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("tasks")
      .select(
        "id, title, description, notes, priority, status, assignee_role, created_by_name, created_by_role, created_at, due_date",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return (data as TaskRow[]).map(fromRow);
  } catch (error) {
    console.error("[tasks] falling back to memory store", error);
    return memoryTasks();
  }
}

export async function createTask(
  user: SessionUser,
  input: NewTaskInput,
): Promise<TaskRecord> {
  if (!isSupabaseConfigured) {
    const task = addMemoryTask({
      title: input.title,
      description: input.description,
      notes: "",
      priority: input.priority,
      status: "todo",
      assigneeRole: input.assigneeRole,
      createdBy: { name: user.name, role: user.role },
      dueDate: input.dueDate,
    });
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      notes: task.notes,
      priority: task.priority,
      status: task.status,
      assigneeRole: task.assigneeRole,
      createdByName: task.createdBy.name,
      createdByRole: task.createdBy.role,
      createdAt: task.createdAt,
      dueDate: task.dueDate,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      description: input.description,
      notes: "",
      priority: input.priority,
      status: "todo",
      assignee_role: input.assigneeRole,
      created_by: user.id,
      created_by_name: user.name,
      created_by_role: user.role,
      due_date: input.dueDate,
    })
    .select(
      "id, title, description, notes, priority, status, assignee_role, created_by_name, created_by_role, created_at, due_date",
    )
    .single();

  if (error || !data) {
    console.error("[tasks] insert failed", error);
    throw new Error("Task could not be saved. Please try again.");
  }

  return fromRow(data as TaskRow);
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<boolean> {
  if (!isSupabaseConfigured) {
    return updateMemoryTaskStatus(id, status) !== null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[tasks] update failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export type TaskEditInput = {
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeRole: RoleId;
  dueDate: string | null;
};

/** Edits the task body, owner and due date. Notes are append-only. */
export async function updateTask(id: string, input: TaskEditInput): Promise<boolean> {
  if (!isSupabaseConfigured) {
    return (
      updateMemoryTask(id, {
        title: input.title,
        description: input.description,
        priority: input.priority,
        assigneeRole: input.assigneeRole,
        dueDate: input.dueDate,
      }) !== null
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: input.title,
      description: input.description,
      priority: input.priority,
      assignee_role: input.assigneeRole,
      due_date: input.dueDate,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[tasks] edit failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Appends a stamped note block; existing notes are never rewritten. */
export async function appendTaskNote(id: string, entry: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    return appendMemoryTaskNote(id, entry) !== null;
  }

  const supabase = await createSupabaseServerClient();
  const { data: current, error: readError } = await supabase
    .from("tasks")
    .select("notes")
    .eq("id", id)
    .maybeSingle<{ notes: string | null }>();

  if (readError) {
    console.error("[tasks] note read failed", readError);
    return false;
  }

  const existing = current?.notes ?? "";
  const { data, error } = await supabase
    .from("tasks")
    .update({ notes: existing ? `${existing}\n\n${entry}` : entry })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[tasks] note write failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
