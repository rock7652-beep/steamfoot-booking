/**
 * 營業時間共用解析器（前後台、預約檢查的唯一來源）
 *
 * 設計目的：後台月曆預覽、前台顧客月曆、前台時段選擇、預約建立檢查，
 * 全部走同一套規則計算，避免「後台顯示營業、前台顯示公休」之類的不同步。
 *
 * 優先序：
 *   1. SpecialBusinessDay（type = closed / training / custom）
 *   2. BusinessHours weekly rule（dayOfWeek）
 *   3. 無設定 → 視為公休
 *
 * 注意：本檔案不做「值班過濾」。值班過濾屬於前台「可預約」邏輯，
 *       不是「營業狀態」邏輯。後台月曆需顯示真實營業狀態。
 */

import { prisma } from "@/lib/db";
import { generateSlots, type GeneratedSlot } from "@/lib/slot-generator";

// ============================================================
// 型別
// ============================================================

export type DayStatus = "open" | "closed" | "training" | "custom";

export interface DayRule {
  status: DayStatus;
  closed: boolean;
  reason: string | null;
  openTime: string | null;
  closeTime: string | null;
  slotInterval: number;
  defaultCapacity: number;
  /** 規則來源：special > weekly > none */
  source: "special" | "weekly" | "none";
}

export interface BusinessHoursRow {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
  slotInterval: number;
  defaultCapacity: number;
}

export interface SpecialDayRow {
  date: Date;
  type: string; // "closed" | "training" | "custom"
  reason: string | null;
  openTime: string | null;
  closeTime: string | null;
  slotInterval: number | null;
  defaultCapacity: number | null;
}

export interface SlotOverrideRow {
  date: Date;
  startTime: string;
  type: string; // "disabled" | "enabled" | "capacity_change"
  capacity: number | null;
  reason: string | null;
}

/** 套完 SlotOverride 後的單一時段 */
export interface ResolvedSlot {
  startTime: string;
  capacity: number;
  /** override 類型，null 代表無覆寫（沿用 weekly/special 規則） */
  override: "disabled" | "enabled" | "capacity_change" | null;
  /** disabled 之 slot 仍會放在 list（前台會自行過濾），方便後台顯示 */
  isEnabled: boolean;
  overrideReason: string | null;
  /** 是否原本就在生成範圍內（false 代表是 enabled 強制加入的時段） */
  inRange: boolean;
  reason: string | null;
}

// ============================================================
// 純函式：從 maps 計算單日規則（無 IO）
// ============================================================

/** 將 BusinessHours rows 轉為 dow -> row 的 map */
export function buildBusinessHoursMap(rows: BusinessHoursRow[]): Map<number, BusinessHoursRow> {
  return new Map(rows.map((r) => [r.dayOfWeek, r]));
}

/** 將 SpecialBusinessDay rows 轉為 "YYYY-MM-DD" -> row 的 map */
export function buildSpecialDayMap(rows: SpecialDayRow[]): Map<string, SpecialDayRow> {
  return new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
}

/**
 * 純函式：解析單日規則。
 *
 * 不做任何 IO；呼叫端必須先把 BusinessHours / SpecialBusinessDay 撈好並轉成 map。
 */
