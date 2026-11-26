import { isSupabaseConfigured } from "../config";
import type { ModuleId } from "../modules";
import { ROLES, rememberKnownRoles, roleOf, type Role } from "../roles";
import {
  countLevels,
  emptyLevels,
  levelsFromRules,
  mergeLevels,
  type AccessLevel,
  type LevelCounts,
  type ModuleLevels,
} from "./permissions";
import { countAllRoleMembers, readRoles, removeRole, writeRole, writeRoleModules } from "./repository";
import { countPages, type PageOverrides } from "./pages";
import { clearRoleLabels, setRoleLabels } from "./labels";
import { clearRoleCatalogue, roleOverrides, setRoleCatalogue } from "./snapshot";
import type { StoredRole } from "./types";

/**
 * The live role catalogue.
 *
 * Reading it costs one query pair, and access checks happen on every page, so
 * the result is held briefly and refreshed explicitly whenever somebody saves a
 * role. A permission change therefore takes effect on the next request in the
 * instance that made it, and within ten seconds everywhere else — including for
 * somebody who signs in, whose catalogue is loaded fresh at the door.
 */

export type RoleDefinition = Role & {
  builtin: boolean;
  hidden: boolean;
  unrestrictedTaskCreation: boolean;
  /** Every module, with saved levels laid over the built-in rules. */
  modules: ModuleLevels;
  /** Only what an administrator has saved; empty means "still on defaults". */
  explicit: Partial<ModuleLevels>;
  /** Pages closed (or reopened) inside a module; an absent page follows its module. */
  pages: PageOverrides;
  counts: LevelCounts;
  pageCounts: { open: number; total: number };
  members: number;
  updatedAt: string | null;
};

export type RoleRegistry = {
  roles: RoleDefinition[];
  byId: Record<string, RoleDefinition>;
  source: "database" | "memory" | "built-in";
  loadedAt: number;
  error: string | null;
};

const TTL_MS = 10_000;

const globalForRegistry = globalThis as unknown as {
  __taskTornadoRoleRegistry?: { registry: RoleRegistry; expiresAt: number };
  __taskTornadoRoleLoad?: Promise<RoleRegistry>;
};

function decorate(
  stored: StoredRole,
  members: number,
): RoleDefinition {
  const base = roleOf(stored.id);
  const fallback = stored.builtin ? levelsFromRules(stored.id) : emptyLevels();
  const modules = mergeLevels(fallback, stored.modules);

  return {
    ...base,
    // The stored record wins for everything an administrator can rename.
    label: stored.label || base.label,
    shortLabel: stored.label || base.shortLabel,
    description: stored.description || base.description,
    group: stored.group,
    level: stored.level,
    accent: stored.accent,
    badgeClass: base.badgeClass,
    unrestrictedTaskCreation: stored.unrestrictedTaskCreation,
    builtin: stored.builtin,
    hidden: stored.hidden,
    modules,
    explicit: stored.modules,
    pages: stored.pages ?? {},
    counts: countLevels(modules),
    pageCounts: countPages(modules, stored.pages ?? {}),
    members,
    updatedAt: stored.updatedAt,
  };
}

/** Built from code alone — what an install looks like before the first read. */
function builtinRegistry(): RoleRegistry {
  const roles = ROLES.map<RoleDefinition>((role) => {
    const modules = levelsFromRules(role.id);
    return {
      ...role,
      builtin: true,
      hidden: role.hidden === true,
      unrestrictedTaskCreation: role.unrestrictedTaskCreation,
      modules,
      pages: {},
      pageCounts: countPages(modules, {}),
      explicit: {},
      counts: countLevels(modules),
      members: 0,
      updatedAt: null,
    };
  });

  return {
    roles,
    byId: Object.fromEntries(roles.map((role) => [role.id, role])),
    source: "built-in",
    loadedAt: 0,
    error: null,
  };
}

