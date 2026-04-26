/**
 * 營業時間共用解析器 — 純函式 regression tests
 *
 * 驗證：
 * 1. 優先序 special > weekly > none
 * 2. closed / training / custom / open / none 各狀態正確
 * 3. SlotOverride 正確套用（disabled / enabled / capacity_change）
 * 4. enumerateMonthDates 正確走訪整月（包含跨月、閏年）
 *
 * 禁止 hardcode 任何特定店或月份。所有測試以參數化資料表達。
 */

import { describe, it, expect } from "vitest";
import {
  applySlotOverrides,
  buildBusinessHoursMap,
  buildSpecialDayMap,
  enumerateMonthDates,
  resolveDayRule,
  type BusinessHoursRow,
  type SpecialDayRow,
  type SlotOverrideRow,
} from "@/lib/business-hours-resolver";

// ── 測試資料工廠 ──

function bh(
  dow: number,
  isOpen: boolean,
  open: string | null = "10:00",
  close: string | null = "22:00",
  interval = 60,
  capacity = 6,
): BusinessHoursRow {
  return {
    dayOfWeek: dow,
    isOpen,
    openTime: isOpen ? open : null,
    closeTime: isOpen ? close : null,
    slotInterval: interval,
    defaultCapacity: capacity,
  };
}

function specialDay(
  dateStr: string,
  type: "closed" | "training" | "custom",
  fields: Partial<Omit<SpecialDayRow, "date" | "type">> = {},
): SpecialDayRow {
  return {
    date: new Date(dateStr + "T00:00:00Z"),
    type,
    reason: fields.reason ?? null,
    openTime: fields.openTime ?? null,
    closeTime: fields.closeTime ?? null,
    slotInterval: fields.slotInterval ?? null,
    defaultCapacity: fields.defaultCapacity ?? null,
  };
}

function override(
  dateStr: string,
  startTime: string,
  type: "disabled" | "enabled" | "capacity_change",
  fields: Partial<Pick<SlotOverrideRow, "capacity" | "reason">> = {},
): SlotOverrideRow {
  return {
    date: new Date(dateStr + "T00:00:00Z"),
    startTime,
    type,
    capacity: fields.capacity ?? null,
    reason: fields.reason ?? null,
  };
}

// ── resolveDayRule ──

describe("resolveDayRule — 優先序 special > weekly > none", () => {
  it("無任何設定 → closed/none", () => {
    const rule = resolveDayRule({
      dateStr: "2026-05-05",
      dow: 2,
      specialDayMap: new Map(),
      businessHoursMap: new Map(),
    });
    expect(rule.closed).toBe(true);
    expect(rule.status).toBe("closed");
    expect(rule.source).toBe("none");
    expect(rule.reason).toBe("尚未設定營業時間");
  });

  it("僅 weekly 規則為營業 → open/weekly", () => {
    const rule = resolveDayRule({
      dateStr: "2026-05-05",
      dow: 2,
      specialDayMap: new Map(),
      businessHoursMap: buildBusinessHoursMap([bh(2, true, "10:00", "22:00")]),
    });
    expect(rule.closed).toBe(false);
    expect(rule.status).toBe("open");
    expect(rule.source).toBe("weekly");
    expect(rule.openTime).toBe("10:00");
    expect(rule.closeTime).toBe("22:00");
  });

  it("僅 weekly 規則為公休 → closed/weekly", () => {
    const rule = resolveDayRule({
      dateStr: "2026-05-05",
      dow: 2,
      specialDayMap: new Map(),
      businessHoursMap: buildBusinessHoursMap([bh(2, false)]),
    });
    expect(rule.closed).toBe(true);
    expect(rule.status).toBe("closed");
    expect(rule.source).toBe("weekly");
    expect(rule.reason).toBe("固定公休");
  });

  it("special closed 覆蓋 weekly 營業 → closed/special", () => {
    const rule = resolveDayRule({
      dateStr: "2026-05-05",
      dow: 2,
      specialDayMap: buildSpecialDayMap([specialDay("2026-05-05", "closed", { reason: "颱風" })]),
      businessHoursMap: buildBusinessHoursMap([bh(2, true)]),
    });
    expect(rule.status).toBe("closed");
    expect(rule.source).toBe("special");
    expect(rule.reason).toBe("颱風");
  });

  it("special training 覆蓋 weekly 營業 → training/special", () => {
    const rule = resolveDayRule({
      dateStr: "2026-05-05",
      dow: 2,
      specialDayMap: buildSpecialDayMap([specialDay("2026-05-05", "training", { reason: "員工訓練" })]),
      businessHoursMap: buildBusinessHoursMap([bh(2, true)]),
    });
    expect(rule.status).toBe("training");
    expect(rule.closed).toBe(true);
    expect(rule.reason).toBe("員工訓練");
  });

  it("special custom 覆蓋 weekly 營業時間 → custom/special", () => {
    const rule = resolveDayRule({
      dateStr: "2026-05-05",
      dow: 2,
      specialDayMap: buildSpecialDayMap([
        specialDay("2026-05-05", "custom", { openTime: "14:00", closeTime: "20:00", slotInterval: 30, defaultCapacity: 4 }),
      ]),
      businessHoursMap: buildBusinessHoursMap([bh(2, true, "10:00", "22:00", 60, 6)]),
    });
    expect(rule.status).toBe("custom");
    expect(rule.source).toBe("special");
    expect(rule.openTime).toBe("14:00");
    expect(rule.closeTime).toBe("20:00");
    expect(rule.slotInterval).toBe(30);
    expect(rule.defaultCapacity).toBe(4);
  });

  it("special custom 沿用 weekly 規則的 interval/capacity（未覆寫時）", () => {
    const rule = resolveDayRule({
      dateStr: "2026-05-05",
      dow: 2,
      specialDayMap: buildSpecialDayMap([
        specialDay("2026-05-05", "custom", { openTime: "14:00", closeTime: "20:00" }),
      ]),
      businessHoursMap: buildBusinessHoursMap([bh(2, true, "10:00", "22:00", 90, 8)]),
    });
    expect(rule.slotInterval).toBe(90);
    expect(rule.defaultCapacity).toBe(8);
  });

  it("special closed 但無 reason → 預設「公休」", () => {
    const rule = resolveDayRule({
      dateStr: "2026-05-05",
      dow: 2,
      specialDayMap: buildSpecialDayMap([specialDay("2026-05-05", "closed")]),
      businessHoursMap: new Map(),
    });
    expect(rule.reason).toBe("公休");
  });
});