export function resolveDayRule(input: {
  dateStr: string;
  dow: number;
  specialDayMap: Map<string, SpecialDayRow>;
  businessHoursMap: Map<number, BusinessHoursRow>;
}): DayRule {
  const { dateStr, dow, specialDayMap, businessHoursMap } = input;
  const bh = businessHoursMap.get(dow);
  const special = specialDayMap.get(dateStr);

  // 1. 特殊日期優先
  if (special) {
    if (special.type === "closed") {
      return {
        status: "closed",
        closed: true,
        reason: special.reason ?? "公休",
        openTime: null,
        closeTime: null,
        slotInterval: bh?.slotInterval ?? 60,
        defaultCapacity: bh?.defaultCapacity ?? 6,
        source: "special",
      };
    }
    if (special.type === "training") {
      return {
        status: "training",
        closed: true,
        reason: special.reason ?? "進修日",
        openTime: null,
        closeTime: null,
        slotInterval: bh?.slotInterval ?? 60,
        defaultCapacity: bh?.defaultCapacity ?? 6,
        source: "special",
      };
    }
    // custom
    return {
      status: "custom",
      closed: false,
      reason: special.reason,
      openTime: special.openTime,
      closeTime: special.closeTime,
      slotInterval: special.slotInterval ?? bh?.slotInterval ?? 60,
      defaultCapacity: special.defaultCapacity ?? bh?.defaultCapacity ?? 6,
      source: "special",
    };
  }

  // 2. 每週固定營業
  if (bh) {
    if (!bh.isOpen) {
      return {
        status: "closed",
        closed: true,
        reason: "固定公休",
        openTime: null,
        closeTime: null,
        slotInterval: bh.slotInterval,
        defaultCapacity: bh.defaultCapacity,
        source: "weekly",
      };
    }
    return {
      status: "open",
      closed: false,
      reason: null,
      openTime: bh.openTime,
      closeTime: bh.closeTime,
      slotInterval: bh.slotInterval,
      defaultCapacity: bh.defaultCapacity,
      source: "weekly",
    };
  }

  // 3. 無設定 → 公休
  return {
    status: "closed",
    closed: true,
    reason: "尚未設定營業時間",
    openTime: null,
    closeTime: null,
    slotInterval: 60,
    defaultCapacity: 6,
    source: "none",
  };
}

/**
 * 純函式：將 SlotOverride 套到 DayRule 上，回傳該日 slot 列表。
 *
 * 不做 duty 過濾；呼叫端依需求（前台才需要）自行過濾。
 *
 * 規則：
 *   - rule.closed：不會生成任何 slot（即使有 enabled override，公休日仍視為公休）
 *   - disabled override：保留在列表（isEnabled=false），讓後台可看到關閉狀態
 *   - capacity_change：覆寫 capacity
 *   - enabled：強制加入不在生成範圍內的時段
 */
export function applySlotOverrides(rule: DayRule, overrides: SlotOverrideRow[]): ResolvedSlot[] {
  if (rule.closed || !rule.openTime || !rule.closeTime) {
    return [];
  }

  const generated = generateSlots(rule.openTime, rule.closeTime, rule.slotInterval, rule.defaultCapacity);
  const overrideMap = new Map(overrides.map((o) => [o.startTime, o]));

  const slots: ResolvedSlot[] = generated.map((g) => {
    const ov = overrideMap.get(g.startTime);
    if (!ov) {
      return {
        startTime: g.startTime,
        capacity: g.capacity,
        override: null,
        isEnabled: true,
        overrideReason: null,
        inRange: true,
        reason: null,
      };
    }
    if (ov.type === "disabled") {
      return {
        startTime: g.startTime,
        capacity: g.capacity,
        override: "disabled",
        isEnabled: false,
        overrideReason: ov.reason,
        inRange: true,
        reason: ov.reason,
      };
    }
    if (ov.type === "capacity_change") {
      return {
        startTime: g.startTime,
        capacity: ov.capacity ?? g.capacity,
        override: "capacity_change",
        isEnabled: true,
        overrideReason: ov.reason,
        inRange: true,
        reason: ov.reason,
      };
    }
    // "enabled" 落在生成範圍內視同強制保留
    return {
      startTime: g.startTime,
      capacity: ov.capacity ?? g.capacity,
      override: "enabled",
      isEnabled: true,
      overrideReason: ov.reason,
      inRange: true,
      reason: ov.reason,
    };
  });

  // 加入「強制 enabled」但不在生成範圍內的時段
  for (const ov of overrides) {
    if (ov.type !== "enabled") continue;
    if (slots.some((s) => s.startTime === ov.startTime)) continue;
    slots.push({
      startTime: ov.startTime,
      capacity: ov.capacity ?? rule.defaultCapacity,
      override: "enabled",
      isEnabled: true,
      overrideReason: ov.reason,
      inRange: false,
      reason: ov.reason,
    });
  }

  slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return slots;
}