async function load(): Promise<RoleRegistry> {
  const [{ roles: stored, error }, members] = await Promise.all([
    readRoles(),
    countAllRoleMembers(),
  ]);

  if (error || stored.length === 0) {
    // A failed read must not lock the workspace out of its own modules: fall
    // back to the compiled rules and try again on the next request.
    const registry = builtinRegistry();
    return { ...registry, error: error ?? null };
  }

  const roles = stored.map((role) => decorate(role, members[role.id] ?? 0));

  // Super admin is a platform guarantee, not a checkbox: it always keeps the
  // user directory, even if somebody deletes those rows by hand.
  const superAdmin = roles.find((role) => role.id === "super_admin");
  if (superAdmin) {
    superAdmin.explicit = { ...superAdmin.explicit, users: "write", settings: "write" };
    superAdmin.modules = mergeLevels(superAdmin.modules, {
      users: "write",
      settings: "write",
    });
    superAdmin.counts = countLevels(superAdmin.modules);
  }

  rememberKnownRoles(roles.map((role) => role.id));
  setRoleLabels(roles.map((role) => ({ id: role.id, label: role.label })));
  setRoleCatalogue(
    roles.map((role) => ({ id: role.id, modules: role.explicit, pages: role.pages })),
  );

  return {
    roles,
    byId: Object.fromEntries(roles.map((role) => [role.id, role])),
    source: isSupabaseConfigured ? "database" : "memory",
    loadedAt: Date.now(),
    error: null,
  };
}

/** Load (or reuse) the catalogue. Call before rendering anything that checks access. */
export async function ensureRoleRegistry(force = false): Promise<RoleRegistry> {
  const cached = globalForRegistry.__taskTornadoRoleRegistry;
  if (!force && cached && cached.expiresAt > Date.now()) return cached.registry;

  if (!globalForRegistry.__taskTornadoRoleLoad) {
    globalForRegistry.__taskTornadoRoleLoad = load()
      .then((registry) => {
        globalForRegistry.__taskTornadoRoleRegistry = {
          registry,
          // A failed read retries sooner than a good one.
          expiresAt: Date.now() + (registry.source === "built-in" ? 5_000 : TTL_MS),
        };
        return registry;
      })
      .finally(() => {
        globalForRegistry.__taskTornadoRoleLoad = undefined;
      });
  }

  return globalForRegistry.__taskTornadoRoleLoad;
}

/** The catalogue as last read. Synchronous, for code that runs after `requireUser`. */
export function getRoleRegistry(): RoleRegistry {
  return globalForRegistry.__taskTornadoRoleRegistry?.registry ?? builtinRegistry();
}

export function invalidateRoleRegistry(): void {
  globalForRegistry.__taskTornadoRoleRegistry = undefined;
  globalForRegistry.__taskTornadoRoleLoad = undefined;
  clearRoleCatalogue();
  clearRoleLabels();
}

export function listRoleDefinitions(): RoleDefinition[] {
  return getRoleRegistry().roles;
}

export function findRoleDefinition(id: string): RoleDefinition | null {
  return getRoleRegistry().byId[id] ?? null;
}

/** Roles a person may be given: everything except the hidden platform account. */
export function assignableRoleDefinitions(): RoleDefinition[] {
  return listRoleDefinitions().filter((role) => role.id !== "super_admin" && !role.hidden);
}

/* ----------------------------------------------------------------- writing */

export type RoleMetaInput = {
  id: string;
  label: string;
  description: string;
  group: StoredRole["group"];
  level: StoredRole["level"];
  accent: string;
  hidden: boolean;
  unrestrictedTaskCreation: boolean;
};

export async function persistRoleMeta(input: RoleMetaInput): Promise<string | null> {
  const current = findRoleDefinition(input.id);
  const error = await writeRole({
    id: input.id,
    label: input.label,
    description: input.description,
    group: input.group,
    level: input.level,
    accent: input.accent,
    hidden: input.hidden,
    builtin: current?.builtin ?? false,
    pages: current?.pages ?? {},
    unrestrictedTaskCreation: input.unrestrictedTaskCreation,
    modules: current ? { ...current.explicit } : {},
    updatedAt: new Date().toISOString(),
  });
  if (!error) invalidateRoleRegistry();
  return error;
}

export async function persistRoleLevels(
  roleId: string,
  levels: ModuleLevels,
  pages: PageOverrides = {},
): Promise<string | null> {
  const error = await writeRoleModules(roleId, levels, pages);
  if (!error) invalidateRoleRegistry();
  return error;
}

export async function deleteRoleDefinition(roleId: string): Promise<string | null> {
  const role = findRoleDefinition(roleId);
  if (!role) return "That role no longer exists.";
  if (role.builtin) return "Built-in roles cannot be deleted — set its modules to Not allowed instead.";
  if (role.members > 0) {
    return `${role.members} ${role.members === 1 ? "account holds" : "accounts hold"} this role. Reassign them first.`;
  }
  const error = await removeRole(roleId);
  if (!error) invalidateRoleRegistry();
  return error;
}

/** The saved levels for a role, for the grid's initial state. */
export function savedLevels(roleId: string): Partial<Record<ModuleId, AccessLevel>> {
  return roleOverrides(roleId);
}
