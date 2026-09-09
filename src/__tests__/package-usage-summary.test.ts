import { describe, expect, it } from "vitest";
import { packageUsageSummary } from "@/app/(dashboard)/dashboard/bookings/package-usage-summary";

const base = { people: 2, isMakeup: false, customerPlanWallet: { id: "w1" }, makeupCreditLinks: [], walletSessions: [] };
describe("package usage display", () => {
  it("shows all reserved people, not just attendees", () => {
    expect(packageUsageSummary(base)).toBe("方案 2 堂");
  });
  it("shows mixed makeup separately", () => {
    expect(packageUsageSummary({ ...base, makeupCreditLinks: [{ makeupCreditId: "m1" }] })).toBe("方案 1 堂＋補課資格 1 次");
  });
  it("supports legacy all-makeup bookings", () => {
    expect(packageUsageSummary({ ...base, isMakeup: true, customerPlanWallet: null })).toBe("補課資格 2 次");
  });
  it("rejects missing wallet", () => {
    expect(packageUsageSummary({ ...base, customerPlanWallet: null })).toContain("請先核對");
  });
  it("rejects mismatched reserved ledger", () => {
    expect(packageUsageSummary({ ...base, walletSessions: [{ status: "RESERVED" }] })).toContain("請先核對");
  });
  it("ignores released ledger history", () => {
    expect(packageUsageSummary({ ...base, walletSessions: [{ status: "RELEASED" }] })).toBe("方案 2 堂");
  });
  it("rejects excess makeup links", () => {
    expect(packageUsageSummary({ ...base, people: 1, makeupCreditLinks: [{ makeupCreditId: "m1" }, { makeupCreditId: "m2" }] })).toContain("請先核對");
  });
});
