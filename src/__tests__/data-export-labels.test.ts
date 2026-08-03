import { describe, expect, it } from "vitest";
import {
  DATA_EXPORT_STATUS_OPTIONS,
  DATA_EXPORT_HEADERS,
  formatBookingStatus,
  formatBookingType,
  formatCustomerStage,
  formatPaymentMethod,
  formatTransactionStatus,
  formatTransactionType,
  formatWalletStatus,
  isDataExportStatus,
} from "@/lib/data-export-labels";

describe("data export Chinese labels", () => {
  it("covers every selectable Prisma status and only accepts its matching export type", () => {
    for (const [type, options] of Object.entries(DATA_EXPORT_STATUS_OPTIONS)) {
      for (const option of options) expect(isDataExportStatus(type as keyof typeof DATA_EXPORT_STATUS_OPTIONS, option.value)).toBe(true);
    }
    expect(isDataExportStatus("bookings", "SUCCESS")).toBe(false);
  });

  it("uses Traditional Chinese for every export enum and a safe fallback", () => {
    expect(formatCustomerStage("ACTIVE")).toBe("使用中");
    expect(formatTransactionStatus("VOIDED")).toBe("已作廢");
    expect(formatTransactionType("SESSION_DEDUCTION")).toBe("方案扣堂");
    expect(formatBookingStatus("NO_SHOW")).toBe("未到");
    expect(formatBookingType("FIRST_TRIAL")).toBe("首次體驗");
    expect(formatWalletStatus("EXPIRED")).toBe("已過期");
    expect(formatPaymentMethod("TRANSFER")).toBe("匯款");
    expect(formatPaymentMethod("UNPAID")).toBe("未付款");
    expect(formatPaymentMethod("FUTURE_VALUE")).toBe("未分類");
  });

  it("uses concise operational Excel columns without internal identifiers or sensitive fields", () => {
    expect(DATA_EXPORT_HEADERS.customers).toEqual(["姓名", "電話", "Email", "所屬店別", "直屬店長／顧問", "首次到訪", "最近消費", "建立時間"]);
    expect(DATA_EXPORT_HEADERS.transactions).toEqual(expect.arrayContaining(["付款方式", "現金", "匯款", "LINE Pay", "信用卡", "實收金額", "交易狀態"]));
    expect(DATA_EXPORT_HEADERS.transactions).not.toContain("交易單號");
    expect(DATA_EXPORT_HEADERS.bookings).toEqual(expect.arrayContaining(["日期", "時段", "顧客", "服務類型", "預約狀態", "人數", "服務人員"]));
    expect(DATA_EXPORT_HEADERS.wallets).toEqual(expect.arrayContaining(["顧客", "方案名稱", "購買金額", "總堂數", "剩餘堂數", "方案狀態", "開始日", "到期日"]));
  });
});
