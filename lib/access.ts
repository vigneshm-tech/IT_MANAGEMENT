import { isBuiltinRole, type RoleId } from "./roles";
import { MODULES, MODULE_BY_ID, hasCapability, type Capability, type ModuleDefinition, type ModuleId } from "./modules";
import { levelAllows } from "./roles/permissions";
import { roleAccessFor, rolePageFor } from "./roles/snapshot";
import { allowedPageIds, pageKey, subPagesFor } from "./roles/pages";

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

/**
 * Whether one page inside a module is reachable.
 *
 * The module is the gate: a role that cannot see a module cannot reach any page
 * in it. Inside a module that is open, an administrator may close individual
 * pages (Settings → Email & alerts for everyone but IT, say). Pages follow the
 * module's permission — read-only stays read-only.
 */
export function canAccessPage(role: RoleId, moduleId: ModuleId, pageId: string): boolean {
  if (!canAccessModule(role, moduleId)) return false;
  return rolePageFor(role, moduleId, pageId) !== "none";
}

/** The pages of a module this role can open — what a tab strip should show. */
export function visiblePageIds(role: RoleId, moduleId: ModuleId): string[] {
  if (!canAccessModule(role, moduleId)) return [];
  return allowedPageIds(moduleId, "open", pagesFor(role, moduleId));
}

/** Only the overrides this role actually carries, so the tab strip can apply them. */
function pagesFor(role: RoleId, moduleId: ModuleId) {
  return Object.fromEntries(
    subPagesFor(moduleId)
      .map((page) => [pageKey(moduleId, page.id), rolePageFor(role, moduleId, page.id)] as const)
      .filter(([, value]) => value !== undefined),
  );
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
