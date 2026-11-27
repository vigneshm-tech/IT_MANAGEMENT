/** Application-wide configuration. Values can be overridden with env vars. */

export const APP_NAME = "TaskTornado";
export const APP_TAGLINE = "IT operations, spinning perfectly.";
export const APP_DESCRIPTION =
  "Role-based IT management for tasks, tickets, servers, clients, patching, approvals and renewals.";

function intFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 23 ? parsed : fallback;
}

/**
 * Engineers may only create tasks inside this window. Leads, managers, IT
 * managers and management bypass it. Times are wall-clock in `timeZone`.
 */
export const TASK_WINDOW = {
  startHour: intFromEnv(process.env.TASK_WINDOW_START, 9),
  endHour: intFromEnv(process.env.TASK_WINDOW_END, 18),
  timeZone: process.env.TASK_WINDOW_TZ || "Asia/Kolkata",
};

export const SESSION_COOKIE = "tt_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  "";

/**
 * Server-only key. Present in the host's environment, never in the browser
 * bundle and never in the database. It is used by the routes that have no
 * session — the sweep, the inbound mail hook and the outbox dispatcher — which
 * otherwise run as `anon` and see nothing because of row-level security.
 */
export const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const hasSupabaseServiceKey = Boolean(supabaseUrl && supabaseServiceKey);

/** Demo mode is used when Supabase is not configured (local previews, CI). */
export const isDemoMode = !isSupabaseConfigured;
