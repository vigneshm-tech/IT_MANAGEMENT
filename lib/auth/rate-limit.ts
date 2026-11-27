/**
 * Small in-memory login throttle. This protects a single instance; a
 * multi-instance deployment should back it with Redis/Upstash instead.
 */
type Bucket = { attempts: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

function key(email: string, ip: string) {
  return `${email.toLowerCase()}|${ip}`;
}

export function checkLoginAllowed(
  email: string,
  ip: string,
  now: number = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const bucket = buckets.get(key(email, ip));
  if (!bucket || bucket.resetAt <= now) return { allowed: true, retryAfterSeconds: 0 };
  if (bucket.attempts < MAX_ATTEMPTS) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function recordLoginFailure(email: string, ip: string, now: number = Date.now()) {
  const k = key(email, ip);
  const bucket = buckets.get(k);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(k, { attempts: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.attempts += 1;
}

export function clearLoginFailures(email: string, ip: string) {
  buckets.delete(key(email, ip));
}

/** Test helper. */
export function resetLoginThrottle() {
  buckets.clear();
}
