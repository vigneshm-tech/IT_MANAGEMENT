import { NextResponse } from "next/server";

/**
 * The envelope every `/api/v1` response uses.
 *
 * Success is `{ data: … }` with an optional `meta`; failure is
 * `{ error: { code, message } }` and an HTTP status that means the same thing.
 * A client never has to guess whether a body is an error by looking at its shape
 * — only at its status.
 */

export type ApiMeta = Record<string, unknown>;

export function ok(data: unknown, meta?: ApiMeta, status = 200): NextResponse {
  return NextResponse.json(meta ? { data, meta } : { data }, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function fail(
  status: number,
  code: string,
  message: string,
  meta?: ApiMeta,
): NextResponse {
  return NextResponse.json({ error: { code, message }, ...(meta ? { meta } : {}) }, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export const NO_STORE = { "cache-control": "no-store" } as const;

/** Reads a bounded query parameter: `?limit=200` becomes 200, `?limit=x` the fallback. */
export function intParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function textParam(url: URL, name: string, max = 200): string {
  return (url.searchParams.get(name) ?? "").trim().slice(0, max);
}
