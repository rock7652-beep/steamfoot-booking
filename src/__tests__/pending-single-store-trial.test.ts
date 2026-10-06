import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ store: vi.fn(), industry: vi.fn(), customer: vi.fn(), staff: vi.fn(), booking: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { count: m.customer }, staff: { count: m.staff }, booking: { count: m.booking }, shopConfig: { findUnique: m.config } } }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { courseBooking: { count: m.booking } } }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { spaBooking: { count: m.booking } } }));
vi.mock("@/lib/store-plan", () => ({ getStoreForPlanByStoreId: m.store }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: m.industry }));
import { getTrialStatus, checkBookingLimit, checkCustomerLimit } from "@/lib/shop-config";
import { singleStoreTrialSummary } from "@/lib/single-store-trial";
import { TrialProgressBar } from "@/components/feature-gate";

const pending = { plan: "EXPERIENCE", planStatus: "TRIAL", planEffectiveAt: null, planExpiresAt: null,
  maxStaffOverride: null, maxCustomersOverride: null, maxMonthlyBookingsOverride: null,
  maxMonthlyReportsOverride: null, maxReminderSendsOverride: null, maxStoresOverride: null };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T05:00:00Z"));
  m.store.mockResolvedValue(pending); m.industry.mockResolvedValue("course");
  m.customer.mockResolvedValue(2); m.staff.mockResolvedValue(1); m.booking.mockResolvedValue(3);
});
afterEach(() => vi.useRealTimers());

describe("unactivated 30 day trials", () => {
  it.each(["course", "steamfoot", "spa"])("does not start the %s clock from store creation", async industry => {
    m.industry.mockResolvedValue(industry);
    vi.setSystemTime(new Date("2027-10-06T05:00:00Z"));
    const trial = await getTrialStatus("pending-store");
    expect(trial).toMatchObject({ pendingActivation: true, trialDays: 30, trialExpired: false, expiresOn: null, stage: "normal", canCreateBooking: true, canCreateCustomer: true });
    expect(m.config).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(React.createElement(TrialProgressBar, { trial }));
    expect(html).toContain("待啟用・30 天試用");
    expect(html).not.toContain("剩餘 30 天");
    expect(html).not.toContain("14 天");
    expect(html).not.toContain("已到期");
  });
  it("uses the same scoped quotas for preparation UI and server checks", async () => {
    m.customer.mockResolvedValue(100); m.booking.mockResolvedValue(100);
    expect(await checkCustomerLimit("pending-store")).toEqual({ allowed: false, current: 100, limit: 100 });
    expect(await checkBookingLimit("pending-store")).toEqual({ allowed: false, current: 100, limit: 100 });
    expect(m.customer).toHaveBeenCalledWith({ where: { storeId: "pending-store" } });
    expect(m.config).not.toHaveBeenCalled();
  });
  it("keeps explicit activation dates and counts the last Taipei day inclusively", async () => {
    const store = { ...pending, planEffectiveAt: new Date("2026-10-05T16:00:00Z"), planExpiresAt: new Date("2026-11-03T16:00:00Z") };
    m.store.mockResolvedValue(store);
    expect(singleStoreTrialSummary(store, "2026-10-06")).toMatchObject({ trialDays: 30, daysRemaining: 30, expiresOn: "2026-11-04", label: "剩餘 30 天" });
    vi.setSystemTime(new Date("2026-11-04T15:59:59Z"));
    expect(await getTrialStatus("store")).toMatchObject({ pendingActivation: false, daysRemaining: 1, trialExpired: false });
    vi.setSystemTime(new Date("2026-11-04T16:00:00Z"));
    expect(await getTrialStatus("store")).toMatchObject({ daysRemaining: 0, trialExpired: true, canCreateBooking: false, canCreateCustomer: false });
    const html = renderToStaticMarkup(React.createElement(TrialProgressBar, { trial: await getTrialStatus("store") }));
    expect(html).toContain("到期日 2026-11-04");
  });
  it("does not reinterpret paid, cancelled or legacy active plans as pending trials", () => {
    for (const store of [{ ...pending, plan: "BASIC" }, { ...pending, planStatus: "ACTIVE" }, { ...pending, planStatus: "EXPIRED" }, { ...pending, planStatus: "CANCELLED" }]) {
      expect(singleStoreTrialSummary(store)).toBeNull();
    }
  });
});
