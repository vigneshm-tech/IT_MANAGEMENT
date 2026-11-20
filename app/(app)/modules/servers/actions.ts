"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

/**
 * Re-reads the inventory from Action1. Nothing is cached in Postgres, so this
 * only has to drop Next's render cache for the module.
 */
export async function refreshServersAction(): Promise<void> {
  await requireUser();
  revalidatePath("/modules/servers");
  revalidatePath("/modules/dashboard");
}
