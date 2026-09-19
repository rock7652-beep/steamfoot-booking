import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ setup: undefined as unknown }));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useState: (initial: unknown) => actual.useState(initial === null ? {
    date: "2026-09-20", time: "10:00", people: 1, expectedAmount: 499, notificationSetup: state.setup,
  } : initial) };
});
vi.mock("@/server/actions/public-trial-booking", () => ({
  fetchPublicTrialMonth: vi.fn(), fetchPublicTrialSlots: vi.fn(), submitPublicTrialBooking: vi.fn(),
}));
import { ZhubeiTrialBookingForm } from "@/app/pricing/experience/zhubei/book/zhubei-trial-booking-form";

describe("booking success separates reservation from notification setup", () => {
  it.each(["zhubei", "hsinchu", "taichung"] as const)("shows no-phone action for %s without claiming already linked", storeSlug => {
    state.setup = { status: "pending", url: "https://line.me/R/oaMessage/%40store/?test" };
    const html = renderToStaticMarkup(createElement(ZhubeiTrialBookingForm, { storeSlug }));
    expect(html).toContain("體驗預約成功");
    expect(html).toContain("LINE 通知尚未完成設定");
    expect(html).toContain("開啟 LINE 完成通知設定");
    expect(html).toContain("不用再輸入電話");
    expect(html).toContain("https://line.me/R/oaMessage/%40store/?test");
    expect(html).not.toContain("LINE 通知已連結");
  });
  it("does not ask linked customers to bind again", () => {
    state.setup = { status: "linked" };
    const html = renderToStaticMarkup(createElement(ZhubeiTrialBookingForm));
    expect(html).toContain("LINE 通知已連結");
    expect(html).not.toContain("開啟 LINE 完成通知設定");
  });
  it.each([{ status: "needs_help" }, undefined])("shows honest fallback for missing setup: %s", setup => {
    state.setup = setup;
    const html = renderToStaticMarkup(createElement(ZhubeiTrialBookingForm));
    expect(html).toContain("您的時段已保留");
    expect(html).toContain("通知身分需要門市協助確認");
    expect(html).not.toContain("LINE 通知已連結");
  });
});
