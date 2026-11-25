import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_IDS,
  customRole,
  isAssignableRole,
  isRoleId,
  rememberKnownRoles,
  roleLabelFromId,
  roleOf,
  roleSlug,
} from "../lib/roles";
import {
  ACCESS_LEVELS,
  countLevels,
  emptyLevels,
  isAccessLevel,
  levelAllows,
  levelFromRule,
  levelsFromRows,
  levelsFromRules,
  mergeLevels,
} from "../lib/roles/permissions";
import { MODULE_BY_ID, MODULES, type Capability } from "../lib/modules";
import { can, canAccessModule, visibleModules } from "../lib/access";
import { clearRoleCatalogue, setRoleCatalogue } from "../lib/roles/snapshot";
import { buildGridGroups, summariseLevels } from "../lib/roles/grid";
import { getRoleRegistry } from "../lib/roles/registry";

const CAPABILITIES: Capability[] = ["view", "create", "edit", "approve", "admin"];

/* ------------------------------------------------------------- the levels */

test("three levels, and each answers the five capabilities predictably", () => {
  assert.deepEqual(
    CAPABILITIES.map((capability) => levelAllows("none", capability)),
    [false, false, false, false, false],
  );
  assert.deepEqual(
    CAPABILITIES.map((capability) => levelAllows("read", capability)),
    [true, false, false, false, false],
  );
  assert.deepEqual(
    CAPABILITIES.map((capability) => levelAllows("write", capability)),
    [true, true, true, true, true],
  );
});

test("only the three known words are levels", () => {
  for (const level of ACCESS_LEVELS) assert.equal(isAccessLevel(level), true);
  for (const junk of ["", "Read", "admin", "allow", null, 3, undefined]) {
    assert.equal(isAccessLevel(junk), false);
  }
});

test("an untouched role is described by the rules already in lib/modules.ts", () => {
  // The platform role bypasses every enumerated list.
  for (const module of MODULES) {
    assert.equal(levelFromRule(module.access, "super_admin"), "write", module.id);
  }

  // A development engineer cannot see infrastructure at all.
  assert.equal(levelsFromRules("development_engineer").servers, "none");
  assert.equal(levelsFromRules("development_engineer").patching, "none");
  assert.equal(levelsFromRules("development_engineer").users, "none");
  assert.equal(levelsFromRules("development_engineer").tasks, "write");
  assert.equal(levelsFromRules("development_engineer").settings, "write");

  // Management reads infrastructure it does not administer, and never sees the
  // user directory.
  assert.equal(levelsFromRules("management").users, "none");
  assert.equal(levelsFromRules("management").iis, "read");
  assert.equal(levelsFromRules("management").settings, "write");

  assert.deepEqual(Object.keys(levelsFromRules("it_manager")).sort(), MODULES.map((m) => m.id).sort());
});

test("a workspace role starts with nothing at all", () => {
  const levels = emptyLevels();
  assert.equal(Object.keys(levels).length, MODULES.length);
  assert.ok(Object.values(levels).every((level) => level === "none"));

  // The compiled rules say "everyone can view tasks"; that must not leak into a
  // role this workspace invented.
  assert.deepEqual(levelsFromRules("floor_lead"), emptyLevels());
});

test("saved rows override the rules without discarding the rest", () => {
  const base = levelsFromRules("development_engineer");
  const merged = mergeLevels(base, { servers: "read", tasks: "read" });
  assert.equal(merged.servers, "read");
  assert.equal(merged.tasks, "read");
  assert.equal(merged.tickets, base.tickets, "an untouched module keeps its rule");
});

test("rows from the database ignore nonsense instead of inventing modules", () => {
  const levels = levelsFromRows([
    { moduleId: "iis", access: "write" },
    { moduleId: "servers", access: "read" },
    { moduleId: "quidditch", access: "write" },
    { moduleId: "tasks", access: "admin" },
  ]);
  assert.deepEqual(levels, { iis: "write", servers: "read" });
});

test("the counts add up to every module", () => {
  const counts = countLevels({ ...emptyLevels(), iis: "write", servers: "read", tasks: "write" });
  assert.equal(counts.total, MODULES.length);
  assert.equal(counts.writable, 2);
  assert.equal(counts.readonly, 1);
  assert.equal(counts.hidden, MODULES.length - 3);
  assert.match(summariseLevels(counts), /^14 modules · 2 writable · 1 read only · 11 hidden$/);
});

/* -------------------------------------------------------------- role keys */

test("a role name becomes a key that survives a URL and a column", () => {
  assert.equal(roleSlug("Warehouse Supervisor"), "warehouse_supervisor");
  assert.equal(roleSlug("  Floor lead (warehouse) "), "floor_lead_warehouse");
  assert.equal(roleSlug("Développement — nuit"), "developpement_nuit");
  assert.equal(roleSlug("A"), "a");
  assert.equal(roleSlug("!!!"), "");
  assert.ok(roleSlug("x".repeat(80)).length <= 40);
  assert.equal(roleSlug("trailing___"), "trailing");
});

