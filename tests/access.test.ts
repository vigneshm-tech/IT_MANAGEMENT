import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_BY_ID,
  ROLE_IDS,
  VISIBLE_ROLES,
  isAssignableRole,
  type RoleId,
} from "../lib/roles";
import { can, canAccessModule, visibleModules } from "../lib/access";
import { canSyncRedmineClients } from "../lib/integrations/access";
import { canEditRoles, canReadRoles } from "../lib/roles/access";
import { MODULES } from "../lib/modules";

const ALL_ROLES = [...ROLE_IDS] as RoleId[];
const ENGINEERS = ALL_ROLES.filter((role) => ROLE_BY_ID[role].level === "engineer");
const NON_ENGINEERS = ALL_ROLES.filter((role) => ROLE_BY_ID[role].level !== "engineer");

test("every role sees the shared modules", () => {
  for (const role of ALL_ROLES) {
    for (const moduleId of ["dashboard", "tasks", "tickets", "kb", "clients", "renewals", "approvals", "settings"] as const) {
      assert.equal(
        canAccessModule(role, moduleId),
        true,
        `${role} should see ${moduleId}`,
      );
    }
  }
});

test("servers are limited to IT plus managers, leads and management", () => {
  const expected = new Set([
    "super_admin",
    "it_manager",
    "it_engineer",
    "l2_support_manager",
    "l2_support_lead",
    "implementation_manager",
    "implementation_lead",
    "development_manager",
    "development_lead",
    "testing_manager",
    "testing_lead",
    "management",
  ]);

  for (const role of ALL_ROLES) {
    assert.equal(
      canAccessModule(role, "servers"),
      expected.has(role),
      `servers access for ${role}`,
    );
  }
});

test("engineers outside IT cannot reach servers or patching plans", () => {
  for (const role of ENGINEERS) {
    if (role === "it_engineer") continue;
    assert.equal(canAccessModule(role, "servers"), false, role);
    assert.equal(canAccessModule(role, "patching"), false, role);
  }
});

test("the IT Engineer runs the infrastructure modules", () => {
  assert.equal(canAccessModule("it_engineer", "servers"), true);
  assert.equal(canAccessModule("it_engineer", "patching"), true);
  assert.equal(can("it_engineer", "servers", "edit"), true);
  assert.equal(can("it_engineer", "servers", "admin"), false);
  assert.equal(can("it_manager", "servers", "admin"), true);
});

test("engineers can still view every module they need", () => {
  const engineer = "development_engineer";
  const titles = visibleModules(engineer).map((module) => module.id);
  assert.deepEqual(titles, [
    "dashboard",
    "tasks",
    "tickets",
    "kb",
    "clients",
    "renewals",
    "masters",
    "approvals",
    "settings",
  ]);
});

test("settings admin is reserved for IT Manager and Management", () => {
  for (const role of ALL_ROLES) {
    assert.equal(
      can(role, "settings", "admin"),
      role === "it_manager" || role === "management" || role === "super_admin",
      `settings admin for ${role}`,
    );
  }
});

test("only leadership can approve", () => {
  for (const role of ALL_ROLES) {
    const expected = ROLE_BY_ID[role].level !== "engineer";
    assert.equal(can(role, "approvals", "approve"), expected, `approvals for ${role}`);
  }
});

test("task editing is leadership only, creation is open to everyone", () => {
  for (const role of ALL_ROLES) {
    assert.equal(can(role, "tasks", "create"), true, role);
    assert.equal(
      can(role, "tasks", "edit"),
      ROLE_BY_ID[role].level !== "engineer",
      `task edit for ${role}`,
    );
  }
});

test("task creation window restriction matches the role registry", () => {
  for (const role of ALL_ROLES) {
    const unrestricted = ROLE_BY_ID[role].unrestrictedTaskCreation;
    assert.equal(
      unrestricted,
      ROLE_BY_ID[role].level !== "engineer",
      `window flag for ${role}`,
    );
  }
  assert.equal(ENGINEERS.length, 5);
  assert.equal(NON_ENGINEERS.length, 11);
});

test("the super admin role stays hidden from every catalogue", () => {
  assert.equal(VISIBLE_ROLES.some((role) => role.id === "super_admin"), false);
  assert.equal(ROLE_BY_ID.super_admin.hidden, true);
  assert.equal(isAssignableRole("super_admin"), false);
  assert.equal(isAssignableRole("it_manager"), true);
  assert.equal(isAssignableRole("nonsense"), false);
});

test("only the super admin can open the user directory", () => {
  for (const role of ALL_ROLES) {
    assert.equal(
      canAccessModule(role, "users"),
      role === "super_admin",
      `users module access for ${role}`,
    );
  }
  assert.ok(visibleModules("super_admin").some((module) => module.id === "users"));
  assert.ok(!visibleModules("it_manager").some((module) => module.id === "users"));
});

test("dashboard is available to all and every module declares a view rule", () => {
  assert.equal(MODULES.length, 13);
  for (const module of MODULES) {
    if (module.id === "users") continue; // super-admin only
    assert.equal(
      canAccessModule("management", module.id),
      true,
      `management should see ${module.id}`,
    );
    assert.ok(module.access.view, `${module.id} needs a view rule`);
  }
});

test("the Redmine client scan follows either the tickets or the clients right", () => {
  for (const role of ALL_ROLES) {
    assert.equal(
      canSyncRedmineClients(role),
      can(role, "tickets", "edit") || can(role, "clients", "edit"),
      `${role} should follow tickets-edit or clients-edit`,
    );
  }

  // Not everybody: someone who may only raise tickets cannot run the scan.
  assert.equal(
    ALL_ROLES.some((role) => !canSyncRedmineClients(role)),
    true,
    "at least one role must be refused",
  );
});

test("roles moved to Users & Groups without changing who may change them", () => {
  for (const role of ALL_ROLES) {
    // Editing is the same set as before the move: a Settings administrator.
    assert.equal(
      canEditRoles(role),
      can(role, "settings", "admin"),
      `${role} should keep the role-editing right it had`,
    );
    // Reading follows the directory now, with the same Settings administrator.
    assert.equal(canReadRoles(role), canAccessModule(role, "users") || can(role, "settings", "admin"));
    // Nothing widened: whoever may edit may also read.
    if (canEditRoles(role)) assert.equal(canReadRoles(role), true);
  }

  assert.equal(canReadRoles("super_admin"), true);
  assert.equal(canEditRoles("super_admin"), true);
});
