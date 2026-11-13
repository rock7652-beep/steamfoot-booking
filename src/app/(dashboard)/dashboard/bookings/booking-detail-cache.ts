/**
 * Client-side cache for booking detail payloads (PR-Frontend：抽屜快速顯示).
 *
 * 目的：店長在「預約管理」連續點不同 booking 的「查看」時，
 *   1. 同一筆第二次打開 → 先秒顯示上次的完整 payload，再背景 revalidate（SWR）。
 *   2. 同一 id 並發載入 → 只打一次 server action（in-flight 去重）。
 *   3. 收款 / 完成 / 改時間 / 取消 / 調整結帳等 mutation 後 → invalidate，
 *      下次載入一定重抓，且「失效前還在路上的舊請求」不會把過期資料寫回 cache。
 *
 * 純前端顯示層快取：不改 server action、不改 schema、不碰金流/方案/Cashbook/LINE。
 * Cache 只是「更快顯示已可由 server 取得的資料」，不是新的資料真相來源；
 * 所有會改資料的操作仍只依賴 authoritative payload（見 booking-detail-drawer）。
 */

import {
  type BookingDrawerPayload,
} from "@/server/actions/booking-drawer";
import { createClientReadCache } from "@/lib/client-read-cache";
import { createCustomerReadQueue } from "@/lib/customer-read-queue";
import { readBookingDetail } from "@/lib/booking-client-transport";

export interface BookingDetailCache {
  /** 同步取得已快取的完整 payload（無則 undefined）。 */
  get(id: string): BookingDrawerPayload | undefined;
  getFresh(id: string): BookingDrawerPayload | undefined;
  /** 失效某筆：清掉 cache + in-flight 去重 handle，並讓「進行中的舊請求」不再寫回。 */
  invalidate(id: string): void;
  /**
   * 載入某筆 detail（去重 + 寫入 cache）。並發呼叫共用同一個 in-flight promise；
   * 只有「仍是當前 in-flight」的那個請求會 commit 到 cache —— 被 invalidate /
   * 被新請求取代的舊請求 resolve 後一律不寫入（避免過期資料覆蓋）。
   */
  load(id: string): Promise<BookingDrawerPayload>;
  /** Fresh display prefetch; intent can promote a waiting background job. */
  prefetch(id: string, intent?: boolean): Promise<BookingDrawerPayload>;
  cancelPrefetch(ids: string[]): void;
}

export function createBookingDetailCache(resolvedStoreId?: string, queue = createCustomerReadQueue()): BookingDetailCache {
  const cache = createClientReadCache(id => readBookingDetail(id, resolvedStoreId));
  const revisions = new Map<string, number>();
  // Instance ownership prevents a sibling drawer from sharing a different cache's job.
  const owner = crypto.randomUUID();
  const key = (id: string) => JSON.stringify(["booking-detail", resolvedStoreId, owner, id, revisions.get(id) ?? 0]);
  function read(id: string, foreground: boolean, revalidate: boolean) {
    const revision = revisions.get(id) ?? 0;
    return queue.read(key(id), () => {
      if ((revisions.get(id) ?? 0) !== revision) throw new Error("預約資料已更新");
      return cache.load(id, {revalidate});
    }, foreground);
  }
  return {
    get: cache.peek,
    getFresh: cache.get,
    invalidate(id) {
      queue.cancel(key(id));
      revisions.set(id, (revisions.get(id) ?? 0) + 1);
      cache.invalidate(id);
    },
    load: id => read(id, true, true),
    prefetch(id, intent = false) {
      const fresh = cache.get(id);
      return fresh ? Promise.resolve(fresh) : read(id, intent, false);
    },
    cancelPrefetch(ids) { for (const id of ids) queue.cancel(key(id)); },
  };
}
