"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { clearCache } from "@/lib/cache/ttl";

/**
 * Re-reads the inventory from Action1.
 *
 * The inventory is held for a minute per connection so module switches do not
 * repeat the API calls; Refresh is the deliberate way to force a new read, so it
 * drops that copy for every module that reads endpoints.
 */
export async function refreshServersAction(): Promise<void> {
  await requireUser();
  clearCache("action1-");
  revalidatePath("/modules/servers");
  revalidatePath("/modules/patching");
  revalidatePath("/modules/dashboard");
  revalidatePath("/modules/tasks");
}
