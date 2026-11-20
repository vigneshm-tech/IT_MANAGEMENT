"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  activityModuleLabel,
  activityTypeModuleError,
  activityTypeNameError,
  normaliseActivityTypeName,
} from "@/lib/activity-types";
import {
  createActivityType,
  deleteActivityType,
  listActivityTypes,
  setActivityTypeStatus,
  updateActivityType,
} from "@/lib/records/repository";
import type { FormState } from "@/lib/forms";

function revalidate() {
  revalidatePath("/modules/masters");
  revalidatePath("/modules/masters/activity-types");
  revalidatePath("/modules/tasks/new");
}

export async function addActivityTypeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const name = normaliseActivityTypeName(String(formData.get("name") ?? ""));
  const module = String(formData.get("module") ?? "");

  const moduleError = activityTypeModuleError(module);
  if (moduleError) return { error: moduleError };

  const nameError = activityTypeNameError(name, await listActivityTypes(), { module });
  if (nameError) return { error: nameError };

  try {
    await createActivityType(user, name, module);
  } catch (cause) {
    console.error("[activity-types] create failed", cause);
    return { error: "The activity type could not be saved. Please try again." };
  }

  revalidate();
  return {
    ok: true,
    message: `"${name}" was added for ${activityModuleLabel(module)}.`,
  };
}

/**
 * Row actions arrive as a plain form post (`id` + `value`), which keeps the
 * DataTable free of per-row closures.
 */
export async function activityTypeRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) return;

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  const type = (await listActivityTypes()).find((item) => item.id === id);
  if (!type) return;

  try {
    if (value === "toggle") {
      await setActivityTypeStatus(id, type.status === "active" ? "inactive" : "active");
    } else if (value === "delete") {
      await deleteActivityType(id);
      revalidate();
      redirect("/modules/masters/activity-types?deleted=1");
    } else {
      return;
    }
  } catch (cause) {
    // `redirect()` signals by throwing — let it through untouched.
    if (cause && typeof cause === "object" && "digest" in cause) throw cause;
    console.error("[activity-types] row action failed", cause);
    return;
  }

  revalidate();
}

/** The edit page saves name and module for one existing type. */
export async function updateActivityTypeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = normaliseActivityTypeName(String(formData.get("name") ?? ""));
  const module = String(formData.get("module") ?? "");

  if (!id) return { error: "Unknown activity type." };

  const moduleError = activityTypeModuleError(module);
  if (moduleError) return { error: moduleError };

  const types = await listActivityTypes();
  if (!types.some((item) => item.id === id)) {
    return { error: "That activity type no longer exists." };
  }

  const nameError = activityTypeNameError(name, types, { module, ignoreId: id });
  if (nameError) return { error: nameError };

  try {
    const saved = await updateActivityType(id, name, module);
    if (!saved) return { error: "The activity type could not be saved. Please try again." };
  } catch (cause) {
    console.error("[activity-types] update failed", cause);
    return { error: "The activity type could not be saved. Please try again." };
  }

  revalidate();
  redirect(`/modules/masters/activity-types?updated=${encodeURIComponent(id)}`);
}
