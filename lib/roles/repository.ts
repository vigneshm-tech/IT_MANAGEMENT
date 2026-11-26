import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseServiceKey, supabaseUrl } from "../config";
import type { ModuleId } from "../modules";
import { createSupabaseServerClient } from "../supabase/server";
import { levelsFromRows, type AccessLevel } from "./permissions";
import { sanitisePageOverrides, type PageOverrides } from "./pages";
import type { RoleGroup, RoleLevel } from "../roles";
import {
  listMemoryRoles,
  memoryRoleMembers,
  readMemoryRole,
  removeMemoryRole,
  writeMemoryRole,
} from "./store";
import type { StoredRole } from "./types";

/**
 * Where role definitions live.
 *
 * Supabase keeps them in `access_roles` and `access_role_modules`; a preview
 * without a database keeps the same shape in process memory. Both answer the
 * same questions, so the registry and the Settings screens never branch on
 * which one is behind them.
 */

type RoleRow = {
  id: string;
  label: string;
  description: string | null;
  group_key: string;
  level: string;
  accent: string | null;
  hidden: boolean | null;
  builtin: boolean | null;
  unrestricted_task_creation: boolean | null;
  pages: unknown;
  updated_at: string | null;
};

type ModuleRow = { role_id: string; module_id: string; access: string };

/**
 * The role catalogue is workspace configuration, not one person's data.
 *
 * It is read for every navigation render and written by an administrator, and
 * the server key is the only way to guarantee both regardless of whether the
 * request carries a Supabase session. Callers are still responsible for the
 * `can(role, "settings", "admin")` check — this is a storage decision, not an
 * authorisation one.
 */
