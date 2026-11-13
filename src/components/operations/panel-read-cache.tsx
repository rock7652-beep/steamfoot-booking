"use client";
import { createContext, useContext, useMemo, useCallback, useState, useEffect, useTransition, type ReactNode } from "react";
import {MUSIC_PURCHASE_START,MUSIC_PURCHASE_APPLY, createPurchaseSnapshotSeeds, type MusicPurchaseSnapshot, type PurchaseSnapshotReceiver} from "@/lib/music-purchase-snapshot";
import {musicPanelRead} from "@/lib/music-panel-transport";
import {createCustomerReadQueue} from "@/lib/customer-read-queue";
import { createClientReadCache } from "@/lib/client-read-cache";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isMusicPreviewPage, isMusicSyncRoute, subscribeMusicFinanceChange } from "@/lib/music-finance-sync";

const CustomerReadQueue=createContext<ReturnType<typeof createCustomerReadQueue>|null>(null);
export function useCustomerReadQueue(){const shared=useContext(CustomerReadQueue);const [fallback]=useState(createCustomerReadQueue);return shared??fallback;}
const MusicRevision = createContext(0);
export const useMusicDataRevision = () => useContext(MusicRevision);

type Cache<T> = ReturnType<typeof createClientReadCache<T>>;
type Registry = Map<string, Cache<unknown>>;
const Context = createContext<Registry | null>(null);
const customerPlanNamespaces = new Set(['customer-support','store-member-connection','course-phone-connection','music-student-makeups','steamfoot-customer-context','module-customer-support','course-roster-customer','course-customer-next','module-customer-next','course-card-progress','course-card-browse','module-card-browse','course-card','module-card','music-periods','music-student-workspace','purchases','beauty-customer-detail','beauty-card-progress','customer-primary-snapshot','module-primary-snapshot']);
function clearCustomerPlanReads(registry: Registry) {
  for (const [key, cache] of registry) {
    if (customerPlanNamespaces.has(JSON.parse(key)[0])) cache.clear();
  }
}
/** Clear every revision, including caches retained after a customer panel closes. */
export function useInvalidateCustomerPlanReads() {
  const registry = useContext(Context);
  const queue=useCustomerReadQueue();
  return useCallback(() => {queue.clear();if (registry) clearCustomerPlanReads(registry); }, [registry,queue]);
}
const PurchaseSeeds = createContext<ReturnType<typeof createPurchaseSnapshotSeeds> | null>(null);
/** Mounted inside the account/store/module/permission-keyed OperationScope. No persisted data. */
export function PanelReadProvider({children}: {children?: ReactNode}) {
  const [registry] = useState<Registry>(() => new Map());
  const [customerQueue]=useState(createCustomerReadQueue);
  const [purchaseSeeds] = useState(createPurchaseSnapshotSeeds);
  const [revision, setRevision] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const studentPage = pathname?.endsWith("/dashboard/courses") && searchParams.get("view")==="customers";
  useEffect(() => {
    const invalidate = () => {customerQueue.clear();clearCustomerPlanReads(registry);};
    window.addEventListener('customer-search-invalidated', invalidate);
    return () => window.removeEventListener('customer-search-invalidated', invalidate);
  }, [registry,customerQueue]);
  useEffect(() => {
    if (!isMusicSyncRoute(pathname)) return;
    let active = true, epoch = 0, deferredRosterRefresh=false;
    let incoming: MusicPurchaseSnapshot | null = null;
    const beginPurchase = (event: Event) => {
      const capturedEpoch = ++epoch;
      incoming = null;
      purchaseSeeds.clear();
      (event as CustomEvent<PurchaseSnapshotReceiver>).detail.accept = snapshot => {
        if (active && capturedEpoch === epoch && studentPage) incoming = snapshot;
      };
    };
    window.addEventListener(MUSIC_PURCHASE_START, beginPurchase);
    const applyFinanceChange = (kind:import('@/lib/music-finance-sync').MusicFinanceChange, context?:import('@/lib/music-finance-sync').MusicFinanceContext) => {
        epoch++;
        const snapshot = kind === "purchase" ? incoming : null;
        incoming = null;
        purchaseSeeds.clear();
        // A receipt does not change cards, bookings or student balances.
        // The mounted payment list subscribes directly; other views retain their normal refresh.
        if(kind === "receipt" && studentPage) return;
        customerQueue.clear();
        for (const cache of registry.values()) cache.clear();
        registry.clear();
        // Keep the open roster's authoritative write response mounted. Other
        // tabs still invalidate normally. A local commit with a calendar owner
        // already refreshes that calendar; external changes still defer to close.
        if(document.querySelector('[data-live-music-roster="true"]')){
          if(!context?.calendarRefreshOwned)deferredRosterRefresh=true;
          return;
        }
        if (snapshot) purchaseSeeds.install(snapshot);
        setRevision(value => value + 1);
        window.dispatchEvent(new Event("customer-search-invalidated"));
        // Purchase panels and the music customer list re-read their own authoritative data.
        if(kind === "purchase" && studentPage) return;
        startTransition(() => router.refresh());
    };
    const applyProjection=()=>applyFinanceChange('purchase');
    const rosterClosed=()=>queueMicrotask(()=>{
      if(active&&deferredRosterRefresh&&!document.querySelector('[data-live-music-roster="true"]')){
        deferredRosterRefresh=false;setRevision(value=>value+1);startTransition(()=>router.refresh());
      }
    });
    window.addEventListener('music-roster-closed',rosterClosed);
    window.addEventListener(MUSIC_PURCHASE_APPLY,applyProjection);
    const unsubscribe=isMusicPreviewPage()?subscribeMusicFinanceChange(applyFinanceChange):()=>{};
    return () => {
      active = false;
      incoming = null;
      purchaseSeeds.clear();
      window.removeEventListener(MUSIC_PURCHASE_START, beginPurchase);
      window.removeEventListener(MUSIC_PURCHASE_APPLY,applyProjection);
      window.removeEventListener('music-roster-closed',rosterClosed);
      unsubscribe();
    };
  }, [pathname, studentPage, registry, router, purchaseSeeds,customerQueue]);
  return <CustomerReadQueue.Provider value={customerQueue}><Context.Provider value={registry}><PurchaseSeeds.Provider value={purchaseSeeds}><MusicRevision.Provider value={revision}>
    {revision > 0 && isMusicSyncRoute(pathname) && <p role="status" className="px-3 text-sm text-earth-600">{pending ? "同步教務資料中…" : "教務資料已同步"}</p>}
    {children}
  </MusicRevision.Provider></PurchaseSeeds.Provider></Context.Provider></CustomerReadQueue.Provider>;
}
/** scopeVersion includes any alternate store, permission or server-row revision used by the loader. */
export function usePanelReadCache<T>(namespace: string, fetcher: (key: string) => Promise<T>, scopeVersion = "", ttlMs = 15_000, maxEntries = 50) {
  const shared = useContext(Context);
  const revision = useMusicDataRevision();
  const [fallback] = useState<Registry>(() => new Map());
  const registry = shared ?? fallback;
  return useMemo(() => {
    const key = JSON.stringify([namespace, scopeVersion, ttlMs, maxEntries, revision]);
    const existing = registry.get(key);
    if (existing) return existing as Cache<T>;
    const cache = createClientReadCache<T>(fetcher, {
      ttlMs, maxEntries,
      shouldCache: value => !(value && typeof value === "object" && "success" in value && value.success === false),
    });
    // Bound resource namespaces/revisions as well as each resource's entries.
    if (registry.size >= 50) registry.delete(registry.keys().next().value!);
    registry.set(key, cache as Cache<unknown>);
    return cache;
  }, [registry, namespace, scopeVersion, ttlMs, maxEntries, fetcher, revision]);
}

