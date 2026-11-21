"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import { clearSessionCookie } from "./session";

export async function logoutAction(): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch (error) {
      console.error("[auth] Supabase sign-out failed", error);
    }
  }
  await clearSessionCookie();
  redirect("/login");
}
