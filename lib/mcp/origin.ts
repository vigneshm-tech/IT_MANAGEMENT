/**
 * The deployment's own origin, as the client reached it.
 *
 * OAuth metadata has to be absolute, and the app is served from at least three
 * hosts (production alias, preview deployments, localhost). Reading the request
 * is the only honest answer; a hard-coded URL would send a preview's client to
 * production.
 *
 * `fallbackUrl` covers the one case where there is no `host` header — a Request
 * built in code, as the tests do — so a 401 never advertises `localhost`.
 */
export function originFrom(headers: Headers, fallbackUrl?: string): string {
  const headerHost = headers.get("host");
  const fallbackHost = fallbackUrl ? safeHost(fallbackUrl) : null;
  const host = headerHost ?? fallbackHost ?? "localhost:3000";
  const forwarded = headers.get("x-forwarded-proto");
  const proto =
    forwarded === "http" || forwarded === "https"
      ? forwarded
      : host.startsWith("localhost") || host.startsWith("127.") || host.startsWith("0.0.0.0")
        ? "http"
        : "https";
  return `${proto}://${host}`;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