/** All captured scope values must be included in scopeVersion. Live balances and slots use ttlMs=0. */
export function usePanelReader<Args extends unknown[], T>(
  namespace: string, fetcher: (...args: Args) => Promise<T>, scopeVersion = "", ttlMs = 0, maxEntries = 50,
) {
  const seeds = useContext(PurchaseSeeds);
  const decode = useCallback((key: string) => {
    const args=JSON.parse(key) as Args;
    const seedScope=!scopeVersion||(namespace==='course-card-browse'&&/^\d+$/.test(scopeVersion));
    const supplied = seedScope && ttlMs === 0 ? seeds?.take(namespace,args) : undefined;
    if (supplied !== undefined) {
      console.info("[music-purchase-snapshot]", namespace);
      return Promise.resolve(supplied as T);
    }
    return musicPanelRead(namespace,args,()=>fetcher(...args));
  }, [fetcher,namespace,seeds,scopeVersion,ttlMs]);
  const cache = usePanelReadCache(namespace, decode, scopeVersion, ttlMs, maxEntries);
  return useMemo(() => ({
    read: (...args: Args) => cache.load(JSON.stringify(args)),
    peek: (...args: Args) => cache.peek(JSON.stringify(args)),
    snapshot: (...args: Args) => cache.snapshot(JSON.stringify(args)),
    get: (...args: Args) => cache.get(JSON.stringify(args)),
    refresh: (...args: Args) => cache.load(JSON.stringify(args), {revalidate:true}),
    seed(value: T, ...args: Args) { cache.seed(JSON.stringify(args), value); },
    prefetch: (...args: Args) => cache.prefetch(JSON.stringify(args)),
    invalidate: (...args: Args) => cache.invalidate(JSON.stringify(args)),
    clear: cache.clear,
    generation: cache.generation,
  }), [cache]);
}
