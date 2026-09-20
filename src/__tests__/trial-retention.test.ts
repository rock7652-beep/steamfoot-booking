import { afterEach, describe, expect, it, vi } from "vitest";
import { getTrialRetention } from "@/lib/trial-retention";

const store = Object.freeze({ plan: "EXPERIENCE", planStatus: "TRIAL", planEffectiveAt: new Date("2026-09-01T00:00:00Z"), planExpiresAt: new Date("2026-09-30T00:00:00Z") });
afterEach(() => vi.useRealTimers());
describe("30 calendar days after trial expiry", () => {
  it.each([
    ["2026-09-30T15:59:59.999Z", "TRIAL"],
    ["2026-09-30T16:00:00.000Z", "RETAINED"],
    ["2026-10-29T16:00:00.000Z", "RETAINED"],
    ["2026-10-30T15:59:59.999Z", "RETAINED"],
    ["2026-10-30T16:00:00.000Z", "PENDING_CLEANUP"],
  ])("%s uses Taiwan midnight: %s", (now, state) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(now));
    expect(getTrialRetention(store)).toEqual({ state, retainThrough: "2026-10-30", cleanupFrom: "2026-10-31" });
  });
  it.each(["TRIAL", "EXPIRED", "PAYMENT_PENDING"])("does not reset the deadline when status changes to %s", planStatus => {
    expect(getTrialRetention({ ...store, planStatus }, "2026-10-31")?.state).toBe("PENDING_CLEANUP");
  });
  it.each([
    ["2028-01-31", "2028-03-01", "2028-03-02"],
    ["2026-12-31", "2027-01-30", "2027-01-31"],
  ])("handles calendar boundary after %s", (expiry, end, cleanup) => {
    expect(getTrialRetention({ ...store, planExpiresAt: new Date(`${expiry}T00:00:00Z`) }, end)).toEqual({ state: "RETAINED", retainThrough: end, cleanupFrom: cleanup });
  });
  it.each(["BASIC", "GROWTH", "ALLIANCE"])("upgrading to %s exits retention without changing the input", plan => {
    expect(getTrialRetention({ ...store, plan, planStatus: "ACTIVE" }, "2026-10-31")).toBeNull();
    expect(store.plan).toBe("EXPERIENCE");
    expect(store.planExpiresAt.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
  it("does not invent a cleanup date for undated legacy stores", () => {
    expect(getTrialRetention({ plan: "EXPERIENCE" })).toBeNull();
  });
});
