"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/config";
import { clearSessionCookie } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UpdatePasswordState = {
  error?: string;
};

export async function updatePasswordAction(
  _previous: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Use at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Both passwords must match." };
  }
  if (!isSupabaseConfigured) {
    return { error: "Password changes are only available on the deployed app." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "This reset link has expired. Request a new one." };
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      console.error("[auth] password update failed", error.message);
      return {
        error: "The password could not be updated. Request a new link and try again.",
      };
    }

    await supabase.auth.signOut();
    await clearSessionCookie();
  } catch (error) {
    console.error("[auth] password update threw", error);
    return { error: "Something went wrong. Request a new link and try again." };
  }

  redirect("/login?reason=password-reset");
}
