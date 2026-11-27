import { cookies } from "next/headers";

/**
 * One-shot flag that plays the post-login launch intro.
 *
 * Set when the session cookie is issued and cleared by the intro itself, so
 * the experience runs exactly once per sign-in and never on internal
 * navigation or a later reload.
 */
export const INTRO_COOKIE = "tt_intro";

/** Long enough for the first render, short enough to never outlive a session. */
const INTRO_TTL_SECONDS = 90;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export async function markIntroPending(): Promise<void> {
  const store = await cookies();
  store.set({ ...cookieOptions(), name: INTRO_COOKIE, value: "1", maxAge: INTRO_TTL_SECONDS });
}

export async function isIntroPending(): Promise<boolean> {
  const store = await cookies();
  return store.get(INTRO_COOKIE)?.value === "1";
}

export async function clearIntroCookie(): Promise<void> {
  const store = await cookies();
  store.set({ ...cookieOptions(), name: INTRO_COOKIE, value: "", maxAge: 0 });
}
