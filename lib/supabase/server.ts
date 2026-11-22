import { AsyncLocalStorage } from "node:async_hooks";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseServiceKey, supabaseUrl } from "../config";

/**
 * Set only for the duration of a route handler that authenticates a machine
 * rather than a person (the sweep, the inbound mail hook, the outbox
 * dispatcher). Scoped with AsyncLocalStorage rather than a module flag, so two
 * concurrent requests cannot borrow each other's privilege.
 */
const serviceScope = new AsyncLocalStorage<boolean>();

/**
 * Request-scoped Supabase client for server components, server actions and
 * route handlers. Only call this when Supabase is configured.
 */
export async function createSupabaseServerClient() {
  // Background work has no session, and an `anon` client cannot see the rows a
  // job has to act on — row-level security returns nothing rather than an error.
  if (serviceScope.getStore() && supabaseServiceKey) {
    return createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component — cookies are read-only there.
          // Session refresh is handled by server actions / route handlers.
        }
      },
    },
  });
}

/**
 * Runs `fn` with the service-role client.
 *
 * Only for route handlers that have already proved who is calling (a bearer
 * secret) and for work they start. Never wrap a page or a server action that a
 * person drives: that would quietly turn every query into a bypass of RLS.
 */
export async function runWithServiceRole<T>(fn: () => Promise<T>): Promise<T> {
  return serviceScope.run(true, fn);
}
