/**
 * 共用型別定義
 *
 * Prisma 自動生成的型別從 @prisma/client 匯入。
 * 這裡放自訂的 DTO / 輔助型別。
 */

// ============================================================
// Session / Auth
// ============================================================

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  role: "ADMIN" | "OWNER" | "PARTNER" | "CUSTOMER";
  staffId?: string;
  customerId?: string;
  storeId?: string;
}

// ============================================================
// Booking
// ============================================================

/** 某個時段的可用資訊 */
export interface SlotAvailability {
  startTime: string;
  capacity: number;
  bookedCount: number;
  available: number;
  isEnabled: boolean;
  /** 同日已過時段（台灣時間） */
  isPast?: boolean;
}

/** 某天所有時段的可用資訊 */
export interface DayAvailability {
  date: string; // "YYYY-MM-DD"
  dayOfWeek: number;
  slots: SlotAvailability[];
}

// ============================================================
// Report
// ============================================================

/** 店長月營收摘要 */
export interface StaffMonthlyRevenue {
  staffId: string;
  staffName: string;
  month: string; // "YYYY-MM"
  totalRevenue: number;
  transactionCount: number;
  completedBookings: number;
}

/** 全店月營收摘要 */
export interface StoreMonthlyRevenue {
  month: string;
  totalRevenue: number;
  staffBreakdown: StaffMonthlyRevenue[];
}

// ============================================================
// Server Action Responses
// ============================================================

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
