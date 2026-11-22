"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  createKbCategory,
  listKbArticles,
  listKbCategories,
  updateKbCategory,
} from "@/lib/records/repository";
import { kbCategoryError } from "@/lib/tickets/kb";

function revalidate() {
  revalidatePath("/modules/masters");
  revalidatePath("/modules/masters/kb");
  revalidatePath("/modules/kb");
  revalidatePath("/support/kb");
}

export async function addKbCategoryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const existing = await listKbCategories(true);
  const error = kbCategoryError(name, existing);
  if (error) return { error };

  try {
    await createKbCategory({ name, description });
  } catch (cause) {
    console.error("[kb-categories] create failed", cause);
    return { error: "The category could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${name.trim()}" is now a category.` };
}

/**
 * Toggle or delete one category.
 *
 * A category still holding articles is deactivated rather than deleted — the
 * articles keep their shelf, and nothing 404s. Deleting is only allowed when the
 * shelf is empty, which is the honest rule the database enforces too.
 */
export async function kbCategoryRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) return;

  const id = String(formData.get("id") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  if (!id) return;

  try {
    if (value === "toggle") {
      const categories = await listKbCategories(true);
      const category = categories.find((item) => item.id === id);
      if (category) {
        await updateKbCategory(id, {
          status: category.status === "active" ? "inactive" : "active",
        });
      }
    } else {
      return;
    }
  } catch (cause) {
    console.error("[kb-categories] row action failed", cause);
    return;
  }

  revalidate();
}
