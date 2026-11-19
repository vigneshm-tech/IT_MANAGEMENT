import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isDemoMode, isSupabaseConfigured } from "../config";
import { findDemoUser } from "../demo-users";
import { getRole, isRoleId, type RoleId } from "../roles";
import { createSupabaseServerClient } from "../supabase/server";
import { findDemoDirectoryUser } from "../users/store";
import { getSession, type SessionUser } from "./session";

export type AuthResult =
  | { ok: true; user: Omit<SessionUser, "issuedAt" | "expiresAt"> }
  | { ok: false; error: string };

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

function samePassword(a: string, b: string): boolean {
  const left = sha256(a);
  const right = sha256(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function demoLoginEnabled(): boolean {
  return isDemoMode && process.env.DISABLE_DEMO_LOGIN !== "true";
}

/**
 * Verify credentials and resolve the employee profile.
 * - Supabase mode: signs in against Supabase Auth and reads `profiles.role`.
 * - Demo mode: checks the seeded demo accounts.
 */
export async function authenticate(
  emailInput: string,
  password: string,
): Promise<AuthResult> {
  const email = emailInput.trim().toLowerCase();
  if (!email || !password) {
    return { ok: false, error: "Enter your work email and password." };
  }

  if (isSupabaseConfigured) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.user) {
        return { ok: false, error: "Those credentials do not match an account." };
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, title, status")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError) {
        await supabase.auth.signOut();
        return {
          ok: false,
          error:
            "Your profile could not be loaded. Ask IT to finish the TaskTornado setup.",
        };
      }

      if (!profile) {
        await supabase.auth.signOut();
        return {
          ok: false,
          error: "No employee profile found for this account. Ask IT to provision you.",
        };
      }

      if (profile.status && profile.status !== "active") {
        await supabase.auth.signOut();
        return { ok: false, error: "This account is inactive. Contact IT." };
      }

      if (!isRoleId(profile.role)) {
        await supabase.auth.signOut();
        return {
          ok: false,
          error: "Your role has not been assigned yet. Contact your IT Manager.",
        };
      }

      const role = getRole(profile.role as RoleId)!;
      return {
        ok: true,
        user: {
          id: profile.id,
          email: profile.email ?? email,
          name: profile.full_name || email.split("@")[0],
          role: role.id,
          title: profile.title || role.label,
          provider: "supabase",
        },
      };
    } catch (error) {
      console.error("[auth] Supabase sign-in failed", error);
      return {
        ok: false,
        error: "Authentication service is unreachable. Please try again shortly.",
      };
    }
  }

  if (!demoLoginEnabled()) {
    return {
      ok: false,
      error: "Sign-in is not configured. Set the Supabase environment variables.",
    };
  }

  const user = findDemoUser(email);
  if (!user || !samePassword(password, user.password)) {
    return { ok: false, error: "Those credentials do not match an account." };
  }

  if (findDemoDirectoryUser(user.id)?.status === "suspended") {
    return { ok: false, error: "This account is suspended. Contact IT." };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      title: user.title,
      provider: "demo",
    },
  };
}

/** Current user or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return getSession();
}

/**
 * Use inside protected server components / actions.
 *
 * Besides decoding the cookie, Supabase sessions are checked against
 * `profiles.status` so a suspended or removed account loses access at once
 * instead of when the 12-hour cookie expires.
 */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const user = await getSession();
  if (!user) redirect("/login");

  if (isSupabaseConfigured && user.provider === "supabase") {
    let status: string | null = null;
    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", user.id)
        .maybeSingle();
      status = data?.status ?? null;
    } catch (error) {
      console.error("[auth] profile status check failed", error);
    }

    if (status && status !== "active") {
      redirect("/logout?reason=suspended");
    }
  }

  return user;
});
