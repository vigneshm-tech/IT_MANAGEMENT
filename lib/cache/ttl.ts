/**
 * Tiny in-process TTL cache.
 *
 * The workspace talks to three remote systems (Supabase, Action1, Redmine) on
 * every module load. Supabase queries are one round trip; Action1 needs a token,
 * an organization lookup and up to four inventory pages, so a cold Servers page
 * could spend most of a minute in HTTP calls — and because the module navigation
 * re-renders the page server-side each time, that cost was paid *every* switch.
 *
 * Vercel keeps function instances warm (Fluid compute), so a short-lived cache
 * on the instance removes almost all of that. Entries are keyed by plain strings
 * and only successful reads are cached; anything that fails is retried at once.
 */

type Entry = { value: unknown; expiresAt: number };

const globalForCache = globalThis as unknown as { __taskTornadoCache?: Map<string, Entry> };

/** Enough for every page's keys; the map is pruned as it grows. */
const MAX_ENTRIES = 400;

function store(): Map<string, Entry> {
  if (!globalForCache.__taskTornadoCache) {
    globalForCache.__taskTornadoCache = new Map();
  }
  return globalForCache.__taskTornadoCache;
}

export function readCache<T>(key: string): T | undefined {
  const entry = store().get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store().delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function writeCache(key: string, value: unknown, ttlMs: number): void {
  const entries = store();

  if (entries.size >= MAX_ENTRIES) {
    // Drop expired first; if everything is fresh, drop the oldest insertion.
    for (const [entryKey, entry] of entries) {
      if (entry.expiresAt <= Date.now()) entries.delete(entryKey);
    }
    if (entries.size >= MAX_ENTRIES) {
      const oldest = entries.keys().next();
      if (!oldest.done) entries.delete(oldest.value);
    }
  }

  entries.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Removes every entry whose key starts with `prefix` (a connection changed). */
export function clearCache(prefix: string): void {
  for (const key of store().keys()) {
    if (key.startsWith(prefix)) store().delete(key);
  }
}

/**
 * Read-through helper. `load` may return `null` to mean "nothing usable" — those
 * results are not cached, so a connection that comes back to life is picked up
 * on the next attempt.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T | null>,
): Promise<T | null> {
  const hit = readCache<T>(key);
  if (hit !== undefined) return hit;

  const value = await load();
  if (value !== null) writeCache(key, value, ttlMs);
  return value;
}
