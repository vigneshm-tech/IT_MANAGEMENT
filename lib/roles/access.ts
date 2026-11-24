import { canAccessModule, can } from "../access";
import type { RoleId } from "../roles";

/**
 * Who may open the role catalogue, now that it lives in Users & Groups.
 *
 * Roles are about people, so the pages sit with the directory; they grant
 * access to every module, which is why a Settings administrator still reaches
 * them. Both rights are the same set that could read and change roles before the
 * move, so relocating the pages changed nothing about who holds them.
 */
export function canReadRoles(role: RoleId): boolean {
  return canAccessModule(role, "users") || can(role, "settings", "admin");
}

/** Who may change what a role can do — never the same as "may open Settings". */
export function canEditRoles(role: RoleId): boolean {
  return can(role, "users", "admin") || can(role, "settings", "admin");
}
