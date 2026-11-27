import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "../config";
import { decodeSession, encodeSession, type SessionUser } from "./token";

export type { SessionUser } from "./token";
export { decodeSession, encodeSession } from "./token";

/** Read + verify the session cookie (server components, actions, routes). */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(
  user: Omit<SessionUser, "issuedAt" | "expiresAt">,
  /** Seconds of life, from the workspace's login timeout. */
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: encodeSession(user, new Date(), ttlSeconds),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttlSeconds,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
