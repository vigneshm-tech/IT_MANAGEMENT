import type { RoleId } from "./roles";
import { MODULES, MODULE_BY_ID, hasCapability, type Capability, type ModuleDefinition, type ModuleId } from "./modules";

export function can(
  role: RoleId,
  moduleId: ModuleId,
  capability: Capability = "view",
): boolean {
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
