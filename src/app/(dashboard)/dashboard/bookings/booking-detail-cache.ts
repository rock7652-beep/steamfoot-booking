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
  fetchBookingDetail,
  type BookingDrawerPayload,
} from "@/server/actions/booking-drawer";

export interface BookingDetailCache {
  /** 同步取得已快取的完整 payload（無則 undefined）。 */
  get(id: string): BookingDrawerPayload | undefined;
  /** 失效某筆：清掉 cache + in-flight 去重 handle，並讓「進行中的舊請求」不再寫回。 */
  invalidate(id: string): void;
  /**
   * 載入某筆 detail（去重 + 寫入 cache）。並發呼叫共用同一個 in-flight promise；
   * 只有「仍是當前 in-flight」的那個請求會 commit 到 cache —— 被 invalidate /
   * 被新請求取代的舊請求 resolve 後一律不寫入（避免過期資料覆蓋）。
   */
  load(id: string): Promise<BookingDrawerPayload>;
}

export function createBookingDetailCache(): BookingDetailCache {
  const cache = new Map<string, BookingDrawerPayload>();
  const inflight = new Map<string, Promise<BookingDrawerPayload>>();

  return {
    get(id) {
      return cache.get(id);
    },
    invalidate(id) {
      cache.delete(id);
      // 丟掉去重 handle → 下次 load() 會重新發；同時讓還在路上的舊請求
      // 在 resolve 時 `inflight.get(id) !== p` 而跳過 commit（不覆蓋新資料）。
      inflight.delete(id);
    },
    load(id) {
      const existing = inflight.get(id);
      if (existing) return existing;

      const p = fetchBookingDetail(id).then(
        (payload) => {
          // 只有仍是當前 in-flight 才寫入 cache（被 invalidate/取代則跳過）。
          if (inflight.get(id) === p) {
            cache.set(id, payload);
            inflight.delete(id);
          }
          return payload;
        },
        (err) => {
          if (inflight.get(id) === p) inflight.delete(id);
          throw err;
        },
      );
      inflight.set(id, p);
      return p;
    },
  };
}