// ── applySlotOverrides ──

describe("applySlotOverrides — 套用 SlotOverride", () => {
  const openRule = resolveDayRule({
    dateStr: "2026-05-05",
    dow: 2,
    specialDayMap: new Map(),
    businessHoursMap: buildBusinessHoursMap([bh(2, true, "10:00", "13:00", 60, 6)]),
  });

  it("無 override → 原樣回傳", () => {
    const slots = applySlotOverrides(openRule, []);
    expect(slots.map((s) => s.startTime)).toEqual(["10:00", "11:00", "12:00"]);
    expect(slots.every((s) => s.isEnabled && s.capacity === 6 && s.override === null)).toBe(true);
  });

  it("disabled 保留在列表（後台需顯示），但 isEnabled=false", () => {
    const slots = applySlotOverrides(openRule, [override("2026-05-05", "11:00", "disabled")]);
    const eleven = slots.find((s) => s.startTime === "11:00")!;
    expect(eleven.isEnabled).toBe(false);
    expect(eleven.override).toBe("disabled");
  });

  it("capacity_change 覆寫容量", () => {
    const slots = applySlotOverrides(openRule, [override("2026-05-05", "11:00", "capacity_change", { capacity: 2 })]);
    const eleven = slots.find((s) => s.startTime === "11:00")!;
    expect(eleven.capacity).toBe(2);
    expect(eleven.override).toBe("capacity_change");
  });

  it("enabled 強制加入不在範圍內的時段", () => {
    const slots = applySlotOverrides(openRule, [override("2026-05-05", "23:00", "enabled", { capacity: 3 })]);
    const late = slots.find((s) => s.startTime === "23:00");
    expect(late).toBeDefined();
    expect(late!.capacity).toBe(3);
    expect(late!.inRange).toBe(false);
    expect(late!.override).toBe("enabled");
  });

  it("公休日不會生成任何時段（即使有 enabled override）", () => {
    const closedRule = resolveDayRule({
      dateStr: "2026-05-05",
      dow: 2,
      specialDayMap: buildSpecialDayMap([specialDay("2026-05-05", "closed")]),
      businessHoursMap: buildBusinessHoursMap([bh(2, true, "10:00", "13:00")]),
    });
    const slots = applySlotOverrides(closedRule, [override("2026-05-05", "12:00", "enabled")]);
    expect(slots).toEqual([]);
  });

  it("結果按 startTime 升序排列", () => {
    const slots = applySlotOverrides(openRule, [
      override("2026-05-05", "23:00", "enabled"),
      override("2026-05-05", "08:00", "enabled"),
    ]);
    expect(slots.map((s) => s.startTime)).toEqual(["08:00", "10:00", "11:00", "12:00", "23:00"]);
  });
});

