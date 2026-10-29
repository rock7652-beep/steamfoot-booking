import type { readMusicStudentWorkspace } from "@/server/queries/music-student-workspace";
import type { readCourseCards } from "@/server/queries/course-card-browser";

export type MusicPurchaseSnapshot = {
  customerId: string;
  overview?: Extract<Awaited<ReturnType<typeof readMusicStudentWorkspace>>, {success: true}>;
  cards?: Extract<Awaited<ReturnType<typeof readCourseCards>>, {success: true}>;
  periods?:Extract<Awaited<ReturnType<typeof import('@/server/actions/music-periods').loadMusicPeriods>>,{success:true}>;
  purchases?:Extract<Awaited<ReturnType<typeof import('@/server/actions/course-customer-history').loadCourseCustomerPurchases>>,{success:true}>;
};
export const MUSIC_PURCHASE_START = "music-preview:purchase-start";
export const MUSIC_PURCHASE_APPLY = 'course:purchase-projection';
export type PurchaseSnapshotReceiver = { accept?: (snapshot: MusicPurchaseSnapshot) => void };

/** Synchronous, same-window handoff. Never send this data to storage or BroadcastChannel. */
export function capturePurchaseSnapshotReceiver() {
  if (typeof window === "undefined") return undefined;
  const receiver: PurchaseSnapshotReceiver = {};
  window.dispatchEvent(new CustomEvent(MUSIC_PURCHASE_START, {detail: receiver}));
  return receiver.accept;
}

/** Only exact unfiltered operational reads can consume this projection. */
export function purchaseSnapshotKey(namespace: string, args: unknown[]): string | null {
  if(namespace==='music-periods'&&args.length===1&&typeof args[0]==='string')return `periods:${args[0]}`;
  if(namespace==='purchases'&&typeof args[0]==='string'&&(args[1]===undefined||args[1]===0)&&args[2]===undefined)return `purchases:${args[0]}`;
  if (namespace === "music-student-workspace" && typeof args[0] === "string" && args[1] === false)
    return `overview:${args[0]}`;
  if (!["course-card","course-card-browse"].includes(namespace) || args.length !== 1 || !args[0] || typeof args[0] !== "object") return null;
  const value = args[0] as Record<string, unknown>;
  if (Object.keys(value).some(key => !["customerId", "dataScope", "search", "history", "page"].includes(key)) ||
      typeof value.customerId !== "string" || (value.dataScope && value.dataScope !== "operational") ||
      (value.search !== undefined && value.search !== "") || (value.history !== undefined && value.history !== false) ||
      (value.page !== undefined && value.page !== 0)) return null;
  return `cards:${value.customerId}`;
}

/** One-use authoritative mutation result, scoped to the mounted permission/store provider. */
export function createPurchaseSnapshotSeeds() {
  const entries = new Map<string, {value: unknown; expires: number}>();
  return {
    clear() { entries.clear(); },
    install(snapshot: MusicPurchaseSnapshot) {
      entries.clear();
      const expires = Date.now() + 1500;
      if(snapshot.overview)entries.set(`overview:${snapshot.customerId}`, {value: snapshot.overview, expires});
      if(snapshot.cards)entries.set(`cards:${snapshot.customerId}`, {value: snapshot.cards, expires});
      if(snapshot.periods)entries.set(`periods:${snapshot.customerId}`,{value:snapshot.periods,expires});
      if(snapshot.purchases)entries.set(`purchases:${snapshot.customerId}`,{value:snapshot.purchases,expires});
    },
    take(namespace: string, args: unknown[]) {
      const key = purchaseSnapshotKey(namespace, args);
      if (!key) return undefined;
      const entry = entries.get(key);
      entries.delete(key);
      return entry && entry.expires > Date.now() ? entry.value : undefined;
    },
  };
}
