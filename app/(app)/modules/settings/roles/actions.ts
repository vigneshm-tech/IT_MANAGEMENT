"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import { MODULES } from "@/lib/modules";
import { isRoleId, roleSlug, type RoleGroup, type RoleLevel } from "@/lib/roles";
import { isAccessLevel, type ModuleLevels } from "@/lib/roles/permissions";
import {
  deleteRoleDefinition,
  findRoleDefinition,
  persistRoleLevels,
  persistRoleMeta,
} from "@/lib/roles/registry";
import { extendRoleEnum } from "@/lib/roles/repository";
import { validateRoleDescription, validateRoleLabel } from "@/lib/roles/types";

const LIST_PATH = "/modules/settings/roles";

const GROUPS: RoleGroup[] = [
  "it",
  "l2_support",
  "implementation",
  "development",
  "testing",
  "management",
  "custom",
];

const LEVELS: RoleLevel[] = ["manager", "lead", "engineer", "executive"];

/**
 * Who may change what a role can do.
 *
 * Deliberately narrower than "can open Settings": reading your own profile is
 * every role's right, handing yourself the IIS register is not.
 */
async function editor(): Promise<{ allowed: boolean }> {
  const user = await requireUser();
  return { allowed: can(user.role, "settings", "admin") };
}

function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

/** The grid always submits every module; anything missing or unrecognised is "none". */
function readLevels(formData: FormData): ModuleLevels {
  return Object.fromEntries(
    MODULES.map((module) => {
      const value = String(formData.get(`module:${module.id}`) ?? "none");
      return [module.id, isAccessLevel(value) ? value : "none"];
    }),
  ) as ModuleLevels;
}

function groupFrom(value: string): RoleGroup {
  return GROUPS.includes(value as RoleGroup) ? (value as RoleGroup) : "custom";
}

function levelOf(value: string): RoleLevel {
  return LEVELS.includes(value as RoleLevel) ? (value as RoleLevel) : "engineer";
}

function refresh(roleId?: string): void {
  revalidatePath(LIST_PATH);
  if (roleId) revalidatePath(`${LIST_PATH}/${roleId}`);
  // The navigation is built from the catalogue, so the shell is rebuilt too.
  revalidatePath("/", "layout");
}

export async function createRoleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { allowed } = await editor();
  if (!allowed) return { error: "Only an administrator can add a role." };

  const label = text(formData, "label").replace(/\s+/g, " ");
  const labelError = validateRoleLabel(label);
  if (labelError) return { error: labelError };

  const description = text(formData, "description");
  const descriptionError = validateRoleDescription(description);
  if (descriptionError) return { error: descriptionError };

  const id = roleSlug(label);
  if (!id || id.length < 3) {
    return { error: "That name is too short to make a role key from." };
  }
  if (isRoleId(id) || findRoleDefinition(id)) {
    return { error: "A role with that name already exists." };
  }

  // The record tables store a role as an enum value, so the key has to exist
  // in the database before the catalogue row that points at it.
  const enumError = await extendRoleEnum(id);
  if (enumError) return { error: enumError };

  const error = await persistRoleMeta({
    id,
    label,
    description,
    group: groupFrom(text(formData, "group")),
    level: levelOf(text(formData, "level")),
    accent: "#64748b",
    hidden: false,
    unrestrictedTaskCreation: false,
  });
  if (error) return { error };

  // A brand-new role starts with nothing allowed; the next screen is the grid.
  const levelError = await persistRoleLevels(
    id,
    Object.fromEntries(MODULES.map((module) => [module.id, "none"])) as ModuleLevels,
  );
  if (levelError) return { error: levelError };

  refresh(id);
  redirect(`${LIST_PATH}/${id}?created=1`);
}

/** Rename a workspace role. Built-in names come from the product, not the database. */
export async function saveRoleMetaAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { allowed } = await editor();
  if (!allowed) return { error: "Only an administrator can change a role." };

  const id = text(formData, "id");
  const current = findRoleDefinition(id);
  if (!current) return { error: "That role no longer exists." };
  if (current.builtin) return { error: "Built-in roles keep their name." };

  const label = text(formData, "label").replace(/\s+/g, " ");
  const labelError = validateRoleLabel(label);
  if (labelError) return { error: labelError };

  const description = text(formData, "description");
  const descriptionError = validateRoleDescription(description);
  if (descriptionError) return { error: descriptionError };

  // The record tables store a role as an enum value, so the key has to exist
  // in the database before the catalogue row that points at it.
  const enumError = await extendRoleEnum(id);
  if (enumError) return { error: enumError };

  const error = await persistRoleMeta({
    id,
    label,
    description,
    group: groupFrom(text(formData, "group")),
    level: levelOf(text(formData, "level")),
    accent: current.accent,
    hidden: current.hidden,
    unrestrictedTaskCreation: current.unrestrictedTaskCreation,
  });
  if (error) return { error };

  refresh(id);
  redirect(`${LIST_PATH}/${id}?saved=1`);
}

/**
 * The permission grid.
 *
 * Only levels are read here. The name fields are absent from this form on
 * purpose: a save that touches access must never rewrite a role's description,
 * and vice versa — that is how a "read only" checkbox quietly becomes a rename.
 */
export async function saveRoleLevelsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { allowed } = await editor();
  if (!allowed) return { error: "Only an administrator can change a role." };

  const id = text(formData, "id");
  if (!findRoleDefinition(id)) return { error: "That role no longer exists." };

  const error = await persistRoleLevels(id, readLevels(formData));
  if (error) return { error };

  refresh(id);
  redirect(`${LIST_PATH}/${id}?saved=1`);
}

export async function deleteRoleAction(formData: FormData): Promise<void> {
  const { allowed } = await editor();
  if (!allowed) return;

  const id = text(formData, "id");
  const error = await deleteRoleDefinition(id);
  if (error) redirect(`${LIST_PATH}/${id}?error=${encodeURIComponent(error)}`);

  refresh();
  redirect(`${LIST_PATH}?deleted=1`);
}
