import { prisma } from "@/lib/db";
import { createEcpayCheckMacValue, getEcpayRecurringCredentials, verifyEcpayCheckMacValue } from "@/lib/ecpay-recurring";

const API_URL = {
  stage: "https://payment-stage.ecpay.com.tw/Cashier/CreditCardPeriodAction",
  production: "https://payment.ecpay.com.tw/Cashier/CreditCardPeriodAction",
} as const;

export async function cancelEcpayRecurringProviderOrder(merchantTradeNo: string): Promise<void> {
  const credentials = getEcpayRecurringCredentials();
  const fields = {
    MerchantID: credentials.merchantId,
    MerchantTradeNo: merchantTradeNo,
    Action: "Cancel",
    TimeStamp: Math.floor(Date.now() / 1000),
  };
  const request = { ...fields, CheckMacValue: createEcpayCheckMacValue(fields, credentials) };
  const response = await fetch(API_URL[credentials.environment], {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(Object.entries(request).map(([key, value]) => [key, String(value)])),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ECPay cancel API returned HTTP ${response.status}`);
  const body = new URLSearchParams(await response.text());
  const result = Object.fromEntries(body.entries());
  if (result.MerchantID !== credentials.merchantId || !verifyEcpayCheckMacValue(result, credentials)) {
    throw new Error("ECPay cancel API response signature is invalid");
  }
  if (result.MerchantTradeNo !== merchantTradeNo) throw new Error("ECPay cancel API order does not match");
  if (result.RtnCode !== "1" && result.RtnCode !== "90100149") {
    throw new Error(`ECPay cancel API rejected request (${result.RtnCode ?? "unknown"})`);
  }
}

/** Cancels only after the agreed initial term has been charged successfully. */
export async function cancelEcpayAgreementIfEligible(agreementId: string): Promise<boolean> {
  const agreement = await prisma.ecpayRecurringAgreement.findUnique({
    where: { id: agreementId },
    select: {
      id: true,
      merchantTradeNo: true,
      status: true,
      successfulPaymentCount: true,
      initialTermMonths: true,
      cancelAfterSuccessCount: true,
      cancelledAt: true,
    },
  });
  if (!agreement || agreement.status === "CANCELLED") return true;
  const threshold = agreement.cancelAfterSuccessCount ?? agreement.initialTermMonths;
  if (agreement.status !== "CANCEL_REQUESTED" || agreement.successfulPaymentCount < threshold) return false;
  await cancelEcpayRecurringProviderOrder(agreement.merchantTradeNo);
  await prisma.ecpayRecurringAgreement.update({
    where: { id: agreement.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), lastProviderCode: "CANCELLED", lastProviderMessage: "綠界定期扣款已終止" },
  });
  return true;
}
