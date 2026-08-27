import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellSource = readFileSync("src/app/(liff)/liff/liff-shell.tsx", "utf8");
const walletsSource = readFileSync(
  "src/app/(liff)/liff/wallets/wallets-list.tsx",
  "utf8",
);
const messagesSource = readFileSync("src/lib/liff/messages.ts", "utf8");
const shopSource = readFileSync(
  "src/app/(liff)/liff/wallets/shop/page.tsx",
  "utf8",
);
const checkoutSource = readFileSync(
  "src/app/(liff)/liff/wallets/shop/[planId]/page.tsx",
  "utf8",
);

describe("LIFF wallet state and purchase entry contract", () => {
  it("does not turn a failed wallet response into a successful zero balance", () => {
    expect(shellSource).toContain('walletsStatus: "ok" | "error"');
    expect(shellSource).toContain(
      'walletsStatus: wallets?.status === "ok" ? "ok" : "error"',
    );
    expect(shellSource).toContain(
      'const walletsAvailable = memberSummary.walletsStatus === "ok"',
    );
    expect(shellSource).toContain("方案資料暫時無法讀取");
  });

  it("does not offer member booking until wallet availability is confirmed", () => {
    expect(shellSource).toContain(
      "totalBookable > 0 || makeupCredits.length > 0",
    );
    expect(shellSource).toContain("請重新讀取資料");
  });

  it("keeps purchase and renewal inside the store-scoped LIFF flow", () => {
    const purchaseHref = "/s/${storeSlug}/liff/wallets/shop";
    expect(shellSource).toContain(purchaseHref);
    expect(walletsSource).toContain(purchaseHref);
    expect(walletsSource).not.toContain("/my-bookings?tab=plans");
    expect(shellSource).not.toContain("/my-bookings?tab=plans");
    expect(shopSource).toContain("/liff/wallets/shop/${plan.id}");
    expect(checkoutSource).toContain("/liff/wallets/shop/thank-you");
    expect(checkoutSource).not.toContain("/book/shop/thank-you");
    expect(messagesSource).toContain('ctaPurchasePlan: "購買方案"');
    expect(messagesSource).toContain('ctaRenewPlan: "購買／續購方案"');
  });
});
