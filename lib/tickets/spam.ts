/**
 * The public form's guard rail.
 *
 * The form has no login, so the only cheap protections are the ones that do not
 * need a session: a honeypot field, a submission throttle per address, and the
 * same length rules the agent form uses. The throttle is in-process, like the
 * login throttle, which is honest for a single instance and documented as such —
 * a multi-instance deployment should back it with Redis.
 *
 * The throttle is per IP over a rolling hour: five tickets an hour is more than
 * any real person raises, and few enough that a script cannot fill the queue.
 */

export const PUBLIC_MAX_PER_WINDOW = 5;
export const PUBLIC_WINDOW_MS = 60 * 60 * 1000;
/** A form submitted faster than this was filled by a machine. */
export const PUBLIC_MIN_FILL_MS = 1500;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function publicSubmissionAllowed(
  ip: string,
  now: number = Date.now(),
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const key = ip || "unknown";
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    return { allowed: true, remaining: PUBLIC_MAX_PER_WINDOW, retryAfterSeconds: 0 };
  }
  const remaining = Math.max(0, PUBLIC_MAX_PER_WINDOW - bucket.count);
  return {
    allowed: remaining > 0,
    remaining,
    retryAfterSeconds: remaining > 0 ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Counts one accepted submission. Rejected ones do not count against you. */
export function recordPublicSubmission(ip: string, now: number = Date.now()): void {
  const key = ip || "unknown";
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + PUBLIC_WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

/**
 * The honeypot is a field named like something a browser would autofill and a
 * person never sees. Anything in it means a bot filled the form.
 */
export const HONEYPOT_FIELD = "website";

export function looksAutomated(input: {
  honeypot?: string | null;
  startedAt?: number | null;
  now?: number;
}): string | null {
  if ((input.honeypot ?? "").trim().length > 0) {
    return "That submission looked automated, so it was not filed.";
  }
  const now = input.now ?? Date.now();
  if (input.startedAt && now - input.startedAt < PUBLIC_MIN_FILL_MS) {
    return "That was too quick to be a person. Read the form, then send it again.";
  }
  return null;
}

/** Test helper, like the login throttle's. */
export function resetPublicSubmissions(): void {
  buckets.clear();
}

/** Reads the visitor's address from the proxy headers a host adds. */
export function clientAddress(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "unknown";
}