test("the label comes back out of the key when nobody told us better", () => {
  assert.equal(roleLabelFromId("warehouse_supervisor"), "Warehouse Supervisor");
  assert.equal(roleLabelFromId("night_shift"), "Night Shift");
  assert.equal(roleLabelFromId(""), "Unassigned");
});

test("a role we have no row for still renders", () => {
  const role = customRole("warehouse_supervisor");
  assert.equal(role.label, "Warehouse Supervisor");
  assert.equal(role.group, "custom");
  assert.equal(roleOf("warehouse_supervisor").label, "Warehouse Supervisor");
  assert.equal(roleOf("it_manager").label, "IT Manager", "built-ins keep their real name");
  assert.equal(roleOf(null).label, "Unassigned");
});

test("a workspace role is known only once the catalogue says so", () => {
  assert.equal(isRoleId("warehouse_supervisor"), false);
  rememberKnownRoles(["it_manager", "warehouse_supervisor"]);
  assert.equal(isRoleId("warehouse_supervisor"), true);
  assert.equal(isRoleId("it_manager"), true);
  assert.equal(isAssignableRole("warehouse_supervisor"), true);
  assert.equal(isAssignableRole("super_admin"), false, "the platform account is never assignable");
  assert.equal(isAssignableRole("not a role"), false);
});

/* ---------------------------------------------------- what the app answers */

test("Not allowed hides a module from the navigation and closes its page", () => {
  // A role that could reach the IIS register by default...
  assert.equal(canAccessModule("it_engineer", "iis"), true);
  assert.equal(can("it_engineer", "iis", "edit"), true);

  // ...until an administrator says no.
  setRoleCatalogue([{ id: "it_engineer", modules: { iis: "none", servers: "read" } }]);

  assert.equal(canAccessModule("it_engineer", "iis"), false);
  assert.equal(can("it_engineer", "iis", "edit"), false);
  assert.equal(canAccessModule("it_engineer", "servers"), true);

  const visible = visibleModules("it_engineer").map((module) => module.id);
  assert.ok(!visible.includes("iis"), "a hidden module has no menu entry");
  assert.ok(visible.includes("servers"));

  // Modules nobody touched keep their old rules.
  assert.equal(canAccessModule("it_engineer", "tickets"), true);
  assert.equal(can("it_engineer", "servers", "admin"), false, "read only cannot administer");

  clearRoleCatalogue();
  assert.equal(canAccessModule("it_engineer", "iis"), true, "clearing restores the defaults");
});

test("Read only opens the module and refuses every change", () => {
  setRoleCatalogue([{ id: "it_manager", modules: { iis: "read" } }]);

  assert.equal(canAccessModule("it_manager", "iis"), true);
  for (const capability of ["create", "edit", "approve", "admin"] as Capability[]) {
    assert.equal(can("it_manager", "iis", capability), false, capability);
  }

  clearRoleCatalogue();
  assert.equal(can("it_manager", "iis", "edit"), true);
});

test("Write grants every capability, including the ones a person rarely thinks about", () => {
  setRoleCatalogue([{ id: "development_engineer", modules: { iis: "write" } }]);

  for (const capability of CAPABILITIES) {
    assert.equal(can("development_engineer", "iis", capability), true, capability);
  }

  clearRoleCatalogue();
  assert.equal(canAccessModule("development_engineer", "iis"), false);
});

test("a workspace role with no saved levels cannot open anything", () => {
  rememberKnownRoles(["floor_lead"]);
  setRoleCatalogue([{ id: "floor_lead", modules: { tasks: "read", tickets: "write" } }]);

  assert.deepEqual(
    visibleModules("floor_lead").map((module) => module.id),
    ["tasks", "tickets"],
  );
  assert.equal(can("floor_lead", "tickets", "edit"), true);
  assert.equal(can("floor_lead", "tasks", "edit"), false);
  assert.equal(canAccessModule("floor_lead", "dashboard"), false);

  clearRoleCatalogue();
});

test("the permission grid is grouped the way the navigation is", () => {
  const registry = getRoleRegistry();
  const role = registry.roles.find((entry) => entry.id === "it_manager");
  assert.ok(role);

  const groups = buildGridGroups(role);
  assert.ok(groups.length > 1);
  assert.equal(
    groups.reduce((total, group) => total + group.modules.length, 0),
    MODULES.length,
  );
  for (const group of groups) {
    for (const module of group.modules) {
      assert.equal(MODULE_BY_ID[module.id].title, module.title);
      assert.ok(ACCESS_LEVELS.includes(module.level));
    }
  }
});

test("every built-in role is in the catalogue with a usable definition", () => {
  const registry = getRoleRegistry();
  for (const id of ROLE_IDS) {
    const role = registry.roles.find((entry) => entry.id === id);
    assert.ok(role, `${id} is missing from the catalogue`);
    assert.ok(role.label.length > 0);
    assert.equal(Object.keys(role.modules).length, MODULES.length);
  }
});
