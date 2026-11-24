import { isBuiltinRole, type RoleId } from "./roles";
import { MODULES, MODULE_BY_ID, hasCapability, type Capability, type ModuleDefinition, type ModuleId } from "./modules";
import { levelAllows } from "./roles/permissions";
import { roleAccessFor } from "./roles/snapshot";

/**
 * Whether a role may do something inside a module.
 *
 * Three levels decide it now (Users & Groups → Roles): a module set to *Not allowed*
 * answers no to everything, *Read only* answers yes to looking and no to
 * changing, *Write* answers yes throughout. A role an administrator has never
 * saved keeps the rules compiled into `lib/modules.ts`, so an untouched install
 * behaves exactly as it did before roles were editable.
 */
export function can(
  role: RoleId,
  moduleId: ModuleId,
  capability: Capability = "view",
): boolean {
  const level = roleAccessFor(role, moduleId);
  if (level) return levelAllows(level, capability);

  // A workspace-defined role is not in any rule in `lib/modules.ts`, so falling
  // back to those rules would hand it every "all" module. It gets exactly what
  // an administrator granted, and nothing until then.
  if (!isBuiltinRole(role)) return false;

  return hasCapability(MODULE_BY_ID[moduleId].access, capability, role);
}

export function canAccessModule(role: RoleId, moduleId: ModuleId): boolean {
  return can(role, moduleId, "view");
}

export function visibleModules(role: RoleId): ModuleDefinition[] {
  return MODULES.filter((m) => can(role, m.id, "view"));
}

export type ModuleAccess = Record<Capability, boolean>;
export type ModuleAccessMap = Record<ModuleId, ModuleAccess>;

const CAPABILITIES: Capability[] = ["view", "create", "edit", "approve", "admin"];

export function accessMap(role: RoleId): ModuleAccessMap {
  return Object.fromEntries(
    MODULES.map((m) => [
      m.id,
      Object.fromEntries(
        CAPABILITIES.map((capability) => [capability, can(role, m.id, capability)]),
      ) as ModuleAccess,
    ]),
  ) as ModuleAccessMap;
}
