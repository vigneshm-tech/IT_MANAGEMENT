import { isSupabaseConfigured } from "../config";
import { DEMO_USERS } from "../demo-users";
import { isRoleId, type RoleId } from "../roles";
import { createSupabaseServerClient } from "../supabase/server";

export type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  title: string;
  role: RoleId | null;
  status: "active" | "inactive" | "pending" | "suspended";
  lastLoginAt: string | null;
};

export type DirectoryResult = {
  users: DirectoryUser[];
  /** Set when the directory could not be read; the view shows an empty state. */
  error: string | null;
};

const SUPER_ADMIN = "super_admin";

function statusOf(value: unknown): DirectoryUser["status"] {
  return value === "inactive" || value === "pending" || value === "suspended"
    ? value
    : "active";
}

/**
 * Employee directory for the hidden "Users" module.
 *
 * - Supabase mode: reads `public.profiles` through the caller's session. RLS
 *   only allows a super admin to select rows other than their own.
 * - Demo mode: the seeded accounts, minus hidden roles.
 *
 * The super admin account itself is always filtered out — it is never listed
 * to anyone, including other super admins.
 */
export async function listDirectory(): Promise<DirectoryResult> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, title, role, status, last_login_at")
        .order("full_name", { ascending: true });

      if (error) {
        console.error("[users] directory query failed", error);
        return { users: [], error: "The directory could not be loaded." };
      }

      const users = (data ?? [])
        .filter((row) => row.role !== SUPER_ADMIN)
        .map<DirectoryUser>((row) => ({
          id: row.id,
          name: row.full_name || row.email?.split("@")[0] || "Unnamed",
          email: row.email ?? "",
          title: row.title ?? "",
          role: isRoleId(row.role) ? row.role : null,
          status: statusOf(row.status),
          lastLoginAt: row.last_login_at ?? null,
        }));

      return { users, error: null };
    } catch (error) {
      console.error("[users] directory query threw", error);
      return { users: [], error: "The directory could not be loaded." };
    }
  }

  const users = DEMO_USERS.filter((user) => user.role !== SUPER_ADMIN).map<DirectoryUser>(
    (user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      title: user.title,
      role: user.role,
      status: "active",
      lastLoginAt: null,
    }),
  );

  return { users, error: null };
}
