import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoUser,
  demoEmailTaken,
  demoEmployeeIdTaken,
  findDemoDirectoryUser,
  listDemoDirectory,
  removeDemoUser,
  setDemoUserStatus,
} from "../lib/users/store";

test("the demo directory never lists the hidden super admin", () => {
  const directory = listDemoDirectory();
  assert.ok(directory.length > 0);
  assert.equal(
    directory.some((user) => user.role === "super_admin"),
    false,
  );
});

test("a new account can be added, suspended, reactivated and deleted", () => {
  const email = "preview.new.hire@tasktornado.dev";
  assert.equal(demoEmailTaken(email), false);

  const created = createDemoUser({
    name: "Preview New Hire",
    employeeId: "emp-9001",
    email: email.toUpperCase(),
    title: "IT Engineer",
    role: "it_engineer",
  });

  assert.equal(created.status, "active");
  assert.equal(created.email, email);
  assert.equal(created.employeeId, "EMP-9001");
  assert.equal(demoEmailTaken(email), true);

  assert.equal(setDemoUserStatus(created.id, "suspended"), true);
  assert.equal(findDemoDirectoryUser(created.id)?.status, "suspended");

  assert.equal(setDemoUserStatus(created.id, "active"), true);
  assert.equal(findDemoDirectoryUser(created.id)?.status, "active");

  assert.equal(demoEmployeeIdTaken("emp-9001"), true);

  assert.equal(removeDemoUser(created.id), true);
  assert.equal(findDemoDirectoryUser(created.id), null);
  assert.equal(demoEmailTaken(email), false);
  assert.equal(demoEmployeeIdTaken("emp-9001"), false);
});

test("unknown ids are ignored", () => {
  assert.equal(setDemoUserStatus("u-missing", "suspended"), false);
  assert.equal(removeDemoUser("u-missing"), false);
});
