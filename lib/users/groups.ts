import type { RoleId } from "../roles";

/** One person inside a group. */
export type UserGroupMember = {
  id: string;
  name: string;
  email: string;
  role: RoleId | null;
};

/** A named collection of employees. */
export type UserGroup = {
  id: string;
  name: string;
  description: string;
  createdAt: string | null;
  members: UserGroupMember[];
};

export const GROUP_NAME_MAX = 60;
export const GROUP_DESCRIPTION_MAX = 160;

/** Trim and collapse inner runs of whitespace. */
export function normalizeGroupName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateGroupName(name: string): string | null {
  if (name.length < 2) return "Enter a group name.";
  if (name.length > GROUP_NAME_MAX) {
    return `Keep the group name under ${GROUP_NAME_MAX} characters.`;
  }
  return null;
}

/** Name collisions are case- and whitespace-insensitive. */
export function groupNameTaken(
  groups: Pick<UserGroup, "id" | "name">[],
  name: string,
  exceptId?: string,
): boolean {
  const candidate = normalizeGroupName(name).toLowerCase();
  return groups.some(
    (group) => group.id !== exceptId && normalizeGroupName(group.name).toLowerCase() === candidate,
  );
}

export function memberLabel(group: Pick<UserGroup, "members">): string {
  const count = group.members.length;
  if (count === 0) return "No members";
  return count === 1 ? "1 member" : `${count} members`;
}

/** People in the directory who are not in the group yet, A→Z. */
export function candidatesFor(
  group: Pick<UserGroup, "members">,
  people: { id: string; name: string }[],
): { id: string; name: string }[] {
  const taken = new Set(group.members.map((member) => member.id));
  return people
    .filter((person) => !taken.has(person.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}
