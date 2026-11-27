import { isSupabaseConfigured } from "../config";
import {
  DEFAULT_SESSION_TIMEOUT_MINUTES,
  normaliseSessionTimeoutMinutes,
} from "../session-policy";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * The login timeout, as chosen in Settings → Security & sessions.
 *
 * One row for the workspace (`public.app_session_policy`). Reading is cheap and
 * happens at sign-in and on the security page; with Supabase absent the choice
 * lives in process memory, like the other stores.
 */

const ROW_ID = "session";

const globalForSession = globalThis as unknown as {
  __taskTornadoSessionTimeout?: number;
};

export type SessionPolicy = {
  /** Minutes a sign-in lasts; 0 means until sign out. */
  timeoutMinutes: number;
  updatedAt: string | null;
};

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  timeoutMinutes: DEFAULT_SESSION_TIMEOUT_MINUTES,
  updatedAt: null,
};

export async function readSessionPolicy(): Promise<SessionPolicy> {
  if (!isSupabaseConfigured) {
    return {
      timeoutMinutes:
        globalForSession.__taskTornadoSessionTimeout ?? DEFAULT_SESSION_TIMEOUT_MINUTES,
      updatedAt: null,
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("app_session_policy")
      .select("timeout_minutes,updated_at")
      .eq("id", ROW_ID)
      .maybeSingle<{ timeout_minutes: number | null; updated_at: string | null }>();

    if (error) throw error;
    if (!data) return DEFAULT_SESSION_POLICY;

    return {
      timeoutMinutes: normaliseSessionTimeoutMinutes(data.timeout_minutes),
      updatedAt: data.updated_at,
    };
  } catch (error) {
    // A missing migration must not lock anyone out: the default applies.
    console.error("[session] policy read failed", error);
    return DEFAULT_SESSION_POLICY;
  }
}

export async function saveSessionTimeout(
  userId: string,
  minutes: number,
): Promise<void> {
  const timeoutMinutes = normaliseSessionTimeoutMinutes(minutes);

  if (!isSupabaseConfigured) {
    globalForSession.__taskTornadoSessionTimeout = timeoutMinutes;
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("app_session_policy").upsert(
    {
      id: ROW_ID,
      timeout_minutes: timeoutMinutes,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[session] policy save failed", error);
    throw new Error("The login timeout could not be saved. Please try again.");
  }
}
