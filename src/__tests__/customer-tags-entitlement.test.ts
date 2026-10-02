import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, featureAllowed } = vi.hoisted(() => ({
  findFirst: vi.fn(), featureAllowed: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findFirst } } }));
vi.mock("@/lib/session", () => ({ requireStaffSession: vi.fn(async () => ({ storeId: "store-a" })) }));
vi.mock("@/lib/manager-visibility", () => ({ getStoreFilter: () => ({ storeId: "store-a" }) }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: featureAllowed }));

import { getCustomerTags, getCustomerTagsAndScripts } from "@/server/queries/customer-tags";

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({
    storeId: "store-a", name: "範例顧客", firstVisitAt: new Date(),
    lastVisitAt: new Date(), birthday: null, planWallets: [], bookings: [], transactions: [],
  });
  featureAllowed.mockResolvedValue(true);
});

describe("customer tags independent entitlement", () => {
  it("checks the authorized customer's own store and returns tags when enabled", async () => {
    expect(await getCustomerTags("customer-a")).toEqual(expect.arrayContaining([expect.objectContaining({ id: "new_customer" })]));
    expect(featureAllowed).toHaveBeenCalledWith("store-a", "customer_tags");
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "customer-a", storeId: "store-a" });
  });
  it("returns no tags when disabled while preserving the separate script feature", async () => {
    const enabled = await getCustomerTagsAndScripts("customer-a");
    featureAllowed.mockResolvedValue(false);
    expect(await getCustomerTags("customer-a")).toEqual([]);
    const disabled = await getCustomerTagsAndScripts("customer-a");
    expect(disabled.tags).toEqual([]);
    expect(disabled.scripts).toEqual(enabled.scripts);
    expect(enabled.tags.length).toBeGreaterThan(0);
  });
  it("does not resolve entitlements for customers outside the visible store", async () => {
    findFirst.mockResolvedValue(null);
    expect(await getCustomerTags("invisible")).toEqual([]);
    expect(await getCustomerTagsAndScripts("invisible")).toEqual({ tags: [], scripts: [] });
    expect(featureAllowed).not.toHaveBeenCalled();
  });
});
