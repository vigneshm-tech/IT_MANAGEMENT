import { headers } from "next/headers";

/**
 * Absolute origin of the current request, used for auth redirect URLs.
 * Falls back to NEXT_PUBLIC_SITE_URL when headers are unavailable (e.g. local
 * scripts or server actions invoked outside a request).
 */
export async function requestOrigin(): Promise<string> {
  const store = await headers();
  const origin = store.get("origin");
  if (origin && origin !== "null") return origin;

  const host = store.get("x-forwarded-host") ?? store.get("host");
  if (host) {
    const proto =
      store.get("x-forwarded-proto") ??
      (process.env.NODE_ENV === "production" ? "https" : "http");
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
