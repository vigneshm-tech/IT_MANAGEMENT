import { isSupabaseConfigured } from "../config";
import { listDemoGroups } from "./groups-store";
import type { UserGroup, UserGroupMember } from "./groups";
import { listDemoDirectory } from "./store";
import { isRoleId, type RoleId } from "../roles";
import { createSupabaseServerClient } from "../supabase/server";

export type DirectoryUser = {
  id: string;
  employeeId: string;
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
        .select("id, employee_id, email, full_name, title, role, status, last_login_at")
        .order("full_name", { ascending: true });

      if (error) {
        console.error("[users] directory query failed", error);
        return { users: [], error: "The directory could not be loaded." };
      }

      const users = (data ?? [])
        .filter((row) => row.role !== SUPER_ADMIN)
        .map<DirectoryUser>((row) => ({
          id: row.id,
          employeeId: row.employee_id ?? "",
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

  return { users: listDemoDirectory(), error: null };
}

export type GroupsResult = {
  groups: UserGroup[];
  /** Set when groups could not be read; the view shows an empty state. */
  error: string | null;
};

function memberFrom(value: unknown): UserGroupMember | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.user_id === "string" ? row.user_id : "";
  if (!id) return null;

  const embedded = row.profiles;
  const profile = (Array.isArray(embedded) ? embedded[0] : embedded) as
    | Record<string, unknown>
    | null
    | undefined;
  const email = typeof profile?.email === "string" ? profile.email : "";
  const fullName = typeof profile?.full_name === "string" ? profile.full_name : "";

  return {
    id,
    name: fullName || email.split("@")[0] || "Unnamed",
    email,
    role: isRoleId(profile?.role) ? profile.role : null,
  };
}

function groupFrom(row: Record<string, unknown>): UserGroup {
  const links = Array.isArray(row.user_group_members) ? row.user_group_members : [];
  const members = links
    .map(memberFrom)
    .filter((member): member is UserGroupMember => member !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: String(row.id ?? ""),
    name: typeof row.name === "string" ? row.name : "Untitled group",
    description: typeof row.description === "string" ? row.description : "",
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    members,
  };
}

/**
 * Groups with their members, for the "Manage Groups" sub-module.
 *
 * - Supabase mode: `public.user_groups` plus the member links, embedded in one
 *   request. RLS only admits a super admin.
 * - Demo mode: the seeded groups held in process memory.
 */
export async function listGroups(): Promise<GroupsResult> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("user_groups")
        .select(
          "id, name, description, created_at, user_group_members(user_id, profiles(full_name, email, role))",
        )
        .order("name", { ascending: true });

      if (error) {
        console.error("[users] groups query failed", error);
        return { groups: [], error: "The groups could not be loaded." };
      }

      return {
        groups: (data ?? []).map((row) => groupFrom(row as Record<string, unknown>)),
        error: null,
      };
    } catch (error) {
      console.error("[users] groups query threw", error);
      return { groups: [], error: "The groups could not be loaded." };
    }
  }

  return { groups: listDemoGroups(), error: null };
}
