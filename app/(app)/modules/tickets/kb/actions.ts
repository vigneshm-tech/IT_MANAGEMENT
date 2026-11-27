"use server";

import { revalidatePath } from "next/cache";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getKbFileMeta, deleteKbFile } from "@/lib/tickets/kb-files-store";

/**
 * Removing a file from the ticket knowledge base.
 *
 * The uploader may delete what they added — people misfile things — and anyone
 * who can edit tickets may delete anything, because a stale vendor PDF is worth
 * removing. The row and the object go together: leaving the bytes behind would
 * keep a private file alive with nothing pointing at it.
 */
export async function deleteKbFileAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canAccessModule(user.role, "tickets")) return;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const file = await getKbFileMeta(id);
  if (!file) return;

  const mayDelete = can(user.role, "tickets", "edit") || file.uploadedById === user.id;
  if (!mayDelete) return;

  await deleteKbFile(id);
  revalidatePath("/modules/tickets/kb");
  revalidatePath("/modules/tickets");
}
