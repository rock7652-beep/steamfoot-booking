import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { liffMessages } from "@/lib/liff/messages";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("LIFF member booking pending-payment presentation", () => {
  it("shows the customer-facing pending-payment explanation instead of the generic error", () => {
    const form = source("app/(liff)/liff/member-booking/member-booking-form.tsx");

    expect(liffMessages.error.paymentPending).toBe(
      "此方案尚待店家確認付款，暫時無法預約，請聯繫店家確認。",
    );
    expect(form).toContain('case "payment_pending":');
    expect(form).toContain("message: liffMessages.error.paymentPending");
    expect(form).not.toContain(
      'case "payment_pending":\n        setState({\n          kind: "blocked",\n          wallet: walletCarry,\n          message: liffMessages.error.serviceUnavailable',
    );
  });
});
