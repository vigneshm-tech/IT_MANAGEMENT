/**
 * Per-key request limit.
 *
 * In process memory, like the login throttle and the public form's: one instance
 * is exact, several instances are approximate. That is honest for a limit whose
 * job is to stop a runaway script, not to bill anybody — the plan's phase 3
 * moves it to Redis when the API is opened to third parties.
 */

export const API_RATE_LIMIT = 120;
export const API_RATE_WINDOW_MS = 60_000;

const globalForLimit = globalThis as unknown as {
  __taskTornadoApiLimit?: Map<string, number[]>;
};

function buckets(): Map<string, number[]> {
  if (!globalForLimit.__taskTornadoApiLimit) {
    globalForLimit.__taskTornadoApiLimit = new Map();
  }
  return globalForLimit.__taskTornadoApiLimit;
}

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the oldest request in the window falls out. */
  resetSeconds: number;
};

export function checkApiRateLimit(keyId: string, now = Date.now()): RateLimitResult {
  const store = buckets();
  const windowStart = now - API_RATE_WINDOW_MS;
  const hits = (store.get(keyId) ?? []).filter((at) => at > windowStart);

  if (hits.length >= API_RATE_LIMIT) {
    store.set(keyId, hits);
    return {
      allowed: false,
      limit: API_RATE_LIMIT,
      remaining: 0,
      resetSeconds: Math.max(1, Math.ceil((hits[0] + API_RATE_WINDOW_MS - now) / 1000)),
    };
  }

  hits.push(now);
  store.set(keyId, hits);
  return {
    allowed: true,
    limit: API_RATE_LIMIT,
    remaining: API_RATE_LIMIT - hits.length,
    resetSeconds: Math.ceil(API_RATE_WINDOW_MS / 1000),
  };
}

/** Tests need a clean window; nothing in the app calls this. */
export function resetApiRateLimit(): void {
  buckets().clear();
}
