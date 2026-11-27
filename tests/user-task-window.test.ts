import test from "node:test";
import assert from "node:assert/strict";
import { taskWindowSettingsFor } from "../lib/users/task-window";
import { createDemoUser, removeDemoUser } from "../lib/users/store";
import { clearRoleCatalogue, setRoleCatalogue } from "../lib/roles/snapshot";

const morning = { startMinute: 7 * 60, endMinute: 13 * 60 };

function withWindow(employeeId: string) {
  return createDemoUser({
    name: "Window Tester",
    employeeId,
    email: `${employeeId.toLowerCase()}@tasktornado.dev`,
    title: "L2 Support Engineer",
    role: "l2_support_engineer",
    taskWindow: morning,
  });
}

test("a saved window is resolved for a role that can open Tasks", async () => {
  const created = withWindow("EMP-TW-1");
  try {
    assert.deepEqual(await taskWindowSettingsFor({ id: created.id, role: "l2_support_engineer" }), morning);
    // The directory carries it too, so Users & Groups can show it.
    assert.deepEqual(created.taskWindow, morning);
  } finally {
    removeDemoUser(created.id);
  }
});

test("a role denied the Tasks module keeps no window at all", async () => {
  const created = withWindow("EMP-TW-2");
  // What Roles & access writes when an administrator sets Tasks to Not allowed.
  setRoleCatalogue([{ id: "l2_support_engineer", modules: { tasks: "none" } }]);
  try {
    assert.equal(
      await taskWindowSettingsFor({ id: created.id, role: "l2_support_engineer" }),
      null,
      "a window must never outlive the module it belongs to",
    );
  } finally {
    clearRoleCatalogue();
    removeDemoUser(created.id);
  }
});
