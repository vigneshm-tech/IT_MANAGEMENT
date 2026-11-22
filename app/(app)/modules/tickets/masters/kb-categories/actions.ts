"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  createKbCategory,
  deleteKbCategory,
  listKbArticles,
  listKbCategories,
  updateKbCategory,
} from "@/lib/records/repository";
import { canConfigureTickets } from "@/lib/tickets/admin";
import { kbCategoryError } from "@/lib/tickets/kb";

function revalidate() {
  revalidatePath("/modules/tickets");
  revalidatePath("/modules/tickets/masters");
  revalidatePath("/modules/tickets/masters/kb-categories");
  revalidatePath("/modules/kb");
  revalidatePath("/support/kb");
}

export async function saveKbCategoryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "view")) return { error: "You cannot read tickets." };
  if (!canConfigureTickets(user.role)) return { error: "Your role cannot change the categories." };

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "").trim().slice(0, 160);

  const existing = (await listKbCategories(true)).filter((category) => category.id !== id);
  const error = kbCategoryError(name, existing);
  if (error) return { error };

  try {
    if (id) {
      const saved = await updateKbCategory(id, { name, description });
      if (!saved) return { error: "That category no longer exists." };
      revalidate();
      return { ok: true, message: `"${name.trim()}" was updated.` };
    }
    await createKbCategory({ name, description });
  } catch (cause) {
    console.error("[kb-categories] save failed", cause);
    return { error: "The category could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${name.trim()}" is now a category.` };
}

/**
 * Toggle or delete one shelf.
 *
 * A shelf still holding articles is refused by the repository rather than
 * cascading — deleting it would orphan the articles and break every link to
 * them. Deactivating hides the shelf without touching the words inside it.
 */
export async function kbCategoryRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canConfigureTickets(user.role)) return;

  const id = String(formData.get("id") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  if (!id) return;

  try {
    if (value === "toggle") {
      const category = (await listKbCategories(true)).find((item) => item.id === id);
      if (category) {
        await updateKbCategory(id, {
          status: category.status === "active" ? "inactive" : "active",
        });
      }
    } else if (value === "delete") {
      const result = await deleteKbCategory(id);
      if (!result.ok) {
        redirect(`/modules/tickets/masters/kb-categories?blocked=${encodeURIComponent(id)}`);
      }
    } else {
      return;
    }
  } catch (cause) {
    // `redirect` throws by design; let it through untouched.
    if (cause && typeof cause === "object" && "digest" in cause) throw cause;
    console.error("[kb-categories] row action failed", cause);
    return;
  }

  revalidate();
}
