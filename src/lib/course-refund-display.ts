export const COURSE_REFUND_METHOD_LABELS: Record<string,string> = {
  CASH: "現金", BANK_TRANSFER: "銀行轉帳", CARD: "另行辦理退刷", OTHER: "其他非現金",
};

/** Negotiation aid only: never used to authorize or cap the actual refund. */
export function courseRefundReference(paid: number, paidQuota: number, remaining: number, remainingGift: number) {
  if (![paid,paidQuota,remaining,remainingGift].every(Number.isSafeInteger) || paid<0 || paidQuota<=0 || remaining<0 || remainingGift<0 || remainingGift>remaining) return null;
  return paid*(remaining-remainingGift)/paidQuota;
}
