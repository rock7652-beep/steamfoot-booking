/**
 * 共用日期工具 — 全系統統一 UTC+8 (Asia/Taipei)
 *
 * 規則：
 * - DB 以 UTC 儲存（Prisma @default(now())、Supabase PostgreSQL）
 * - 「營業日」以台灣時間為準（UTC+8）
 * - 查詢 createdAt / 時間戳記欄位時，必須用 UTC+8 偏移邊界
 * - 查詢 bookingDate（日期欄位，存為 T00:00:00Z）時，用 UTC 邊界即可
 *
 * 禁止：直接使用 toISOString().slice(0, 10) 作為台灣營業日判斷
 */

/** 台灣時區偏移（小時） */
export const TZ_OFFSET_HOURS = 8;

// ============================================================
// 日期字串
// ============================================================

/**
 * 取得台灣時間的日期字串 YYYY-MM-DD
 * 在 UTC 伺服器（如 Vercel）上也能正確回傳台灣日期
 */
export function toLocalDateStr(date?: Date): string {
  const d = date ?? new Date();
  const local = new Date(d.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 取得台灣時間的月份字串 YYYY-MM
 */
export function toLocalMonthStr(date?: Date): string {
  return toLocalDateStr(date).slice(0, 7);
}

// ============================================================
// 日期邊界（用於查詢 createdAt 等 UTC 時間戳記）
// ============================================================

/**
 * 取得「今天」在台灣時間的 UTC 邊界
 * 例：台灣 4/6 00:00 = UTC 4/5 16:00
 *     台灣 4/6 23:59 = UTC 4/6 15:59
 */
export function todayRange(): { start: Date; end: Date; dateStr: string } {
  const now = new Date();
  const local = new Date(now.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  return {
    start: new Date(Date.UTC(y, m, d, -TZ_OFFSET_HOURS)),
    end: new Date(Date.UTC(y, m, d, 23 - TZ_OFFSET_HOURS, 59, 59, 999)),
    dateStr: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  };
}

/**
 * 取得指定月份在台灣時間的 UTC 邊界
 * @param month "YYYY-MM" 格式
 */
export function monthRange(month: string): { start: Date; end: Date } {
  const [year, mon] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, mon - 1, 1, -TZ_OFFSET_HOURS)),
    end: new Date(Date.UTC(year, mon, 0, 23 - TZ_OFFSET_HOURS, 59, 59, 999)),
  };
}

/**
 * 取得指定日期字串在台灣時間的 UTC 邊界
 * @param dateStr "YYYY-MM-DD" 格式
 */
export function dayRange(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, d, -TZ_OFFSET_HOURS)),
    end: new Date(Date.UTC(y, m - 1, d, 23 - TZ_OFFSET_HOURS, 59, 59, 999)),
  };
}

// ============================================================
// 台灣時間取得
// ============================================================

/**
 * 取得台灣當前時間的 HH:mm 字串
 */
export function getNowTaipeiHHmm(): string {
  const now = new Date();
  const local = new Date(now.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * 取得台灣今天的日期字串（YYYY-MM-DD）—— todayRange().dateStr 的輕量別名
 */
export function getTodayTaipeiDateStr(): string {
  return toLocalDateStr();
}

// ============================================================
// 日期邊界（用於查詢 bookingDate 等日期欄位，存為 T00:00:00Z）
// ============================================================

/**
 * 取得指定月份的 bookingDate 邊界
 * bookingDate 以 UTC midnight 儲存，不需 TZ 偏移
 */
export function bookingMonthRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 0)),
  };
}

/**
 * 取得台灣「今天」對應的 bookingDate 精確值
 *
 * bookingDate 是 @db.Date（PostgreSQL DATE），Prisma 存為 UTC midnight
 * 例：台灣 4/6 → bookingDate = 2026-04-06T00:00:00.000Z
 *
 * ⚠ 不能用 todayRange()（那是給 createdAt 等 TIMESTAMP 欄位的 TZ 偏移邊界）
 */
export function bookingDateToday(): Date {
  const dateStr = toLocalDateStr(); // 台灣今天 "YYYY-MM-DD"
  return new Date(dateStr + "T00:00:00.000Z");
}

// ============================================================
// 報表日期範圍 preset
// ============================================================

export type DateRangePreset = "today" | "month" | "quarter";

export function getPresetDateRange(preset: DateRangePreset): {
  startDate: string;
  endDate: string;
  label: string;
} {
  const now = new Date();
  const local = new Date(now.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const today = toLocalDateStr(now);

  switch (preset) {
    case "today":
      return { startDate: today, endDate: today, label: today };
    case "month": {
      const first = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const last = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return { startDate: first, endDate: last, label: `${y}/${String(m + 1).padStart(2, "0")}` };
    }
    case "quarter": {
      const qStart = Math.floor(m / 3) * 3;
      const qFirst = `${y}-${String(qStart + 1).padStart(2, "0")}-01`;
      const qLastDay = new Date(Date.UTC(y, qStart + 3, 0)).getUTCDate();
      const qLast = `${y}-${String(qStart + 3).padStart(2, "0")}-${String(qLastDay).padStart(2, "0")}`;
      return { startDate: qFirst, endDate: qLast, label: `${y} Q${Math.floor(m / 3) + 1}` };
    }
    default:
      return { startDate: today, endDate: today, label: today };
  }
}
