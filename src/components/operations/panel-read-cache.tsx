"use client";
import { createContext, useContext, useMemo, useCallback, useState, type ReactNode } from "react";
import { createClientReadCache } from "@/lib/client-read-cache";

type Cache<T> = ReturnType<typeof createClientReadCache<T>>;
type Registry = Map<string, Cache<unknown>>;
const Context = createContext<Registry | null>(null);
/** Mounted inside the account/store/module/permission-keyed OperationScope. No persisted data. */
export function PanelReadProvider({children}: {children?: ReactNode}) {
  const [registry] = useState<Registry>(() => new Map());
  return <Context.Provider value={registry}>{children}</Context.Provider>;
}
/** scopeVersion includes any alternate store, permission or server-row revision used by the loader. */
export function usePanelReadCache<T>(namespace: string, fetcher: (key: string) => Promise<T>, scopeVersion = "", ttlMs = 15_000) {
  const shared = useContext(Context);
  const [fallback] = useState<Registry>(() => new Map());
  const registry = shared ?? fallback;
  return useMemo(() => {
    const key = JSON.stringify([namespace, scopeVersion, ttlMs]);
    const existing = registry.get(key);
    if (existing) return existing as Cache<T>;
    const cache = createClientReadCache<T>(fetcher, {
      ttlMs,
      shouldCache: value => !(value && typeof value === "object" && "success" in value && value.success === false),
    });
    // Bound resource namespaces/revisions as well as each resource's entries.
    if (registry.size >= 50) registry.delete(registry.keys().next().value!);
    registry.set(key, cache as Cache<unknown>);
    return cache;
  }, [registry, namespace, scopeVersion, ttlMs, fetcher]);
}

/** All captured scope values must be included in scopeVersion. Live balances and slots use ttlMs=0. */
export function usePanelReader<Args extends unknown[], T>(
  namespace: string, fetcher: (...args: Args) => Promise<T>, scopeVersion = "", ttlMs = 0,
) {
  const decode = useCallback((key: string) => fetcher(...JSON.parse(key) as Args), [fetcher]);
  const cache = usePanelReadCache(namespace, decode, scopeVersion, ttlMs);
  return useMemo(() => ({
    read: (...args: Args) => cache.load(JSON.stringify(args)),
    prefetch: (...args: Args) => cache.prefetch(JSON.stringify(args)),
    invalidate: (...args: Args) => cache.invalidate(JSON.stringify(args)),
    clear: cache.clear,
  }), [cache]);
}