/**
 * 純函式：把 ResolvedSlot 簡化為 GeneratedSlot 格式（給仍用舊 shape 的呼叫端）
 */
export function resolvedToGenerated(slots: ResolvedSlot[]): GeneratedSlot[] {
  return slots
    .filter((s) => s.isEnabled)
    .map((s) => ({ startTime: s.startTime, capacity: s.capacity }));
}

// ============================================================
// 跨日輔助
// ============================================================

/**
 * 純函式：根據 (year, month) 產生該月所有日字串 + 對應 dow（UTC midnight 計算）
 *
 * 因 bookingDate 以 UTC midnight 儲存，這裡用 UTC 走訪可確保與 specialDay.date 對齊。
 */
export function enumerateMonthDates(year: number, month: number): { dateStr: string; dow: number }[] {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const out: { dateStr: string; dow: number }[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push({
      dateStr: cursor.toISOString().slice(0, 10),
      dow: cursor.getUTCDay(),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

// ============================================================
// 含 IO：撈取資料 + 解析
// ============================================================

export interface MonthBusinessHoursContext {
  /** 該月每日的規則 */
  rules: Map<string, DayRule>;
  /** 該月所有 SlotOverride（含 disabled / enabled / capacity_change） */
  slotOverrides: SlotOverrideRow[];
  /** 內部用：原始資料 maps，呼叫端若需自行 reuse */
  businessHoursMap: Map<number, BusinessHoursRow>;
  specialDayMap: Map<string, SpecialDayRow>;
  start: Date;
  end: Date;
}

/**
 * 撈該店指定月份的所有營業規則資料，並計算每日 DayRule。
 *
 * 不查 DutyAssignment / Booking — 那是「可預約」的範疇，由呼叫端自行決定。
 *
 * @param weeklyHoursOverride 已經拿到的 BusinessHours rows（例如從 unstable_cache
 *   getCachedBusinessHours 取來），傳入後本函式會跳過 businessHours 查詢，
 *   改月份切換時可省 1 次 DB（每週規則整月不變，沒必要每次重抓）。
 */
export async function loadMonthBusinessHoursContext(
  storeId: string,
  year: number,
  month: number, // 1-based
  weeklyHoursOverride?: BusinessHoursRow[],
): Promise<MonthBusinessHoursContext> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  const [businessHoursRows, specialDaysRows, slotOverrideRows] = await Promise.all([
    weeklyHoursOverride !== undefined
      ? Promise.resolve(weeklyHoursOverride)
      : prisma.businessHours.findMany({ where: { storeId } }),
    prisma.specialBusinessDay.findMany({
      where: { storeId, date: { gte: start, lte: end } },
    }),
    prisma.slotOverride.findMany({
      where: { storeId, date: { gte: start, lte: end } },
    }),
  ]);

  const businessHoursMap = buildBusinessHoursMap(businessHoursRows);
  const specialDayMap = buildSpecialDayMap(specialDaysRows);

  const rules = new Map<string, DayRule>();
  for (const { dateStr, dow } of enumerateMonthDates(year, month)) {
    rules.set(dateStr, resolveDayRule({ dateStr, dow, specialDayMap, businessHoursMap }));
  }

  return {
    rules,
    slotOverrides: slotOverrideRows.map((o) => ({
      date: o.date,
      startTime: o.startTime,
      type: o.type,
      capacity: o.capacity,
      reason: o.reason,
    })),
    businessHoursMap,
    specialDayMap,
    start,
    end,
  };
}

export interface DayBusinessHoursContext {
  rule: DayRule;
  slotOverrides: SlotOverrideRow[];
  /** "YYYY-MM-DD" 對應的 UTC midnight Date 物件，方便呼叫端做 booking 查詢 */
  dateObj: Date;
  /**
   * 該日的原始 SpecialBusinessDay row（含 id），若無特殊設定為 null。
   * 後台 getDaySlotDetails 等需要 row id 的呼叫端可直接讀取，
   * 不必為了取 id 再打一次 prisma.specialBusinessDay.findFirst。
   */
  specialDay: { id: string } | null;
  /**
   * 該星期的原始 BusinessHours row，若該星期未設定為 null。
   * 後台「每週預設」面板需要 isOpen 等欄位，避免重複查詢。
   */
  businessHour: BusinessHoursRow | null;
}

/**
 * 撈該店指定日期的營業規則 + slot override。
 *
 * dateStr 必須為 "YYYY-MM-DD"（台灣本地日期）。
 */
export async function loadDayBusinessHoursContext(
  storeId: string,
  dateStr: string,
): Promise<DayBusinessHoursContext> {
  const dateObj = new Date(dateStr + "T00:00:00Z");
  const dow = dateObj.getUTCDay();

  const [specialDay, businessHour, slotOverrides] = await Promise.all([
    prisma.specialBusinessDay.findFirst({ where: { storeId, date: dateObj } }),
    prisma.businessHours.findFirst({ where: { storeId, dayOfWeek: dow } }),
    prisma.slotOverride.findMany({
      where: { storeId, date: dateObj },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const specialDayMap = new Map<string, SpecialDayRow>();
  if (specialDay) specialDayMap.set(dateStr, specialDay);
  const businessHoursMap = new Map<number, BusinessHoursRow>();
  if (businessHour) businessHoursMap.set(dow, businessHour);

  const rule = resolveDayRule({ dateStr, dow, specialDayMap, businessHoursMap });

  return {
    rule,
    slotOverrides: slotOverrides.map((o) => ({
      date: o.date,
      startTime: o.startTime,
      type: o.type,
      capacity: o.capacity,
      reason: o.reason,
    })),
    dateObj,
    specialDay: specialDay ? { id: specialDay.id } : null,
    businessHour: businessHour
      ? {
          dayOfWeek: businessHour.dayOfWeek,
          isOpen: businessHour.isOpen,
          openTime: businessHour.openTime,
          closeTime: businessHour.closeTime,
          slotInterval: businessHour.slotInterval,
          defaultCapacity: businessHour.defaultCapacity,
        }
      : null,
  };
}

// ============================================================
// 月份摘要：給後台月曆每格用的 status / openTime / slotCount / overrideCount
// ============================================================

export interface MonthSummaryDay {
  status: DayStatus;
  openTime: string | null;
  closeTime: string | null;
  slotCount: number;
  overrideCount: number;
}

/** "YYYY-MM-DD" → 該日摘要 */
export type MonthSummary = Record<string, MonthSummaryDay>;

/**
 * 計算該店該月的逐日營業摘要（後台月曆色塊 / 時段數 / override 標記用）。
 * 不檢查 session — 呼叫端負責權限。
 *
 * 抽出此函式是為了讓 query-cache.ts 能用 unstable_cache 包它，
 * 把第一個進來的人付出的解析成本快取 60s 給後續所有並發 request。
 */
export async function computeMonthScheduleSummary(
  storeId: string,
  year: number,
  month: number,
  weeklyHoursOverride?: BusinessHoursRow[],
): Promise<MonthSummary> {
  const ctx = await loadMonthBusinessHoursContext(
    storeId,
    year,
    month,
    weeklyHoursOverride,
  );

  // 按日聚合 override 數量（後台需顯示「該日有 N 個時段覆寫」徽章）
  const overrideCounts = new Map<string, number>();
  for (const o of ctx.slotOverrides) {
    const key = o.date.toISOString().slice(0, 10);
    overrideCounts.set(key, (overrideCounts.get(key) ?? 0) + 1);
  }

  const days: MonthSummary = {};
  for (const { dateStr } of enumerateMonthDates(year, month)) {
    const rule = ctx.rules.get(dateStr)!;
    const slotCount =
      rule.openTime && rule.closeTime
        ? generateSlots(rule.openTime, rule.closeTime, rule.slotInterval, 1).length
        : 0;
    days[dateStr] = {
      status: rule.status,
      openTime: rule.openTime,
      closeTime: rule.closeTime,
      slotCount,
      overrideCount: overrideCounts.get(dateStr) ?? 0,
    };
  }

  return days;
}
