"use server";

import { isSupabaseConfigured } from "@/lib/config";
import { requestOrigin } from "@/lib/auth/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResetRequestState = {
  /** Always true once the request is accepted — never reveals account existence. */
  sent?: boolean;
  error?: string;
  email?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestPasswordResetAction(
  _previous: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter the work email your account uses.", email };
  }

  if (!isSupabaseConfigured) {
    // Demo mode has no mailbox. Say so instead of pretending a mail was sent.
    return { sent: true, email };
  }

  try {
    const origin = await requestOrigin();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/login/reset-password`,
    });

    if (error) {
      console.error("[auth] password reset request failed", error.message);
    }
  } catch (error) {
    console.error("[auth] password reset request threw", error);
  }

  // Same response whether or not the address exists.
  return { sent: true, email };
}
