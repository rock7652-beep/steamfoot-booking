import { describe, expect, it } from "vitest";
import { buildPlanExpiryLineMessages } from "@/server/services/plan-expiry-notifications";

describe("plan expiry LINE card", () => {
  it("shows the plan, remaining sessions, expiry date and booking rule", () => {
    process.env.NEXTAUTH_URL = "https://www.steamfoot.com";
    const messages = buildPlanExpiryLineMessages({
      customerName: "曾靜慈",
      planName: "3堂",
      remainingSessions: 1,
      expiryDate: new Date("2026-08-31T00:00:00.000Z"),
      daysUntilExpiry: 7,
      storeSlug: "nuannuan",
    });
    const payload = JSON.stringify(messages);
    expect(payload).toContain("方案將於 7 天後到期");
    expect(payload).toContain("3堂");
    expect(payload).toContain("1 堂");
    expect(payload).toContain("2026/8/31");
    expect(payload).toContain("課程需於方案有效期限內完成");
    expect(payload).toContain("立即預約");
    expect(payload).toContain("/s/nuannuan/liff/member-booking");
  });
});
