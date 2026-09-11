/** SPA receipt methods; external payments are recorded after the store verifies collection. */
export const SPA_EXTERNAL_PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "TRANSFER",
  "DIGITAL_PAYMENT",
] as const;
export type SpaExternalPaymentMethod =
  (typeof SPA_EXTERNAL_PAYMENT_METHODS)[number];
export const SPA_CHECKOUT_PAYMENT_METHODS = [
  ...SPA_EXTERNAL_PAYMENT_METHODS,
  "ENTITLEMENT",
  "STORED_VALUE",
] as const;
export type SpaCheckoutPaymentMethod =
  (typeof SPA_CHECKOUT_PAYMENT_METHODS)[number];
export const SPA_PAYMENT_LABELS: Record<string, string> = {
  CASH: "現金",
  CARD: "刷卡",
  TRANSFER: "轉帳",
  DIGITAL_PAYMENT: "多元支付",
  ENTITLEMENT: "方案扣次",
  STORED_VALUE: "儲值扣款",
};
export function isSpaExternalPayment(
  method: string,
): method is SpaExternalPaymentMethod {
  return SPA_EXTERNAL_PAYMENT_METHODS.some((value) => value === method);
}
export const SPA_COLLECTION_HINTS: Record<SpaExternalPaymentMethod, string> = {
  CASH: "請確認已收到現金。",
  CARD: "請先於店內刷卡機完成收款，此處僅記錄收款結果。",
  TRANSFER: "請先確認銀行帳戶已收到轉帳款項，再確認入帳。",
  DIGITAL_PAYMENT:
    "適用行動支付、電子錢包等。請先確認支付平台收款成功，此處僅記錄收款結果。",
};

export function validSpaTransferReference(data: {
  paymentMethod: string;
  transferLast4?: string;
}): boolean {
  return data.paymentMethod === "TRANSFER"
    ? /^[0-9]{4}$/.test(data.transferLast4 ?? "")
    : data.transferLast4 === undefined;
}
