"use server";

import { clearIntroCookie } from "@/lib/auth/intro";

/** Called by the launch intro once it has finished, so it never replays. */
export async function dismissIntroAction(): Promise<void> {
  await clearIntroCookie();
}
