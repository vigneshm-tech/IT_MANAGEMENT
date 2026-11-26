import { can, canAccessPage } from "../access";
import type { RoleId } from "../roles";

/**
 * Roles & access is a page inside Users & Groups, and answers to it.
 *
 * It used to be a Settings screen, so "may administer Settings" was kept as a
 * second door in when the pages moved to where the people are. That door is
 * what made a closed page still open: an IT Manager holding Settings as Write
 * reached the catalogue with Users & Groups → Roles set to Not allowed, because
 * the module answer was never asked. There is one answer now — the page's own
 * grant — and it is the same one the tab and the navigation read.
 *
 * Super admin keeps it, not as an exception here but because its Users & Groups
 * module is forced open when the catalogue loads.
 */
export function canReadRoles(role: RoleId): boolean {
  return canAccessPage(role, "users", "roles");
}

/**
 * Who may change what a role can do.
 *
 * Reading and writing are two separate grants, so this asks for both: Write on
 * Users & Groups (the level that means "may change things here") and the page
 * itself, which has to be open for the button to mean anything.
 */
export function canEditRoles(role: RoleId): boolean {
  return can(role, "users", "admin") && canAccessPage(role, "users", "roles");
}

/**
 * Who may change the directory itself: add an account, suspend one, delete one.
 *
 * Write on the module — never a literal `role === "super_admin"`, which is what
 * this used to be and which handed a granted role a screen full of controls the
 * server then refused. The page has to be open too: a role given only the
 * groups page gets groups, not accounts.
 */
export function canManageDirectory(role: RoleId): boolean {
  return can(role, "users", "admin") && canAccessPage(role, "users", "directory");
}

/** Who may change access groups and their members. Same rule, other page. */
export function canManageGroups(role: RoleId): boolean {
  return can(role, "users", "admin") && canAccessPage(role, "users", "groups");
}
