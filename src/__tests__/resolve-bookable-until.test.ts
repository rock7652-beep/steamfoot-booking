/**
 * PR-1 次月預約開放控管 — resolveBookableUntilDate
 *
 * 規則：
 *   - 店家有設 ShopConfig.bookableUntilDate → 用該日期（含當日）
 *   - 未設（null/undefined）→ 今天（台灣時間）+14 天
 *   - @db.Date 讀出為 UTC midnight，輸出 "YYYY-MM-DD"
 *
 * gate 比較為字串比較（年代順序），含當日：僅 bookingDate > 結果 才擋。
 */

import { describe, it, expect } from "vitest";
import { enumerateBookableDates } from "@/lib/bookable-window";
import {
  resolveBookableUntilDate,
  DEFAULT_BOOKABLE_DAYS_AHEAD,
  isCustomerSlotWithinBookingWindow,
  resolveCustomerBookingWindow,
} from "@/lib/shop-config";
import { addTaiwanDuration, toLocalDateStr } from "@/lib/date-utils";

describe("resolveBookableUntilDate — 店家有設定", () => {
  it("回傳設定日期（@db.Date UTC midnight → YYYY-MM-DD）", () => {
    const set = new Date("2026-06-15T00:00:00.000Z");
    expect(resolveBookableUntilDate(set)).toBe("2026-06-15");
  });

  it("含當日語意：設定 6/15，6/15 不超過、6/16 超過", () => {
    const until = resolveBookableUntilDate(new Date("2026-06-15T00:00:00.000Z"));
    // gate: data.bookingDate > until 才擋
    expect("2026-06-15" > until).toBe(false); // 當日允許
    expect("2026-06-16" > until).toBe(true); // 隔日擋
  });
});

describe("resolveBookableUntilDate — 未設定 → 預設 +14 天", () => {
  it("null → 今天台灣時間 +14 天", () => {
    const expected = addTaiwanDuration(toLocalDateStr(), DEFAULT_BOOKABLE_DAYS_AHEAD, "DAY");
    expect(resolveBookableUntilDate(null)).toBe(expected);
  });

  it("undefined → 與 null 同（預設 +14 天）", () => {
    expect(resolveBookableUntilDate(undefined)).toBe(resolveBookableUntilDate(null));
  });

  it("DEFAULT_BOOKABLE_DAYS_AHEAD 為 14", () => {
    expect(DEFAULT_BOOKABLE_DAYS_AHEAD).toBe(14);
  });
});

describe("enumerateBookableDates — 後台日期清單", () => {
  it("today=2026-06-29 且開放到 2026-07-31 時，包含 7/31 且不包含 8/1", () => {
    const days = enumerateBookableDates("2026-06-29", "2026-07-31");

    expect(days[0]).toBe("2026-06-29");
    expect(days).toContain("2026-07-31");
    expect(days).not.toContain("2026-08-01");
  });
});

describe("新版顧客預約範圍 — 精確24小時滾動", () => {
  const now = new Date("2026-08-21T08:00:00.000Z"); // 台灣 8/21 16:00

  it("14天後同一時間可預約，超過一分鐘不可預約", () => {
    const config = { bookingWindowDays: 14 };
    expect(isCustomerSlotWithinBookingWindow("2026-09-04", "16:00", config, now)).toBe(true);
    expect(isCustomerSlotWithinBookingWindow("2026-09-04", "16:01", config, now)).toBe(false);
  });

  it("尚未到指定開放時間時不顯示任何時段", () => {
    const config = { bookingOpensAt: new Date("2026-08-22T02:00:00.000Z"), bookingWindowDays: 14 };
    expect(isCustomerSlotWithinBookingWindow("2026-08-23", "10:00", config, now)).toBe(false);
  });

  it("舊的固定截止日期仍保留到店長主動切換新版", () => {
    const window = resolveCustomerBookingWindow(
      { bookableUntilDate: new Date("2026-08-31T00:00:00.000Z"), bookingWindowDays: 7 },
      now,
    );
    expect(window.closesAt.toISOString()).toBe("2026-08-31T15:59:59.999Z");
    expect(window.days).toBeNull();
  });
});
