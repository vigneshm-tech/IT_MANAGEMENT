import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Auth redirect target. Supabase sends recovery (and confirmation) links here
 * with a one-time `code`; exchanging it sets the session cookies before the
 * user lands on the reset form.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/modules";
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/modules";

  if (code && isSupabaseConfigured) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, url.origin));
      }
      console.error("[auth] code exchange failed", error.message);
    } catch (error) {
      console.error("[auth] code exchange threw", error);
    }
  }

  return NextResponse.redirect(new URL("/login?reason=link", url.origin));
}
