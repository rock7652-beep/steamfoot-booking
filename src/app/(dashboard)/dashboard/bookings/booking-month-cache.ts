/** Per mounted account/store boundary; never persisted or shared between users. */
export function createBookingMonthCache<T>(limit = 5) {
  const entries = new Map<string, T>();
  const pending = new Map<string, Promise<T>>();
  let generation = 0;
  return {
    get generation() { return generation; },
    get(key: string) { return entries.get(key); },
    put(key: string, value: T) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > limit) entries.delete(entries.keys().next().value!);
    },
    invalidate() { generation++; entries.clear(); pending.clear(); },
    load(key: string, loader: () => Promise<T>): Promise<T> {
      const existing = pending.get(key);
      if (existing) return existing;
      const epoch = generation;
      const request = loader().then(value => {
        if (epoch === generation) this.put(key, value);
        return value;
      }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
      pending.set(key, request);
      return request;
    },
  };
}
