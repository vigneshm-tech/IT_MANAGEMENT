import test from "node:test";
import assert from "node:assert/strict";
import { resolveRole } from "../lib/auth/role";
import { canAccessModule } from "../lib/access";
import { rememberKnownRoles } from "../lib/roles";
import { clearRoleCatalogue, setRoleCatalogue } from "../lib/roles/snapshot";

/*
 * A session cookie names the role somebody held when they signed in. Roles and
 * their module permissions change afterwards, and a login can now last a month,
 * so the stored profile has to be able to correct the cookie — otherwise an
 * administrator grants a module and the person it was granted to never sees it.
 */

test("a role changed after sign-in takes effect on the next request", () => {
  assert.equal(resolveRole("it_manager", "l2_support_manager"), "l2_support_manager");
  assert.equal(resolveRole("it_engineer", "super_admin"), "super_admin");
});

test("the usual case leaves the cookie alone", () => {
  assert.equal(resolveRole("it_manager", "it_manager"), "it_manager");
  assert.equal(resolveRole("it_manager", "IT_MANAGER"), "it_manager", "ids are exact");
});

test("a failed read, an empty profile or an unknown key keeps the cookie", () => {
  assert.equal(resolveRole("it_manager", null), "it_manager");
  assert.equal(resolveRole("it_manager", undefined), "it_manager");
  assert.equal(resolveRole("it_manager", ""), "it_manager");
  assert.equal(resolveRole("it_manager", "not_a_role"), "it_manager");
});

test("the corrected role decides what the person can open", () => {
  // Signed in as an IT Manager, since demoted and the module closed for him.
  setRoleCatalogue([{ id: "l2_support_manager", modules: { iis: "none" } }]);

  const role = resolveRole("it_manager", "l2_support_manager");
  assert.equal(canAccessModule(role, "iis"), false);

  clearRoleCatalogue();
});

test("a workspace role the catalogue knows is accepted", () => {
  // Reading the catalogue is what teaches `isRoleId` about a workspace role.
  rememberKnownRoles(["floor_lead"]);
  setRoleCatalogue([{ id: "floor_lead", modules: { tasks: "read" } }]);
  assert.equal(resolveRole("it_engineer", "floor_lead"), "floor_lead");
  clearRoleCatalogue();
});
