import { describe, expect, it } from "vitest";
import { assertOrganizationCapacity, branchCapacity, branchConnectionMonthlyFee, managementMonthlyFee, organizationSubscriptionRows, type OrganizationStore } from "@/lib/alliance-subscription";
const store = (id: string, parentStoreId: string | null = null, plan = "BASIC", maxStoresOverride: number | null = null): OrganizationStore => ({ id, name: id, parentStoreId, plan, maxStoresOverride });
describe("independent HQ and branch subscriptions", () => {
  it("charges progressive tiers for actual branches and requires quotes above 15", () => {
    expect(branchCapacity(store("hq", null, "ALLIANCE"))).toBe(1);
    expect([0, 1, 2, 3, 5, 6, 10, 15, 16, 31].map(managementMonthlyFee)).toEqual([4990, 4990, 5490, 5990, 6990, 7290, 8490, 9990, null, null]);
    expect([0, 1, 5, 6, 15, 16].map(branchConnectionMonthlyFee)).toEqual([0, 0, 2000, 2300, 5000, null]);
    for (const invalid of [-1, 1.5, NaN, Infinity]) expect(() => managementMonthlyFee(invalid)).toThrow();
    expect(managementMonthlyFee(3)! + 3 * 2490).toBe(13460);
  });
  it("supports over 30 branches without pooling unrelated organizations", () => {
    const rows = [store("hq-a", null, "ALLIANCE", 32), store("hq-b", null, "ALLIANCE"), store("other", "hq-b"), ...Array.from({ length: 31 }, (_, i) => store(`a${i}`, "hq-a", i % 2 ? "GROWTH" : "BASIC"))];
    expect(() => assertOrganizationCapacity(rows, "hq-a")).not.toThrow();
    expect(organizationSubscriptionRows(rows).map(r => [r.branchCount, r.purchasedBranches])).toEqual([[31, 31], [1, 1]]);
    expect(rows.find(s => s.id === "a0")?.plan).toBe("BASIC");
    expect(() => assertOrganizationCapacity([...rows, store("over", "hq-a")], "hq-a")).toThrow("額度不足");
  });
  it("bills connected stores independently of unused capacity and updates after removal", () => {
    const hq = store("hq", null, "ALLIANCE", 16);
    const rows = [hq, store("a", "hq"), store("b", "hq"), store("c", "b")];
    expect(organizationSubscriptionRows(rows)[0]).toMatchObject({ branchCount: 3, purchasedBranches: 15, connectionFee: 1000, monthlyFee: 5990 });
    expect(organizationSubscriptionRows(rows.slice(0, 2))[0]).toMatchObject({ branchCount: 1, connectionFee: 0, monthlyFee: 4990 });
  });
  it("counts a moved subtree at every subscribed receiving ancestor", () => {
    const rows = [store("hq", null, "ALLIANCE", 3), store("branch", "hq"), store("child", "branch"), store("grandchild", "child")];
    expect(() => assertOrganizationCapacity(rows, "child")).toThrow("額度不足");
  });
  it("rejects cycles and unknown parents", () => {
    expect(() => assertOrganizationCapacity([store("a", "b"), store("b", "a")], "a")).toThrow("循環");
    expect(() => assertOrganizationCapacity([], "missing")).toThrow("不存在");
  });
});
