import { generateWeeklyDateStrings } from "@/lib/date-utils";
import type { SlotAvailability } from "@/types";

export type RecurringPreviewOccurrence = {
  date: string;
  available: boolean;
  reason?: string;
};

/**
 * 同名方案可能有多張不同到期日的錢包。循環預約必須顯示與 server
 * eligibility 相同的 AVAILABLE WalletSession 數，而不是快取堂數。
 */
export function formatRecurringWalletOption({
  planName,
  recurringAvailableSessions,
  expiryDate,
}: {
  planName: string;
  /** 快取值保留在輸入型別中，明確不作為循環預約顯示依據。 */
  remainingSessions: number;
  recurringAvailableSessions: number;
  expiryDate: string | null;
}): string {
  const expiry = expiryDate ? `｜到期 ${expiryDate.replaceAll("-", "/")}` : "";
  return `${planName}｜可用 ${recurringAvailableSessions} 堂${expiry}`;
}

/** 顧客 UI 第一版最多提供 2～8 週；後端仍會套用店家與系統上限。 */
export function recurringWeekOptions(storeMaxWeeks: number): number[] {
  const maximum = Math.min(8, Math.max(0, storeMaxWeeks));
  return Array.from({ length: Math.max(0, maximum - 1) }, (_, index) => index + 2);
}

/**
 * 僅供 UI 預覽的早期提示。送出時仍必須由 createRecurringBookings()
 * 在 transaction + slot lock 內重新完整驗證，避免快取或競爭造成部分成功。
 */
export function buildRecurringPreview({
  bookingDate,
  weeks,
  slotTime,
  people,
  bookableUntil,
  slotsByDate,
}: {
  bookingDate: string;
  weeks: number;
  slotTime: string;
  people: number;
  bookableUntil: string;
  slotsByDate: Record<string, SlotAvailability[] | undefined>;
}): RecurringPreviewOccurrence[] {
  return generateWeeklyDateStrings(bookingDate, weeks).map((date) => {
    if (date > bookableUntil) return { date, available: false, reason: "超過最遠可預約日期" };

    const slots = slotsByDate[date];
    if (!slots) return { date, available: false, reason: "無法確認可預約狀態" };

    const slot = slots.find((item) => item.startTime === slotTime);
    if (!slot || !slot.isEnabled) return { date, available: false, reason: "未開放此時段" };
    if (slot.isPast) return { date, available: false, reason: "時段已過" };
    if (slot.available <= 0) return { date, available: false, reason: "已額滿" };
    if (slot.available < people) return { date, available: false, reason: "剩餘名額不足" };
    return { date, available: true };
  });
}
