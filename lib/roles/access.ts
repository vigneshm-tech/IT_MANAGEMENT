import { canAccessModule, can, canAccessPage } from "../access";
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
  // Settings administration is its own route to the catalogue; otherwise the
  // page has to be granted inside Users & Groups.
  if (can(role, "settings", "admin")) return true;
  return canAccessPage(role, "users", "roles");
}

/** Who may change what a role can do — never the same as "may open Settings". */
export function canEditRoles(role: RoleId): boolean {
  return can(role, "users", "admin") || can(role, "settings", "admin");
}

/**
 * Who may change the directory itself: add an account, suspend one, delete one.
 *
 * This used to be a literal `role === "super_admin"`. Once an administrator can
 * grant Users & Groups through the role grid, that literal is a trap: the screen
 * hands out buttons that the server then refuses, and a role holding Write sees
 * a directory it can never change. Write on the module is the answer, and the
 * directory page has to be open — a role that was given only the groups page
 * gets groups, not accounts.
 */
export function canManageDirectory(role: RoleId): boolean {
  return can(role, "users", "admin") && canAccessPage(role, "users", "directory");
}

/** Who may change access groups and their members. Same rule, other page. */
export function canManageGroups(role: RoleId): boolean {
  return can(role, "users", "admin") && canAccessPage(role, "users", "groups");
}
