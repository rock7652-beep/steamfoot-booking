import { describe, expect, it } from "vitest";
import {
  buildEcpayRecurringCheckout,
  createEcpayCheckMacValue,
  verifyEcpayCheckMacValue,
} from "@/lib/ecpay-recurring";

const credentials = {
  merchantId: "3002607",
  hashKey: "pwFHCqoQZGmho4w6",
  hashIv: "EkRm7iFT261dpevs",
  environment: "stage" as const,
};

describe("ECPay recurring payment", () => {
  it("matches ECPay's published SHA-256 CheckMacValue example", () => {
    const fields = {
      TradeDesc: "促銷方案",
      PaymentType: "aio",
      MerchantTradeDate: "2023/03/12 15:30:23",
      MerchantTradeNo: "ecpay20230312153023",
      MerchantID: "3002607",
      ReturnURL: "https://www.ecpay.com.tw/receive.php",
      ItemName: "Apple iphone 15",
      TotalAmount: 30000,
      ChoosePayment: "ALL",
      EncryptType: 1,
    };
    expect(createEcpayCheckMacValue(fields, credentials)).toBe(
      "6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840",
    );
    expect(verifyEcpayCheckMacValue({
      ...fields,
      CheckMacValue: createEcpayCheckMacValue(fields, credentials),
    }, credentials)).toBe(true);
  });

  it("rejects modified or malformed payment notifications", () => {
    const fields = { MerchantTradeNo: "abc123", RtnCode: "1" };
    expect(verifyEcpayCheckMacValue({ ...fields, CheckMacValue: "0".repeat(64) }, credentials)).toBe(false);
    expect(verifyEcpayCheckMacValue({ ...fields, RtnCode: "0", CheckMacValue: createEcpayCheckMacValue(fields, credentials) }, credentials)).toBe(false);
    expect(verifyEcpayCheckMacValue({ ...fields, CheckMacValue: "bad" }, credentials)).toBe(false);
  });

  it("creates a monthly recurring order with fixed amount, bounded execution count and separate callbacks", () => {
    const checkout = buildEcpayRecurringCheckout({
      credentials,
      merchantTradeNo: "steamfoot1234567890",
      tradeDate: "2026/10/13 14:30:00",
      amount: 2980,
      itemName: "蒸管家展店版月繳",
      returnUrl: "https://steamfoot.com/api/payments/ecpay/recurring/return",
      periodReturnUrl: "https://steamfoot.com/api/payments/ecpay/recurring/period",
      clientBackUrl: "https://steamfoot.com/checkout/monthly/result",
    });
    expect(checkout.endpoint).toBe("https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5");
    expect(checkout.fields).toMatchObject({
      MerchantID: "3002607",
      TotalAmount: 2980,
      ChoosePayment: "Credit",
      PeriodAmount: 2980,
      PeriodType: "M",
      Frequency: 1,
      ExecTimes: 999,
    });
    expect(checkout.fields.CheckMacValue).toBe(createEcpayCheckMacValue(checkout.fields, credentials));
  });

  it("rejects invalid amounts, trade numbers and insecure production callback URLs", () => {
    const base = {
      credentials,
      merchantTradeNo: "trade123",
      tradeDate: "2026/10/13 14:30:00",
      amount: 2980,
      itemName: "月繳",
      returnUrl: "https://example.com/return",
      periodReturnUrl: "https://example.com/period",
      clientBackUrl: "https://example.com/back",
    };
    expect(() => buildEcpayRecurringCheckout({ ...base, amount: 0 })).toThrow(/amount/i);
    expect(() => buildEcpayRecurringCheckout({ ...base, merchantTradeNo: "全形編號" })).toThrow(/trade number/i);
    expect(() => buildEcpayRecurringCheckout({
      ...base,
      credentials: { ...credentials, environment: "production" },
      returnUrl: "http://example.com/return",
    })).toThrow(/HTTPS/i);
  });
});
