import test from "node:test";
import assert from "node:assert/strict";
import {
  isOpenStatus,
  peopleOptions,
  TASK_STATUS_LABEL,
  TASK_STATUS_OPTIONS,
  TASK_STATUS_VALUES,
  taskStatusHint,
} from "../lib/tasks/options";

test("the workflow has the six states, in order", () => {
  assert.deepEqual(TASK_STATUS_VALUES, [
    "todo",
    "in_progress",
    "completed",
    "feedback",
    "failed",
    "reopen",
  ]);
  assert.deepEqual(
    TASK_STATUS_OPTIONS.map((option) => option.label),
    ["To Do", "In Progress", "Completed", "Feedback", "Failed", "Reopen"],
  );
});

test("every state carries its meaning", () => {
  for (const option of TASK_STATUS_OPTIONS) {
    assert.ok(option.hint.length > 5, `${option.value} needs a meaning`);
    assert.equal(taskStatusHint(option.value), option.hint);
    assert.equal(TASK_STATUS_LABEL[option.value], option.label);
  }
  assert.equal(taskStatusHint("in_progress"), "Work has started.");
});

test("only completed is closed; feedback, failed and reopen stay open", () => {
  assert.equal(isOpenStatus("completed"), false);
  assert.equal(isOpenStatus("todo"), true);
  assert.equal(isOpenStatus("in_progress"), true);
  assert.equal(isOpenStatus("feedback"), true);
  assert.equal(isOpenStatus("failed"), true);
  assert.equal(isOpenStatus("reopen"), true);
});

test("people options carry the access level as the second line", () => {
  const options = peopleOptions([
    { id: "u-1", name: "Arun Prakash", role: "it_engineer" },
    { id: "u-2", name: "Nobody", role: null },
  ]);

  assert.deepEqual(options[0], { value: "u-1", label: "Arun Prakash", hint: "IT Engineer" });
  assert.deepEqual(options[1], { value: "u-2", label: "Nobody", hint: "" });
});
