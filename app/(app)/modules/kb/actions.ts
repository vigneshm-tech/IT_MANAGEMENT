"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  createKbArticle,
  deleteKbArticle,
  listKbArticles,
  listKbCategories,
  updateKbArticle,
} from "@/lib/records/repository";
import { isKbVisibility, kbArticleError, normaliseKbTitle } from "@/lib/tickets/kb";

function revalidate(id?: string) {
  revalidatePath("/modules/kb");
  revalidatePath("/support/kb");
  if (id) {
    revalidatePath(`/modules/kb/${id}`);
    revalidatePath(`/support/kb/${id}`);
  }
}

function tagsFrom(formData: FormData): string[] {
  return String(formData.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function readFields(formData: FormData) {
  const visibilityRaw = String(formData.get("visibility") ?? "public");
  return {
    title: normaliseKbTitle(String(formData.get("title") ?? "")),
    summary: String(formData.get("summary") ?? "").trim().slice(0, 240),
    body: String(formData.get("body") ?? "").trim(),
    categoryId: String(formData.get("categoryId") ?? "").trim(),
    visibility: isKbVisibility(visibilityRaw) ? visibilityRaw : ("public" as const),
    tags: tagsFrom(formData),
  };
}

export async function createKbArticleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "kb", "edit")) {
    return { error: "Your role cannot publish articles." };
  }

  const fields = readFields(formData);
  const categories = await listKbCategories(true);
  const error = kbArticleError({ ...fields, categories });
  if (error) return { error };

  try {
    const article = await createKbArticle(fields);
    revalidate(article.id);
    return { ok: true, message: `"${article.title}" is published.` };
  } catch (cause) {
    console.error("[kb] create failed", cause);
    return { error: "The article could not be saved. Please try again." };
  }
}

export async function updateKbArticleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "kb", "edit")) {
    return { error: "Your role cannot change articles." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "That article no longer exists." };

  const fields = readFields(formData);
  const categories = await listKbCategories(true);
  const error = kbArticleError({ ...fields, categories });
  if (error) return { error };

  try {
    const saved = await updateKbArticle(id, fields);
    if (!saved) return { error: "That article no longer exists." };
    revalidate(id);
    return { ok: true, message: "Article saved." };
  } catch (cause) {
    console.error("[kb] update failed", cause);
    return { error: "The article could not be saved. Please try again." };
  }
}

/** Status toggle and delete, from the list and the editor. */
export async function kbArticleRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "kb", "edit")) return;

  const id = String(formData.get("id") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  if (!id) return;

  try {
    if (value === "toggle") {
      const article = (await listKbArticles({ includeInactive: true })).find(
        (item) => item.id === id,
      );
      if (article) {
        await updateKbArticle(id, { status: article.status === "active" ? "inactive" : "active" });
      }
    } else if (value === "delete") {
      await deleteKbArticle(id);
      revalidate(id);
      redirect("/modules/kb");
    } else {
      return;
    }
  } catch (cause) {
    // `redirect` throws on purpose; anything else is a real failure.
    if (value !== "delete") console.error("[kb] row action failed", cause);
    return;
  }

  revalidate(id);
}
