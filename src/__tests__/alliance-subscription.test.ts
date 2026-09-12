import { describe, expect, it } from "vitest";
import { assertOrganizationCapacity, branchCapacity, managementMonthlyFee, organizationSubscriptionRows, type OrganizationStore } from "@/lib/alliance-subscription";
const store = (id: string, parentStoreId: string | null = null, plan = "BASIC", maxStoresOverride: number | null = null): OrganizationStore => ({ id, name: id, parentStoreId, plan, maxStoresOverride });
describe("independent HQ and branch subscriptions", () => {
  it("includes one branch and charges management only for extra purchased slots", () => {
    expect(branchCapacity(store("hq", null, "ALLIANCE"))).toBe(1);
    expect([1, 2, 3, 30, 31].map(managementMonthlyFee)).toEqual([4990, 5990, 6990, 33990, 34990]);
    expect(managementMonthlyFee(3) + 3 * 2490).toBe(14460);
  });
  it("supports over 30 branches without pooling unrelated organizations", () => {
    const rows = [store("hq-a", null, "ALLIANCE", 32), store("hq-b", null, "ALLIANCE"), store("other", "hq-b"), ...Array.from({ length: 31 }, (_, i) => store(`a${i}`, "hq-a", i % 2 ? "GROWTH" : "BASIC"))];
    expect(() => assertOrganizationCapacity(rows, "hq-a")).not.toThrow();
    expect(organizationSubscriptionRows(rows).map(r => [r.branchCount, r.purchasedBranches])).toEqual([[31, 31], [1, 1]]);
    expect(rows.find(s => s.id === "a0")?.plan).toBe("BASIC");
    expect(() => assertOrganizationCapacity([...rows, store("over", "hq-a")], "hq-a")).toThrow("額度不足");
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
