import { createHash, timingSafeEqual } from "node:crypto";

export type EcpayScalar = string | number;
export type EcpayFields = Record<string, EcpayScalar>;

export interface EcpayCredentials {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  environment: "stage" | "production";
}

const ECPAY_ENDPOINTS = {
  stage: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
  production: "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5",
} as const;

/** ECPay uses URL encoding of the entire sorted query string before SHA-256. */
function ecpayEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/%2d/gi, "-")
    .replace(/%5f/gi, "_")
    .replace(/%2e/gi, ".")
    .replace(/%21/gi, "!")
    .replace(/%2a/gi, "*")
    .replace(/%28/gi, "(")
    .replace(/%29/gi, ")")
    .toLowerCase();
}

export function createEcpayCheckMacValue(
  fields: EcpayFields,
  credentials: Pick<EcpayCredentials, "hashKey" | "hashIv">,
): string {
  const values = Object.entries(fields)
    .filter(([key]) => key.toLowerCase() !== "checkmacvalue")
    .sort(([left], [right]) => left.toLowerCase().localeCompare(right.toLowerCase()))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
  const raw = `HashKey=${credentials.hashKey}&${values}&HashIV=${credentials.hashIv}`;
  return createHash("sha256").update(ecpayEncode(raw), "utf8").digest("hex").toUpperCase();
}

export function verifyEcpayCheckMacValue(
  fields: EcpayFields,
  credentials: Pick<EcpayCredentials, "hashKey" | "hashIv">,
): boolean {
  const supplied = fields.CheckMacValue;
  if (typeof supplied !== "string" || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = Buffer.from(createEcpayCheckMacValue(fields, credentials), "ascii");
  const actual = Buffer.from(supplied.toUpperCase(), "ascii");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function getEcpayRecurringCredentials(
  env: NodeJS.ProcessEnv = process.env,
): EcpayCredentials {
  const merchantId = env.ECPAY_MERCHANT_ID?.trim();
  const hashKey = env.ECPAY_HASH_KEY?.trim();
  const hashIv = env.ECPAY_HASH_IV?.trim();
  const environment = env.ECPAY_ENVIRONMENT === "production" ? "production" : "stage";
  if (!merchantId || !hashKey || !hashIv) {
    throw new Error("ECPay merchant configuration is incomplete");
  }
  return { merchantId, hashKey, hashIv, environment };
}

export function buildEcpayRecurringCheckout(input: {
  credentials: EcpayCredentials;
  merchantTradeNo: string;
  tradeDate: string;
  amount: number;
  itemName: string;
  returnUrl: string;
  periodReturnUrl: string;
  clientBackUrl: string;
}) {
  if (!/^[A-Za-z0-9]{1,20}$/.test(input.merchantTradeNo)) {
    throw new Error("Invalid ECPay merchant trade number");
  }
  if (!Number.isSafeInteger(input.amount) || input.amount < 1) {
    throw new Error("Invalid ECPay recurring amount");
  }
  for (const value of [input.returnUrl, input.periodReturnUrl, input.clientBackUrl]) {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && input.credentials.environment === "production") {
      throw new Error("Production ECPay callbacks require HTTPS");
    }
  }

  // Use a long-running monthly recurring order so the agreed month-to-month
  // renewal after the 12-month minimum can continue until the merchant cancels it.
  const fields: EcpayFields = {
    MerchantID: input.credentials.merchantId,
    MerchantTradeNo: input.merchantTradeNo,
    MerchantTradeDate: input.tradeDate,
    PaymentType: "aio",
    TotalAmount: input.amount,
    TradeDesc: "蒸管家月繳訂閱",
    ItemName: input.itemName,
    ReturnURL: input.returnUrl,
    ChoosePayment: "Credit",
    EncryptType: 1,
    PeriodAmount: input.amount,
    PeriodType: "M",
    Frequency: 1,
    ExecTimes: 999,
    PeriodReturnURL: input.periodReturnUrl,
    ClientBackURL: input.clientBackUrl,
  };
  fields.CheckMacValue = createEcpayCheckMacValue(fields, input.credentials);
  return { endpoint: ECPAY_ENDPOINTS[input.credentials.environment], fields };
}
