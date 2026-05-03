/**
 * 台灣日期 + 期間計算 helper：
 *   - addTaiwanDuration(baseDateStr, value, unit)
 *   - parseTaiwanDateToDbDate(dateStr)
 *
 * 規則：
 *   - 全程以「台灣 YYYY-MM-DD」字串為輸入/輸出
 *   - DAY / WEEK：UTC 整數加減
 *   - MONTH：clamp 到目標月份末日（1/31 + 1月 → 2/28）
 *   - parseTaiwanDateToDbDate：寫入 @db.Date 用，回傳 UTC midnight
 */

import { describe, it, expect } from "vitest";
import {
  addTaiwanDuration,
  parseTaiwanDateToDbDate,
} from "@/lib/date-utils";

describe("addTaiwanDuration — DAY", () => {
  it("加 30 天", () => {
    expect(addTaiwanDuration("2026-05-03", 30, "DAY")).toBe("2026-06-02");
  });

  it("加 1 天 跨月", () => {
    expect(addTaiwanDuration("2026-04-30", 1, "DAY")).toBe("2026-05-01");
  });

  it("加 365 天 跨年", () => {
    expect(addTaiwanDuration("2026-01-01", 365, "DAY")).toBe("2027-01-01");
  });

  it("加 0 天 = 同日", () => {
    expect(addTaiwanDuration("2026-05-03", 0, "DAY")).toBe("2026-05-03");
  });
});

describe("addTaiwanDuration — WEEK", () => {
  it("加 1 週 = 7 天", () => {
    expect(addTaiwanDuration("2026-05-03", 1, "WEEK")).toBe("2026-05-10");
  });

  it("加 8 週", () => {
    expect(addTaiwanDuration("2026-05-03", 8, "WEEK")).toBe("2026-06-28");
  });
});

describe("addTaiwanDuration — MONTH", () => {
  it("加 1 月 一般情況", () => {
    expect(addTaiwanDuration("2026-05-03", 1, "MONTH")).toBe("2026-06-03");
  });

  it("加 6 月", () => {
    expect(addTaiwanDuration("2026-05-03", 6, "MONTH")).toBe("2026-11-03");
  });

  it("加 12 月 = 隔年同日", () => {
    expect(addTaiwanDuration("2026-05-03", 12, "MONTH")).toBe("2027-05-03");
  });

  it("月底 clamp：1/31 + 1月 → 2/28（非閏年）", () => {
    expect(addTaiwanDuration("2026-01-31", 1, "MONTH")).toBe("2026-02-28");
  });

  it("月底 clamp：1/31 + 1月 → 2/29（閏年 2028）", () => {
    expect(addTaiwanDuration("2028-01-31", 1, "MONTH")).toBe("2028-02-29");
  });

  it("月底 clamp：3/31 + 1月 → 4/30", () => {
    expect(addTaiwanDuration("2026-03-31", 1, "MONTH")).toBe("2026-04-30");
  });

  it("月底 clamp：5/31 + 3月 → 8/31（目標月份有 31）", () => {
    expect(addTaiwanDuration("2026-05-31", 3, "MONTH")).toBe("2026-08-31");
  });

  it("跨年：11/15 + 3月 → 隔年 2/15", () => {
    expect(addTaiwanDuration("2026-11-15", 3, "MONTH")).toBe("2027-02-15");
  });
});

describe("parseTaiwanDateToDbDate", () => {
  it("輸入 YYYY-MM-DD → 回傳 UTC midnight Date", () => {
    const d = parseTaiwanDateToDbDate("2026-07-15");
    expect(d.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("輸出 Date 在台灣時區仍代表同一天（不會少 1 天）", () => {
    // 模擬「店長台灣輸入 7/15 → 寫入 DB → 讀回轉成 YYYY-MM-DD」沒有偏移
    const d = parseTaiwanDateToDbDate("2026-07-15");
    // 在 @db.Date 語意下，回讀時 .toISOString().slice(0, 10) 必為 "2026-07-15"
    expect(d.toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("月初 / 月末邊界", () => {
    expect(parseTaiwanDateToDbDate("2026-01-01").toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(parseTaiwanDateToDbDate("2026-12-31").toISOString()).toBe(
      "2026-12-31T00:00:00.000Z",
    );
  });
});

describe("整合：addTaiwanDuration → parseTaiwanDateToDbDate", () => {
  it("PLAN_DEFAULT 90 天從 5/3 出發 → DB 寫入 2026-08-01", () => {
    const expiryStr = addTaiwanDuration("2026-05-03", 90, "DAY");
    const dbDate = parseTaiwanDateToDbDate(expiryStr);
    expect(expiryStr).toBe("2026-08-01");
    expect(dbDate.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("CUSTOM_DATE 直接指定 → DB 寫入後回讀不少 1 天（紙本卡核心情境）", () => {
    const customDate = "2026-07-15";
    const dbDate = parseTaiwanDateToDbDate(customDate);
    expect(dbDate.toISOString().slice(0, 10)).toBe(customDate);
  });
});
