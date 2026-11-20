import type { RoleId } from "../roles";

/**
 * The Action1 credential is organisation-wide, so only the roles that run the
 * servers module may write it: super admin plus the two IT roles.
 */
const ACTION1_MANAGERS: RoleId[] = ["super_admin", "it_manager", "it_engineer"];

export function canManageAction1(role: RoleId): boolean {
  return ACTION1_MANAGERS.includes(role);
}
