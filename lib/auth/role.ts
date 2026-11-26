import { isRoleId, type RoleId } from "../roles";

/**
 * Which role a signed-in person is actually working with.
 *
 * The cookie records how somebody signed in; the stored profile is the truth.
 * When the two disagree the profile wins, so an Access level changed in
 * Users & Groups applies on the next request rather than whenever the person
 * next signs out — with a login timeout of up to a month, that could be a month.
 *
 * A failed or empty read keeps the cookie: losing the workspace because one
 * query failed would be worse than a stale role for thirty seconds, and an
 * unrecognised key is not a role anybody can hold.
 */
export function resolveRole(
  cookieRole: RoleId,
  storedRole: string | null | undefined,
): RoleId {
  if (!storedRole || storedRole === cookieRole) return cookieRole;
  return isRoleId(storedRole) ? (storedRole as RoleId) : cookieRole;
}
