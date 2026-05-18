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
import { resolveBookableUntilDate, DEFAULT_BOOKABLE_DAYS_AHEAD } from "@/lib/shop-config";
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
