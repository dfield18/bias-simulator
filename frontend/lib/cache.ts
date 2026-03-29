/**
 * Simple in-memory client-side cache.
 * Data persists across tab switches and React re-renders within the same browser session.
 * Cache is cleared on page refresh or when manually invalidated.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes

export function getCached<T>(key: string, ttl: number = DEFAULT_TTL): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T): void {
  store.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/**
 * Fetch with cache. Returns cached data if available, otherwise fetches and caches.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
): Promise<T> {
  const cached = getCached<T>(key, ttl);
  if (cached !== null) return cached;
  const data = await fetcher();
  if (data !== null && data !== undefined) {
    setCache(key, data);
  }
  return data;
}
