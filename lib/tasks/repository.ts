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
  type PlanStatus,
  type TaskPriority,
  type TaskStatus,
} from "./store";

/** Request details captured on the task form, alongside the schedule fields. */
export type TaskRequestDetails = {
  clientName: string;
  activityType: string;
  requestedByName: string;
  requestedByEmail: string;
  serverDetails: string;
  planStatus: PlanStatus;
  communication: string;
  referenceTicketNo: string;
};

export type TaskRecord = {
  id: string;
  title: string;
  description: string;
  /** Append-only working notes; entries are separated by a blank line. */
  notes: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** Person the work sits with; empty for tasks raised before people were assignable. */
  assigneeId: string;
  assigneeName: string;
  assigneeRole: RoleId;
  createdByName: string;
  createdByRole: RoleId;
  createdAt: string;
  dueDate: string | null;
} & TaskRequestDetails;

export type TaskInput = TaskRequestDetails & {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string;
  assigneeName: string;
  assigneeRole: RoleId;
  dueDate: string | null;
};

export type NewTaskInput = TaskInput;
export type TaskEditInput = TaskInput;

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_role: RoleId;
  created_by_name: string | null;
  created_by_role: RoleId;
  created_at: string;
  due_date: string | null;
  client_name: string | null;
  activity_type: string | null;
  requested_by_name: string | null;
  requested_by_email: string | null;
  server_details: string | null;
  plan_status: PlanStatus | null;
  communication: string | null;
  reference_ticket_no: string | null;
};

const COLUMNS = [
  "id",
  "title",
  "description",
  "notes",
  "priority",
  "status",
  "assignee_id",
  "assignee_name",
  "assignee_role",
  "created_by_name",
  "created_by_role",
  "created_at",
  "due_date",
  "client_name",
  "activity_type",
  "requested_by_name",
  "requested_by_email",
  "server_details",
  "plan_status",
  "communication",
  "reference_ticket_no",
].join(", ");

function requestColumns(input: TaskRequestDetails) {
  return {
    client_name: input.clientName,
    activity_type: input.activityType,
    requested_by_name: input.requestedByName,
    requested_by_email: input.requestedByEmail,
    server_details: input.serverDetails,
    plan_status: input.planStatus,
    communication: input.communication,
    reference_ticket_no: input.referenceTicketNo,
  };
}

function fromRow(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    notes: row.notes ?? "",
    priority: row.priority,
    status: row.status,
    assigneeId: row.assignee_id ?? "",
    assigneeName: row.assignee_name ?? "",
    assigneeRole: row.assignee_role,
    createdByName: row.created_by_name ?? "TaskTornado",
    createdByRole: row.created_by_role,
    createdAt: row.created_at,
    dueDate: row.due_date,
    clientName: row.client_name ?? "",
    activityType: row.activity_type ?? "",
    requestedByName: row.requested_by_name ?? "",
    requestedByEmail: row.requested_by_email ?? "",
    serverDetails: row.server_details ?? "",
    planStatus: row.plan_status ?? "unplanned",
    communication: row.communication ?? "",
    referenceTicketNo: row.reference_ticket_no ?? "",
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
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeName,
    assigneeRole: task.assigneeRole,
    createdByName: task.createdBy.name,
    createdByRole: task.createdBy.role,
    createdAt: task.createdAt,
    dueDate: task.dueDate,
    clientName: task.clientName,
    activityType: task.activityType,
    requestedByName: task.requestedByName,
    requestedByEmail: task.requestedByEmail,
    serverDetails: task.serverDetails,
    planStatus: task.planStatus,
    communication: task.communication,
    referenceTicketNo: task.referenceTicketNo,
  }));
}

/** Tasks are persisted in Supabase when configured, otherwise in memory. */
export async function listTasks(): Promise<TaskRecord[]> {
  if (!isSupabaseConfigured) return memoryTasks();

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("tasks")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return (data as unknown as TaskRow[]).map(fromRow);
  } catch (error) {
    console.error("[tasks] falling back to memory store", error);
    return memoryTasks();
  }
}

export async function getTask(id: string): Promise<TaskRecord | null> {
  return (await listTasks()).find((task) => task.id === id) ?? null;
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
      status: input.status,
      assigneeId: input.assigneeId,
      assigneeName: input.assigneeName,
      assigneeRole: input.assigneeRole,
      createdBy: { name: user.name, role: user.role },
      dueDate: input.dueDate,
      clientName: input.clientName,
      activityType: input.activityType,
      requestedByName: input.requestedByName,
      requestedByEmail: input.requestedByEmail,
      serverDetails: input.serverDetails,
      planStatus: input.planStatus,
      communication: input.communication,
      referenceTicketNo: input.referenceTicketNo,
    });

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      notes: task.notes,
      priority: task.priority,
      status: task.status,
      assigneeId: task.assigneeId,
      assigneeName: task.assigneeName,
      assigneeRole: task.assigneeRole,
      createdByName: task.createdBy.name,
      createdByRole: task.createdBy.role,
      createdAt: task.createdAt,
      dueDate: task.dueDate,
      clientName: task.clientName,
      activityType: task.activityType,
      requestedByName: task.requestedByName,
      requestedByEmail: task.requestedByEmail,
      serverDetails: task.serverDetails,
      planStatus: task.planStatus,
      communication: task.communication,
      referenceTicketNo: task.referenceTicketNo,
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
      status: input.status,
      assignee_id: input.assigneeId || null,
      assignee_name: input.assigneeName,
      assignee_role: input.assigneeRole,
      created_by: user.id,
      created_by_name: user.name,
      created_by_role: user.role,
      due_date: input.dueDate,
      ...requestColumns(input),
    })
    .select(COLUMNS)
    .single();

  if (error || !data) {
    console.error("[tasks] insert failed", error);
    throw new Error("Task could not be saved. Please try again.");
  }

  return fromRow(data as unknown as TaskRow);
}

/** Edits the task body, request details, owner and due date. Notes are append-only. */
export async function updateTask(id: string, input: TaskEditInput): Promise<boolean> {
  if (!isSupabaseConfigured) {
    return (
      updateMemoryTask(id, {
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: input.status,
        assigneeId: input.assigneeId,
        assigneeName: input.assigneeName,
        assigneeRole: input.assigneeRole,
        dueDate: input.dueDate,
        clientName: input.clientName,
        activityType: input.activityType,
        requestedByName: input.requestedByName,
        requestedByEmail: input.requestedByEmail,
        serverDetails: input.serverDetails,
        planStatus: input.planStatus,
        communication: input.communication,
        referenceTicketNo: input.referenceTicketNo,
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
      status: input.status,
      assignee_id: input.assigneeId || null,
      assignee_name: input.assigneeName,
      assignee_role: input.assigneeRole,
      due_date: input.dueDate,
      ...requestColumns(input),
    })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[tasks] edit failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
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
