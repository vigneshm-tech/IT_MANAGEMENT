import { ROLES } from "../roles";
import type { StoredRole } from "./types";

/**
 * Workspace-defined roles for previews and local runs, where there is no
 * Supabase to write to.
 *
 * The built-ins are seeded from the catalogue so the Settings → Roles screen
 * looks the same with or without a database; only the module levels a person
 * changes live here, which mirrors the `access_role_modules` table exactly.
 */
const globalForRoles = globalThis as unknown as {
  __taskTornadoRoles?: Map<string, StoredRole>;
};

function seed(): Map<string, StoredRole> {
  return new Map(
    ROLES.map((role) => [
      role.id,
      {
        id: role.id,
        label: role.label,
        description: role.description,
        group: role.group,
        level: role.level,
        accent: role.accent,
        hidden: role.hidden === true,
        builtin: true,
        unrestrictedTaskCreation: role.unrestrictedTaskCreation,
        modules: {},
        updatedAt: null,
      } satisfies StoredRole,
    ]),
  );
}

function store(): Map<string, StoredRole> {
  if (!globalForRoles.__taskTornadoRoles) {
    globalForRoles.__taskTornadoRoles = seed();
  }
  return globalForRoles.__taskTornadoRoles;
}

export function listMemoryRoles(): StoredRole[] {
  return [...store().values()];
}

export function readMemoryRole(id: string): StoredRole | null {
  return store().get(id) ?? null;
}

export function writeMemoryRole(role: StoredRole): void {
  store().set(role.id, role);
}

export function removeMemoryRole(id: string): void {
  store().delete(id);
}

/** Demo accounts never hold a workspace-defined role, so nobody is a member. */
export function memoryRoleMembers(id: string): number {
  return 0;
}
