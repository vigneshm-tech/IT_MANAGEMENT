import test from "node:test";
import assert from "node:assert/strict";
import {
  addTask,
  appendTaskNote,
  listTasks,
  updateTask,
  updateTaskStatus,
} from "../lib/tasks/store";

function seedTask(title: string) {
  return addTask({
    title,
    description: "Created by the task mutation test.",
    notes: "",
    priority: "medium",
    status: "todo",
    assigneeRole: "it_engineer",
    createdBy: { name: "Test Runner", role: "it_manager" },
    dueDate: null,
    clientName: "Acme",
    activityType: "Patching",
    requestedByName: "Test Runner",
    requestedByEmail: "runner@tasktornado.dev",
    serverDetails: "srv-01",
    planStatus: "planned",
    communication: "Email",
    referenceTicketNo: "4821",
  });
}

test("a new task starts without notes", () => {
  const task = seedTask("Starts clean without notes");
  assert.equal(task.notes, "");
  assert.equal(listTasks().find((item) => item.id === task.id)?.notes, "");
});

test("editing rewrites the body but leaves notes untouched", () => {
  const task = seedTask("Editable task body");
  appendTaskNote(task.id, "First note");

  const updated = updateTask(task.id, {
    title: "Edited task body",
    description: "New description",
    priority: "high",
    assigneeRole: "l2_support_engineer",
    dueDate: null,
  });

  assert.equal(updated?.title, "Edited task body");
  assert.equal(updated?.priority, "high");
  assert.equal(updated?.assigneeRole, "l2_support_engineer");
  assert.equal(updated?.notes, "First note");
});

test("notes append instead of overwriting", () => {
  const task = seedTask("Note appending");
  appendTaskNote(task.id, "Alpha");
  appendTaskNote(task.id, "Beta");

  assert.equal(
    listTasks().find((item) => item.id === task.id)?.notes,
    "Alpha\n\nBeta",
  );
});

test("status moves independently of notes", () => {
  const task = seedTask("Status movement");
  appendTaskNote(task.id, "Progress note");
  updateTaskStatus(task.id, "in_progress");

  const stored = listTasks().find((item) => item.id === task.id);
  assert.equal(stored?.status, "in_progress");
  assert.equal(stored?.notes, "Progress note");
});

test("unknown ids are refused", () => {
  assert.equal(updateTask("TSK-DOES-NOT-EXIST", { title: "Nowhere" }), null);
  assert.equal(appendTaskNote("TSK-DOES-NOT-EXIST", "Nowhere"), null);
  assert.equal(updateTaskStatus("TSK-DOES-NOT-EXIST", "done"), null);
});
