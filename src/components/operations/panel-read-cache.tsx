"use client";
import { createContext, useContext, useMemo, useCallback, useState, useEffect, useTransition, type ReactNode } from "react";
import {musicPanelRead} from "@/lib/music-panel-transport";
import { createClientReadCache } from "@/lib/client-read-cache";

import { usePathname, useRouter } from "next/navigation";
import { isMusicPreviewPage, isMusicSyncRoute, subscribeMusicFinanceChange } from "@/lib/music-finance-sync";

const MusicRevision = createContext(0);
export const useMusicDataRevision = () => useContext(MusicRevision);

type Cache<T> = ReturnType<typeof createClientReadCache<T>>;
type Registry = Map<string, Cache<unknown>>;
const Context = createContext<Registry | null>(null);
/** Mounted inside the account/store/module/permission-keyed OperationScope. No persisted data. */
export function PanelReadProvider({children}: {children?: ReactNode}) {
  const [registry] = useState<Registry>(() => new Map());
  const [revision, setRevision] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!isMusicPreviewPage() || !isMusicSyncRoute(pathname)) return;
    const unsubscribe = subscribeMusicFinanceChange((kind) => {
        for (const cache of registry.values()) cache.clear();
        registry.clear();
        setRevision(value => value + 1);
        window.dispatchEvent(new Event("customer-search-invalidated"));
        if (kind !== "receipt" || !pathname?.includes("/dashboard/courses")) startTransition(() => router.refresh());
    });
    return unsubscribe;
  }, [pathname, registry, router]);
  return <Context.Provider value={registry}><MusicRevision.Provider value={revision}>
    {revision > 0 && isMusicSyncRoute(pathname) && <p role="status" className="px-3 text-sm text-earth-600">{pending ? "同步教務資料中…" : "教務資料已同步"}</p>}
    {children}
  </MusicRevision.Provider></Context.Provider>;
}
/** scopeVersion includes any alternate store, permission or server-row revision used by the loader. */
export function usePanelReadCache<T>(namespace: string, fetcher: (key: string) => Promise<T>, scopeVersion = "", ttlMs = 15_000) {
  const shared = useContext(Context);
  const revision = useMusicDataRevision();
  const [fallback] = useState<Registry>(() => new Map());
  const registry = shared ?? fallback;
  return useMemo(() => {
    const key = JSON.stringify([namespace, scopeVersion, ttlMs, revision]);
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
  }, [registry, namespace, scopeVersion, ttlMs, fetcher, revision]);
}

/** All captured scope values must be included in scopeVersion. Live balances and slots use ttlMs=0. */
export function usePanelReader<Args extends unknown[], T>(
  namespace: string, fetcher: (...args: Args) => Promise<T>, scopeVersion = "", ttlMs = 0,
) {
  const decode = useCallback((key: string) => {const args=JSON.parse(key) as Args;return musicPanelRead(namespace,args,()=>fetcher(...args));}, [fetcher,namespace]);
  const cache = usePanelReadCache(namespace, decode, scopeVersion, ttlMs);
  return useMemo(() => ({
    read: (...args: Args) => cache.load(JSON.stringify(args)),
    prefetch: (...args: Args) => cache.prefetch(JSON.stringify(args)),
    invalidate: (...args: Args) => cache.invalidate(JSON.stringify(args)),
    clear: cache.clear,
  }), [cache]);
}
