"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate } from "@/lib/auth";
import {
  checkLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/auth/rate-limit";
import { setSessionCookie } from "@/lib/auth/session";

export type LoginState = {
  error?: string;
  email?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function clientIp(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return store.get("x-real-ip") ?? "local";
}

function safeRedirect(target: FormDataEntryValue | null): string {
  const value = typeof target === "string" ? target : "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/modules/dashboard";
}

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirect(formData.get("redirectTo"));

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid work email address.", email };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters.", email };
  }

  const ip = await clientIp();
  const throttle = checkLoginAllowed(email, ip);
  if (!throttle.allowed) {
    return {
      error: `Too many attempts. Try again in ${Math.ceil(throttle.retryAfterSeconds / 60)} minute(s).`,
      email,
    };
  }

  const result = await authenticate(email, password);
  if (!result.ok) {
    recordLoginFailure(email, ip);
    return { error: result.error, email };
  }

  clearLoginFailures(email, ip);
  await setSessionCookie(result.user);
  redirect(redirectTo);
}
