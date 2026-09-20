import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/server/actions/public-trial-booking", () => ({
  fetchPublicTrialMonth: vi.fn(), fetchPublicTrialSlots: vi.fn(), submitPublicTrialBooking: vi.fn(),
}));
import { ZhubeiTrialBookingForm } from "@/app/pricing/experience/zhubei/book/zhubei-trial-booking-form";

describe("identity-first trial booking", () => {
  it("opens the LIFF identity bridge directly without a chat round trip", () => {
    const html = renderToStaticMarkup(createElement(ZhubeiTrialBookingForm, { storeSlug: "zhubei", lineTrialPilot: true }));
    expect(html).toContain("正在開啟體驗預約");
    expect(html).toContain('href="https://liff.line.me/2010761154-i4DO3oFO"');
    expect(html).not.toContain("oaMessage");
    expect(html).not.toContain("開始體驗預約");
    expect(html).not.toContain("送出聊天室");
    expect(html).not.toContain('id="trial-phone"');
    expect(html).not.toContain('id="trial-name"');
  });
  it.each(["zhubei", "hsinchu", "taichung"] as const)("preserves the normal public form for %s", storeSlug => {
    const html = renderToStaticMarkup(createElement(ZhubeiTrialBookingForm, { storeSlug }));
    expect(html).toContain('id="trial-phone"');
    expect(html).not.toContain("用 LINE 輕鬆預約");
  });
  it.each(["hsinchu", "taichung"] as const)("does not enable the pilot outside zhubei: %s", storeSlug => {
    const html = renderToStaticMarkup(createElement(ZhubeiTrialBookingForm, { storeSlug, lineTrialPilot: true }));
    expect(html).toContain('id="trial-phone"');
  });
  it("displays the original form after entry; the server still verifies it on submission", () => {
    const html = renderToStaticMarkup(createElement(ZhubeiTrialBookingForm, { entry: "opaque-entry", lineTrialPilot: true }));
    expect(html).toContain('id="trial-phone"');
    expect(html).not.toContain("用 LINE 輕鬆預約");
  });
});
