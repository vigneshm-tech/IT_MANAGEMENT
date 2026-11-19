import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

/** Clears the app session, then returns to the login screen. */
export async function GET(request: Request) {
  await clearSessionCookie();

  const url = new URL(request.url);
  const reason = url.searchParams.get("reason");
  const target = new URL("/login", url.origin);
  if (reason) target.searchParams.set("reason", reason);

  return NextResponse.redirect(target);
}
