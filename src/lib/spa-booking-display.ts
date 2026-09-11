import type { SpaScheduleBooking } from "@/server/queries/spa-schedule";

export function spaPartyLabel(
  booking: Pick<SpaScheduleBooking, "partyGroupId" | "guestIndex">,
) {
  if (!booking.partyGroupId) return "";
  return (booking.guestIndex ?? 1) <= 1
    ? "主要聯絡人"
    : `同行 ${(booking.guestIndex ?? 1) - 1}`;
}
export function spaReceiptStatus(
  receipt: NonNullable<SpaScheduleBooking["receipt"]>,
) {
  if (!receipt.refunded) return "已結帳";
  const prefix = receipt.voided ? "已作廢 · " : "";
  if (receipt.paymentMethod === "ENTITLEMENT")
    return `${prefix}已退回 ${receipt.refundUses ?? receipt.uses ?? 0} 次`;
  const amount = `NT$${(receipt.refundAmount ?? receipt.amount).toLocaleString("zh-TW")}`;
  return `${prefix}${receipt.paymentMethod === "STORED_VALUE" ? "已退回儲值" : "已退款"} ${amount}`;
}
