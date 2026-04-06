/**
 * 預約系統共用常數與 helper — 全站唯一定義來源
 *
 * 所有頁面必須從此檔案引用狀態標籤、顏色、查詢條件，
 * 禁止各頁面自行定義，避免資料判讀不一致。
 */

import { getNowTaipeiHHmm, toLocalDateStr } from "@/lib/date-utils";

// ============================================================
// 1. 預約狀態定義
//    簡化為 4 狀態：PENDING / COMPLETED / NO_SHOW / CANCELLED
//    舊的 CONFIRMED 在 DB 中可能仍存在，統一視為 PENDING
// ============================================================

/** 代表「有效預約」的狀態集合（排除 CANCELLED） */
export const ACTIVE_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] as const;

/** 代表「待到店」的狀態（PENDING + 舊的 CONFIRMED 都算） */
export const PENDING_STATUSES = ["PENDING", "CONFIRMED"] as const;

/** 顯示用狀態標籤 */
export const STATUS_LABEL: Record<string, string> = {
  PENDING: "待到店",
  CONFIRMED: "待到店", // 舊資料相容
  COMPLETED: "出席",
  NO_SHOW: "未到",
  CANCELLED: "已取消",
};

/** 狀態顏色（badge） */
export const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-blue-100 text-blue-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  NO_SHOW: "bg-red-100 text-red-600",
  CANCELLED: "bg-gray-100 text-gray-500",
};

/** 狀態左邊框色（列表用） */
export const STATUS_BORDER: Record<string, string> = {
  PENDING: "border-l-blue-400",
  CONFIRMED: "border-l-blue-400",
  COMPLETED: "border-l-green-400",
  NO_SHOW: "border-l-red-400",
  CANCELLED: "border-l-gray-300",
};

/** 狀態底色（列表行） */
export const STATUS_ROW_BG: Record<string, string> = {
  COMPLETED: "bg-green-50/30",
  NO_SHOW: "bg-red-50/30",
};

/** 狀態圖示 */
export const STATUS_ICON: Record<string, string> = {
  PENDING: "\u25CB",   // ○
  CONFIRMED: "\u25CB",
  COMPLETED: "\u2713", // ✓
  NO_SHOW: "\u2717",   // ✗
  CANCELLED: "\u2014", // —
};

// ============================================================
// 2. 交易類型
// ============================================================

/** 金流交易類型（有實際金額的） */
export const CASH_TRANSACTION_TYPES = [
  "TRIAL_PURCHASE",
  "SINGLE_PURCHASE",
  "PACKAGE_PURCHASE",
  "SUPPLEMENT",
  "REFUND",
  "ADJUSTMENT",
] as const;

/** 營收交易類型（正向收入） */
export const REVENUE_TRANSACTION_TYPES = [
  "TRIAL_PURCHASE",
  "SINGLE_PURCHASE",
  "PACKAGE_PURCHASE",
  "SUPPLEMENT",
] as const;

// ============================================================
// 3. 預約時間 helper
// ============================================================

/**
 * 組合 bookingDate + slotTime 為完整 Date（台灣時間）
 * bookingDate 存的是 UTC midnight，slotTime 是 "HH:mm" 台灣時間
 */
export function getBookingDateTime(bookingDate: Date, slotTime: string): Date {
  const dateStr = bookingDate.toISOString().slice(0, 10);
  const [hours, minutes] = slotTime.split(":").map(Number);
  return new Date(
    `${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+08:00`
  );
}

/**
 * 判斷一筆預約是否「已過時間」（日期+時段都比較）
 */
export function isBookingPast(bookingDate: Date, slotTime: string): boolean {
  const bookingDt = getBookingDateTime(bookingDate, slotTime);
  return bookingDt.getTime() < Date.now();
}

/**
 * 判斷同日時段是否已過（用於前台 slot 過濾）
 */
export function isSlotPastToday(date: string, slotTime: string): boolean {
  const todayStr = toLocalDateStr();
  if (date !== todayStr) return false;
  const nowHHmm = getNowTaipeiHHmm();
  return slotTime <= nowHHmm;
}

// ============================================================
// 4. No-Show 扣堂策略
// ============================================================

export type NoShowPolicy = "DEDUCTED" | "NOT_DEDUCTED";

// ============================================================
// 5. 方案類別標籤
// ============================================================

export const PLAN_CATEGORY_LABEL: Record<string, string> = {
  TRIAL: "體驗",
  SINGLE: "單次",
  PACKAGE: "課程",
};

export const WALLET_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "有效",
  USED_UP: "已用完",
  EXPIRED: "已過期",
  CANCELLED: "已取消",
};

// ============================================================
// 6. 預約類型標籤
// ============================================================

export const BOOKING_TYPE_LABEL: Record<string, string> = {
  FIRST_TRIAL: "體驗",
  SINGLE: "單次",
  PACKAGE_SESSION: "課程堂數",
};
