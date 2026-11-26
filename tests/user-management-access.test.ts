import test from "node:test";
import assert from "node:assert/strict";
import { can } from "../lib/access";
import { canManageDirectory, canManageGroups } from "../lib/roles/access";
import { clearRoleCatalogue, setRoleCatalogue } from "../lib/roles/snapshot";

/*
 * Users & Groups used to be run by a literal `role === "super_admin"` in the
 * page and in five server actions. That literal outlived its truth: once an
 * administrator could grant the module through the role grid, a role holding
 * Write was handed a directory it could not change — every control either missing
 * or silently refused. These tests pin the rule that replaced it.
 */

test("an untouched install keeps the directory to the super admin", () => {
  assert.equal(canManageDirectory("super_admin"), true);
  assert.equal(canManageGroups("super_admin"), true);

  for (const role of ["it_manager", "it_engineer", "l2_support_manager", "management"] as const) {
    assert.equal(canManageDirectory(role), false, role);
    assert.equal(canManageGroups(role), false, role);
  }
});

test("Write on Users & Groups can run the directory and its groups", () => {
  setRoleCatalogue([{ id: "it_manager", modules: { users: "write" } }]);

  assert.equal(canManageDirectory("it_manager"), true);
  assert.equal(canManageGroups("it_manager"), true);

  clearRoleCatalogue();
  assert.equal(canManageDirectory("it_manager"), false, "clearing restores the defaults");
});

test("Read only on Users & Groups can look but not touch", () => {
  setRoleCatalogue([{ id: "l2_support_lead", modules: { users: "read" } }]);

  assert.equal(can("l2_support_lead", "users", "view"), true);
  assert.equal(canManageDirectory("l2_support_lead"), false);
  assert.equal(canManageGroups("l2_support_lead"), false);

  clearRoleCatalogue();
});

test("a closed page withholds that page's control, not the other one", () => {
  setRoleCatalogue([
    {
      id: "it_manager",
      modules: { users: "write" },
      pages: { "users/groups": "none" },
    },
  ]);

  assert.equal(canManageDirectory("it_manager"), true, "the directory page is still open");
  assert.equal(canManageGroups("it_manager"), false, "the groups page was closed");

  clearRoleCatalogue();

  setRoleCatalogue([
    {
      id: "it_manager",
      modules: { users: "write" },
      pages: { "users/directory": "none" },
    },
  ]);

  assert.equal(canManageDirectory("it_manager"), false);
  assert.equal(canManageGroups("it_manager"), true);

  clearRoleCatalogue();
});

test("not allowed on Users & Groups answers no to both", () => {
  setRoleCatalogue([{ id: "it_engineer", modules: { users: "none" } }]);

  assert.equal(canManageDirectory("it_engineer"), false);
  assert.equal(canManageGroups("it_engineer"), false);

  clearRoleCatalogue();
});

test("Settings administration does not hand out the directory", () => {
  // A Settings administrator may reach Roles & access, which is a different right.
  assert.equal(can("it_manager", "settings", "admin"), true);
  assert.equal(canManageDirectory("it_manager"), false);
  assert.equal(canManageGroups("it_manager"), false);
});
