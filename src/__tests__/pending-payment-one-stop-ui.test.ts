import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  "src/app/(dashboard)/dashboard/payments/page.tsx",
  "utf8"
);
const confirmSource = readFileSync(
  "src/app/(dashboard)/dashboard/payments/confirm-button.tsx",
  "utf8"
);
const querySource = readFileSync("src/server/queries/transaction.ts", "utf8");

describe("待確認付款一站式操作", () => {
  it("待核對匯款可直接確認，不再把查看顧客資料當成必經步驟", () => {
    expect(pageSource).toContain('status === "complete" || status === "review"');
    expect(confirmSource).toContain("確認已入帳");
    expect(pageSource).toContain("尚未入帳");
    expect(pageSource).toContain("查看顧客資料");
    expect(pageSource).not.toContain(">\n            查看資料\n");
  });

  it("缺少轉帳末碼時提醒店長先核對銀行帳戶", () => {
    expect(confirmSource).toContain("顧客未提供轉帳末碼");
    expect(confirmSource).toContain("請先核對銀行帳戶確實入帳");
  });

  it("可直接確認筆數包含待核對的匯款", () => {
    expect(querySource).toContain(
      't.rowStatus === "complete" || t.rowStatus === "review"'
    );
  });
});
