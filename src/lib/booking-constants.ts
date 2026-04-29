/**
 * 預約系統共用常數與 helper — 全站唯一定義來源
 *
 * 所有頁面必須從此檔案引用狀態標籤、顏色、查詢條件，
 * 禁止各頁面自行定義，避免資料判讀不一致。
 */

import { getNowTaipeiHHmm, toLocalDateStr } from "@/lib/date-utils";

// ============================================================
// 1. 預約狀態定義（單一真相來源）
//    簡化為 4 狀態：PENDING / COMPLETED / NO_SHOW / CANCELLED
//    舊的 CONFIRMED 在 DB 中可能仍存在，統一視為 PENDING
//
// 語意分組（Booking Status Contract）：
//
//   BOOKING_UPCOMING — 顧客「即將到來」/ 後台「今日預約」可見
//     ↓（出席或店長處理後）
//   BOOKING_TERMINAL — 已結束（出席 / 未到 / 取消），歷史記錄
//
//   BOOKING_VISIBLE_TO_CUSTOMER = UPCOMING ∪ TERMINAL（排除 CANCELLED 之外的）
//   BOOKING_HISTORY            = TERMINAL
//
// ⚠️ 守則：所有 query / page 的 status 篩選必須引用這些常數，禁止直接寫字串陣列。
//   理由：寫入端與讀取端使用同一份集合，避免「建立成 PENDING 但查詢只看 CONFIRMED」
//   這類 drift bug。
// ============================================================

/** 代表「有效預約」的狀態集合（排除 CANCELLED） */
export const ACTIVE_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] as const;

/** 代表「待到店」的狀態（PENDING + 舊的 CONFIRMED 都算） */
export const PENDING_STATUSES = ["PENDING", "CONFIRMED"] as const;

/**
 * **BOOKING_UPCOMING** — 顧客 upcoming tab、後台今日/月曆 cell 可見的預約。
 *
 * 與 PENDING_STATUSES 同集合；提供語意化命名，呼叫端優先使用此別名以表達意圖。
 */
export const BOOKING_UPCOMING = PENDING_STATUSES;

/**
 * **BOOKING_HISTORY** — 已結束狀態，歷史紀錄 / 報表 / 點數結算根據。
 *
 * 包含 COMPLETED、NO_SHOW、CANCELLED。
 */
export const BOOKING_HISTORY = ["COMPLETED", "NO_SHOW", "CANCELLED"] as const;

/**
 * **BOOKING_VISIBLE_TO_CUSTOMER** — 顧客「我的預約」全頁面（含 upcoming + history）。
 * 排除 CANCELLED 不顯示，但保留 NO_SHOW（顧客需要看到）。
 */
export const BOOKING_VISIBLE_TO_CUSTOMER = ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] as const;

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

/**
 * 營收統計的有效交易狀態
 *
 * 規格（交易模組 v1）：營收只統計有效交易 SUCCESS；
 * 排除：VOIDED（取消交易）/ CANCELLED / REFUNDED
 *
 * 所有 prisma.transaction 的 groupBy/aggregate/findMany/count 用於營收統計時
 * 必須加 `status: REVENUE_VALID_STATUS` 條件。
 *
 * v2 規劃：
 *   - 引入「部分退款」(PARTIAL_REFUNDED) 後，本常數需擴成 `[SUCCESS, PARTIAL_REFUNDED]`，
 *     並在報表計算 net = amount - refundAmount 而非全有/全無
 *   - 退款流程上線前先把 status 與 amount 解耦，避免一次大 refactor
 */
export const REVENUE_VALID_STATUS = "SUCCESS" as const;

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

/**
 * DB 層：noShowPolicy 只有 2 種值
 * - DEDUCTED: 扣堂
 * - NOT_DEDUCTED: 不扣堂
 */
export type NoShowPolicy = "DEDUCTED" | "NOT_DEDUCTED";

/**
 * UI 層：店長在 popover 選擇的未到處理方式（三選一）
 * - DEDUCTED: 扣堂（照常扣）
 * - NOT_DEDUCTED_WITH_MAKEUP: 不扣堂＋給補課
 * - NOT_DEDUCTED_NO_MAKEUP: 不扣堂、不補課
 *
 * 後端會拆成兩個欄位存：
 *   noShowPolicy        → "DEDUCTED" | "NOT_DEDUCTED"
 *   noShowMakeupGranted → true | false
 */
export type NoShowChoice = "DEDUCTED" | "NOT_DEDUCTED_WITH_MAKEUP" | "NOT_DEDUCTED_NO_MAKEUP";

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