async function roleClient() {
  if (supabaseServiceKey) {
    return createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return createSupabaseServerClient();
}

const GROUPS: RoleGroup[] = [
  "platform",
  "it",
  "l2_support",
  "implementation",
  "development",
  "testing",
  "management",
  "custom",
];

const LEVELS: RoleLevel[] = ["manager", "lead", "engineer", "executive"];

function asGroup(value: string): RoleGroup {
  return GROUPS.includes(value as RoleGroup) ? (value as RoleGroup) : "custom";
}

function asLevel(value: string): RoleLevel {
  return LEVELS.includes(value as RoleLevel) ? (value as RoleLevel) : "engineer";
}

function mapRole(
  row: RoleRow,
  modules: Partial<Record<ModuleId, AccessLevel>>,
): StoredRole {
  return {
    id: row.id,
    label: row.label,
    description: row.description ?? "",
    group: asGroup(row.group_key),
    level: asLevel(row.level),
    accent: row.accent || "#94a3b8",
    hidden: row.hidden === true,
    builtin: row.builtin === true,
    unrestrictedTaskCreation: row.unrestricted_task_creation === true,
    modules,
    pages: sanitisePageOverrides(row.pages),
    updatedAt: row.updated_at,
  };
}

export type RolesResult = { roles: StoredRole[]; error: string | null };

export async function readRoles(): Promise<RolesResult> {
  if (!isSupabaseConfigured) {
    return { roles: listMemoryRoles(), error: null };
  }

  try {
    const supabase = await roleClient();
    const [roles, modules] = await Promise.all([
      supabase
        .from("access_roles")
        .select(
          "id, label, description, group_key, level, accent, hidden, builtin, unrestricted_task_creation, pages, updated_at",
        )
        .order("label", { ascending: true }),
      supabase.from("access_role_modules").select("role_id, module_id, access"),
    ]);

    if (roles.error) {
      console.error("[roles] catalogue read failed", roles.error);
      return { roles: [], error: "Roles could not be loaded." };
    }
    if (modules.error) {
      console.error("[roles] module levels read failed", modules.error);
      return { roles: [], error: "Roles could not be loaded." };
    }

    const byRole = new Map<string, { moduleId: string; access: string }[]>();
    for (const row of (modules.data ?? []) as ModuleRow[]) {
      const list = byRole.get(row.role_id) ?? [];
      list.push({ moduleId: row.module_id, access: row.access });
      byRole.set(row.role_id, list);
    }

    return {
      roles: ((roles.data ?? []) as RoleRow[]).map((row) =>
        mapRole(row, levelsFromRows(byRole.get(row.id) ?? [])),
      ),
      error: null,
    };
  } catch (error) {
    console.error("[roles] catalogue read threw", error);
    return { roles: [], error: "Roles could not be loaded." };
  }
}

/** Create or update the badge half of a role (everything except its levels). */
export async function writeRole(role: StoredRole): Promise<string | null> {
  if (!isSupabaseConfigured) {
    writeMemoryRole(role);
    return null;
  }

  try {
    const supabase = await roleClient();
    const { error } = await supabase.from("access_roles").upsert(
      {
        id: role.id,
        label: role.label,
        description: role.description,
        group_key: role.group,
        level: role.level,
        accent: role.accent,
        hidden: role.hidden,
        builtin: role.builtin,
        unrestricted_task_creation: role.unrestrictedTaskCreation,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) {
      console.error("[roles] write failed", error);
      return "The role could not be saved.";
    }
    return null;
  } catch (error) {
    console.error("[roles] write threw", error);
    return "The role could not be saved.";
  }
}

/**
 * Replace a role's module levels.
 *
 * Delete-then-insert rather than a diff: the grid always submits every module,
 * so the written set is the complete truth and an omitted row is meant to be
 * gone, not left behind.
 */
export async function writeRoleModules(
  roleId: string,
  levels: Partial<Record<ModuleId, AccessLevel>>,
  pages: PageOverrides = {},
): Promise<string | null> {
  const entries = Object.entries(levels) as [ModuleId, AccessLevel][];
  const pageOverrides = sanitisePageOverrides(pages);

  if (!isSupabaseConfigured) {
    const current = readMemoryRole(roleId);
    if (!current) return "That role no longer exists.";
    writeMemoryRole({
      ...current,
      modules: Object.fromEntries(entries),
      pages: pageOverrides,
      updatedAt: new Date().toISOString(),
    });
    return null;
  }

  try {
    const supabase = await roleClient();

    // The page overrides ride on the role row: a handful of keys, and a second
    // table would be a second thing to keep in step.
    const pageWrite = await supabase
      .from("access_roles")
      .update({ pages: pageOverrides })
      .eq("id", roleId);
    if (pageWrite.error) {
      console.error("[roles] page overrides write failed", pageWrite.error);
      return "The page access could not be saved.";
    }

    const cleared = await supabase.from("access_role_modules").delete().eq("role_id", roleId);
    if (cleared.error) {
      console.error("[roles] clearing module levels failed", cleared.error);
      return "The permissions could not be saved.";
    }

    if (entries.length === 0) return null;

    const { error } = await supabase.from("access_role_modules").insert(
      entries.map(([moduleId, access]) => ({ role_id: roleId, module_id: moduleId, access })),
    );
    if (error) {
      console.error("[roles] writing module levels failed", error);
      return "The permissions could not be saved.";
    }
    return null;
  } catch (error) {
    console.error("[roles] writing module levels threw", error);
    return "The permissions could not be saved.";
  }
}

export async function removeRole(roleId: string): Promise<string | null> {
  if (!isSupabaseConfigured) {
    removeMemoryRole(roleId);
    return null;
  }

  try {
    const supabase = await roleClient();
    const { error } = await supabase.from("access_roles").delete().eq("id", roleId);
    if (error) {
      console.error("[roles] delete failed", error);
      return "The role could not be deleted. Accounts may still hold it.";
    }
    return null;
  } catch (error) {
    console.error("[roles] delete threw", error);
    return "The role could not be deleted. Accounts may still hold it.";
  }
}

/** How many accounts hold this role — a role in use must not be deleted. */
export async function countRoleMembers(roleId: string): Promise<number> {
  if (!isSupabaseConfigured) return memoryRoleMembers(roleId);

  try {
    const supabase = await roleClient();
    const { count, error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", roleId);
    if (error) {
      console.error("[roles] member count failed", error);
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    console.error("[roles] member count threw", error);
    return 0;
  }
}

/** Members per role in one query, for the catalogue screen. */
export async function countAllRoleMembers(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured) return {};

  try {
    const supabase = await roleClient();
    const { data, error } = await supabase.from("profiles").select("role");
    if (error) {
      console.error("[roles] member counts failed", error);
      return {};
    }
    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as { role: string | null }[]) {
      if (row.role) counts[row.role] = (counts[row.role] ?? 0) + 1;
    }
    return counts;
  } catch (error) {
    console.error("[roles] member counts threw", error);
    return {};
  }
}

/**
 * Teach the database that this role key exists.
 *
 * Task and record tables store roles as the `app_role` enum. A workspace that
 * invents "warehouse_supervisor" has to add the value before anyone can hold
 * the role or own a ticket with it. The function is idempotent, so calling it
 * for an existing key is harmless.
 */
export async function extendRoleEnum(roleId: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const supabase = await roleClient();
    const { error } = await supabase.rpc("admin_add_role_key", { p_role: roleId });
    if (error) {
      console.error("[roles] enum extension failed", error);
      return "The role key could not be registered with the database.";
    }
    return null;
  } catch (error) {
    console.error("[roles] enum extension threw", error);
    return "The role key could not be registered with the database.";
  }
}
