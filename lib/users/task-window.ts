import { canAccessModule } from "../access";
import { readCache, writeCache } from "../cache/ttl";
import { isSupabaseConfigured } from "../config";
import type { RoleId } from "../roles";
import { createSupabaseServerClient } from "../supabase/server";
import { taskWindowSettings, type TaskWindowSettings } from "../task-window";
import { findDemoDirectoryUser } from "./store";

/**
 * The enrolment window saved for one person, or null for "office hours".
 *
 * The window belongs to the Tasks module: a role that cannot open Tasks keeps
 * none, so a saved 07:00–13:00 can never widen what somebody may do — it only
 * replaces *when* somebody who may already raise tasks is allowed to.
 *
 * Cached briefly (an access check runs on every page), so a change an
 * administrator makes lands within a few seconds rather than on the next
 * sign-in.
 */
const TTL_MS = 30_000;

const key = (userId: string) => `task-window:${userId}`;

export async function taskWindowSettingsFor(user: {
  id: string;
  role: RoleId;
}): Promise<TaskWindowSettings | null> {
  if (!canAccessModule(user.role, "tasks")) return null;

  const cacheKey = key(user.id);
  const cached = readCache<TaskWindowSettings | null>(cacheKey);
  if (cached !== undefined) return cached;

  if (!isSupabaseConfigured) {
    const settings = findDemoDirectoryUser(user.id)?.taskWindow ?? null;
    writeCache(cacheKey, settings, TTL_MS);
    return settings;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("task_window_start, task_window_end")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      // A missing column (unmigrated workspace) must not lock anybody out.
      console.error("[task-window] profile window read failed", error);
      return null;
    }

    const settings = taskWindowSettings(data?.task_window_start, data?.task_window_end);
    writeCache(cacheKey, settings, TTL_MS);
    return settings;
  } catch (error) {
    console.error("[task-window] profile window read threw", error);
    return null;
  }
}
