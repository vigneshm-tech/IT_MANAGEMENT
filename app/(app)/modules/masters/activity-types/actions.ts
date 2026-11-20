"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  activityTypeNameError,
  normaliseActivityTypeName,
} from "@/lib/activity-types";
import {
  createActivityType,
  deleteActivityType,
  listActivityTypes,
  setActivityTypeStatus,
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
  const error = activityTypeNameError(name, await listActivityTypes());
  if (error) return { error };

  try {
    await createActivityType(user, name);
  } catch (cause) {
    console.error("[activity-types] create failed", cause);
    return { error: "The activity type could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${name}" was added to the register.` };
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
    } else {
      return;
    }
  } catch (cause) {
    console.error("[activity-types] row action failed", cause);
    return;
  }

  revalidate();
}
