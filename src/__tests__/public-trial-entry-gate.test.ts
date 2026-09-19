import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolvePublicTrialLiffConfig } from "@/lib/liff/public-trial-config";
vi.mock("@/server/actions/public-trial-booking", () => ({
  fetchPublicTrialMonth: vi.fn(), fetchPublicTrialSlots: vi.fn(), submitPublicTrialBooking: vi.fn(),
}));
import { ZhubeiTrialBookingForm } from "@/app/pricing/experience/zhubei/book/zhubei-trial-booking-form";

describe("identity-first trial booking", () => {
  it.each(["zhubei", "hsinchu", "taichung"] as const)("uses the correct LINE entry before collecting data: %s", storeSlug => {
    const html = renderToStaticMarkup(createElement(ZhubeiTrialBookingForm, { storeSlug }));
    expect(html).toContain("先確認 LINE，再預約體驗");
    expect(html).toContain(`https://liff.line.me/${resolvePublicTrialLiffConfig(storeSlug)!.liffId}`);
    expect(html).not.toContain('id="trial-phone"');
    expect(html).not.toContain('id="trial-name"');
  });
  it("displays the original form after entry; the server still verifies it on submission", () => {
    const html = renderToStaticMarkup(createElement(ZhubeiTrialBookingForm, { entry: "opaque-entry" }));
    expect(html).toContain('id="trial-phone"');
    expect(html).not.toContain("先確認 LINE，再預約體驗");
  });
});
