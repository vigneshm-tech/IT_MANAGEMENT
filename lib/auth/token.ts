import { createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_TTL_SECONDS } from "../config";
import { getRole, type RoleId } from "../roles";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: RoleId;
  title: string;
  provider: "demo" | "supabase";
  issuedAt: number;
  expiresAt: number;
};

type TokenPayload = Omit<SessionUser, "issuedAt" | "expiresAt"> & {
  iat: number;
  exp: number;
};

const DEV_SECRET =
  "tasktornado-local-development-secret-please-set-AUTH_SECRET-in-env";

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[auth] AUTH_SECRET is not set — falling back to the development secret.",
      );
    }
    return DEV_SECRET;
  }
  return value;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payload: string): string {
  return base64url(createHmac("sha256", secret()).update(payload).digest());
}

export function encodeSession(
  user: Omit<SessionUser, "issuedAt" | "expiresAt">,
  now: Date = new Date(),
  /** Seconds of life, from the workspace's login timeout. */
  ttlSeconds: number = SESSION_TTL_SECONDS,
): string {
  const iat = Math.floor(now.getTime() / 1000);
  const payload: TokenPayload = { ...user, iat, exp: iat + ttlSeconds };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(fromBase64url(body).toString("utf8"));
  } catch {
    return null;
  }

  if (!payload?.exp || payload.exp * 1000 < Date.now()) return null;
  if (!getRole(payload.role)) return null;
  if (!payload.id || !payload.email) return null;

  return {
    id: payload.id,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    title: payload.title,
    provider: payload.provider === "supabase" ? "supabase" : "demo",
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}