// ── enumerateMonthDates ──

describe("enumerateMonthDates — 整月走訪", () => {
  it("31 天月份 (2026-05) → 31 筆", () => {
    const days = enumerateMonthDates(2026, 5);
    expect(days.length).toBe(31);
    expect(days[0].dateStr).toBe("2026-05-01");
    expect(days[30].dateStr).toBe("2026-05-31");
  });

  it("30 天月份 (2026-04) → 30 筆", () => {
    const days = enumerateMonthDates(2026, 4);
    expect(days.length).toBe(30);
    expect(days[0].dateStr).toBe("2026-04-01");
    expect(days[29].dateStr).toBe("2026-04-30");
  });

  it("閏年 2/29 (2024-02) → 29 筆", () => {
    const days = enumerateMonthDates(2024, 2);
    expect(days.length).toBe(29);
    expect(days[28].dateStr).toBe("2024-02-29");
  });

  it("非閏年 2/28 (2026-02) → 28 筆", () => {
    const days = enumerateMonthDates(2026, 2);
    expect(days.length).toBe(28);
    expect(days[27].dateStr).toBe("2026-02-28");
  });

  it("dow 計算正確 (2026-05-01 是週五 dow=5)", () => {
    const days = enumerateMonthDates(2026, 5);
    expect(days[0].dow).toBe(5);
    expect(days[1].dow).toBe(6); // Saturday
    expect(days[2].dow).toBe(0); // Sunday
  });
});

// ── 後台 vs 前台同步性（核心驗收）──

describe("後台/前台同源 — 同一份資料解析出相同的 DayRule", () => {
  // 模擬：店家設定 5/1 custom 14:00-20:00、5/3 closed、5/5 weekly open（週二）
  const businessHoursMap = buildBusinessHoursMap([
    bh(0, false), // 週日公休
    bh(1, true, "10:00", "22:00"), // 週一營業
    bh(2, true, "10:00", "22:00"), // 週二營業
    bh(3, true, "10:00", "22:00"),
    bh(4, true, "10:00", "22:00"),
    bh(5, true, "10:00", "22:00"),
    bh(6, true, "10:00", "22:00"),
  ]);
  const specialDayMap = buildSpecialDayMap([
    specialDay("2026-05-01", "custom", { openTime: "14:00", closeTime: "20:00" }),
    specialDay("2026-05-03", "closed", { reason: "店休" }),
  ]);

  // 整月遍歷後，每個日子的規則應對任意呼叫端一致（驗證 resolver 是純函式）
  it("整月遍歷的 DayRule 對任意呼叫端皆一致（resolver 純函式）", () => {
    const days = enumerateMonthDates(2026, 5);
    const firstPass = days.map(({ dateStr, dow }) =>
      resolveDayRule({ dateStr, dow, specialDayMap, businessHoursMap }),
    );
    const secondPass = days.map(({ dateStr, dow }) =>
      resolveDayRule({ dateStr, dow, specialDayMap, businessHoursMap }),
    );
    expect(secondPass).toEqual(firstPass);
  });

  it("5/1 custom 14:00-20:00", () => {
    const r = resolveDayRule({
      dateStr: "2026-05-01",
      dow: 5, // 週五
      specialDayMap,
      businessHoursMap,
    });
    expect(r.status).toBe("custom");
    expect(r.openTime).toBe("14:00");
    expect(r.closeTime).toBe("20:00");
  });

  it("5/3 closed（覆蓋 weekly 週日公休本來就 closed）", () => {
    const r = resolveDayRule({
      dateStr: "2026-05-03",
      dow: 0,
      specialDayMap,
      businessHoursMap,
    });
    expect(r.status).toBe("closed");
    expect(r.source).toBe("special");
    expect(r.reason).toBe("店休");
  });

  it("5/5 weekly 週二營業", () => {
    const r = resolveDayRule({
      dateStr: "2026-05-05",
      dow: 2,
      specialDayMap,
      businessHoursMap,
    });
    expect(r.status).toBe("open");
    expect(r.source).toBe("weekly");
    expect(r.openTime).toBe("10:00");
    expect(r.closeTime).toBe("22:00");
  });

  it("5/10 週日 weekly 公休", () => {
    const r = resolveDayRule({
      dateStr: "2026-05-10",
      dow: 0,
      specialDayMap,
      businessHoursMap,
    });
    expect(r.status).toBe("closed");
    expect(r.source).toBe("weekly");
  });
});
