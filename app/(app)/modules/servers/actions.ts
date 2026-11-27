"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { clearCache } from "@/lib/cache/ttl";
import { runSync } from "@/lib/servers/inventory";

/**
 * Sync now.
 *
 * The Servers page reads a stored snapshot, so this is the only path that talks
 * to Action1 while somebody is watching. It writes the snapshot, drops the
 * per-instance copies of everything derived from it, and revalidates the pages
 * that show endpoints — so the next render everywhere is the new list.
 *
 * Failures are not thrown: the snapshot keeps its last good contents and records
 * why the attempt failed, which the page then shows. Losing a page because
 * Action1 had a bad minute would be a worse answer than a one-day-old list.
 */
export async function syncServersAction(): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "servers", "edit")) return;

  try {
    await runSync(user.id, "manual");
  } catch (cause) {
    console.error("[servers] manual sync failed", cause);
  }

  clearCache("action1-inventory");
  revalidatePath("/modules/servers");
  revalidatePath("/modules/servers/[id]", "page");
  revalidatePath("/modules/patching");
  revalidatePath("/modules/dashboard");
  revalidatePath("/modules/tasks");
  revalidatePath("/modules/iis");
}

/** Kept for callers that only need to drop the cached copies. */
export async function refreshServersAction(): Promise<void> {
  await requireUser();
  clearCache("action1-");
  revalidatePath("/modules/servers");
}
