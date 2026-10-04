/** Component-owned read cache: bounded lifetime, in-flight deduplication and safe invalidation.
 * Never share an instance across authenticated users or stores, or persist it to storage.
 */
export function createClientReadCache<T>(
  fetcher: (key: string) => Promise<T>,
  { ttlMs = 15_000, maxEntries = 50, staleMs = 60_000, shouldCache = () => true }: { ttlMs?: number; maxEntries?: number; staleMs?: number; shouldCache?: (value: T) => boolean } = {},
) {
  const entries = new Map<string, { value: T; expiresAt: number }>();
  const pending = new Map<string, Promise<T>>();
  function get(key: string): T | undefined {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      return undefined;
    }
    return entry.value;
  }
  function load(key: string, { revalidate = false }: { revalidate?: boolean } = {}): Promise<T> {
    const cached = revalidate ? undefined : get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const existing = pending.get(key);
    if (existing) return existing;
    // Normalize synchronous throws, too. Only the current request may populate the cache.
    const request = Promise.resolve().then(() => fetcher(key)).then((value) => {
      if (pending.get(key) === request) {
        entries.delete(key);
        if (shouldCache(value)) entries.set(key, { value, expiresAt: Date.now() + ttlMs });
        if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
        pending.delete(key);
      }
      return value;
    }, (error: unknown) => {
      if (pending.get(key) === request) pending.delete(key);
      throw error;
    });
    pending.set(key, request);
    return request;
  }
  return {
    get,
    load,
    peek(key: string): T | undefined {
      const entry = entries.get(key);
      if (!entry || entry.expiresAt + staleMs <= Date.now()) return undefined;
      return entry.value;
    },
    prefetch(key: string) { void load(key).catch(() => {}); },
    invalidate(key: string) {
      entries.delete(key);
      pending.delete(key);
    },
    clear() {
      entries.clear();
      pending.clear();
    },
  };
}
