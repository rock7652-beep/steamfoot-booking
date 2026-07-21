import { describe, expect, it } from "vitest";
import {
  resolveCentralMemberLinks,
  type CentralMemberLinkRow,
} from "@/server/services/central-member-resolver";

function link(
  overrides: Partial<CentralMemberLinkRow> &
    Pick<CentralMemberLinkRow, "id" | "storeId" | "provider">,
): CentralMemberLinkRow {
  const customerId = overrides.customer?.id ?? `customer-${overrides.storeId}`;
  return {
    id: overrides.id,
    userId: overrides.userId ?? "user-1",
    storeId: overrides.storeId,
    provider: overrides.provider,
    customer: {
      id: customerId,
      name: overrides.customer?.name ?? "測試會員",
      userId: overrides.customer?.userId ?? null,
      storeId: overrides.customer?.storeId ?? overrides.storeId,
      mergedIntoCustomerId: overrides.customer?.mergedIntoCustomerId ?? null,
      store: {
        id: overrides.customer?.store.id ?? overrides.storeId,
        name: overrides.customer?.store.name ?? `Store ${overrides.storeId}`,
        slug: overrides.customer?.store.slug ?? overrides.storeId,
        operatingStatus: overrides.customer?.store.operatingStatus ?? "ACTIVE",
      },
    },
  };
}

describe("resolveCentralMemberLinks", () => {
  it("returns the same verified user membership across stores", () => {
    const result = resolveCentralMemberLinks("user-1", [
      link({ id: "l1", storeId: "zhubei", provider: "line" }),
      link({ id: "l2", storeId: "taichung", provider: "line" }),
    ]);

    expect(result.conflicts).toEqual([]);
    expect(result.memberships.map((row) => row.storeId).sort()).toEqual([
      "taichung",
      "zhubei",
    ]);
  });

  it("deduplicates providers that agree on one customer", () => {
    const customer = {
      id: "customer-a",
      name: "測試會員",
      userId: "user-1",
      storeId: "a",
      mergedIntoCustomerId: null,
      store: { id: "a", name: "A", slug: "a", operatingStatus: "ACTIVE" },
    };
    const result = resolveCentralMemberLinks("user-1", [
      link({ id: "l1", storeId: "a", provider: "line", customer }),
      link({ id: "l2", storeId: "a", provider: "google", customer }),
    ]);

    expect(result.memberships).toHaveLength(1);
    expect(result.memberships[0].providers).toEqual(["google", "line"]);
  });

  it("does not infer any membership without a verified link", () => {
    expect(resolveCentralMemberLinks("user-1", [])).toEqual({
      memberships: [],
      conflicts: [],
    });
  });

  it("fails closed when providers point at different customers in one store", () => {
    const result = resolveCentralMemberLinks("user-1", [
      link({ id: "l1", storeId: "a", provider: "line" }),
      link({
        id: "l2",
        storeId: "a",
        provider: "google",
        customer: {
          id: "other",
          name: "其他會員",
          userId: null,
          storeId: "a",
          mergedIntoCustomerId: null,
          store: { id: "a", name: "A", slug: "a", operatingStatus: "ACTIVE" },
        },
      }),
    ]);

    expect(result.memberships).toEqual([]);
    expect(result.conflicts).toEqual([
      { storeId: "a", reason: "multiple_customers_in_store" },
    ]);
  });

  it.each([
    ["merged_customer", { mergedIntoCustomerId: "target" }],
    ["customer_linked_to_another_user", { userId: "user-2" }],
    ["link_store_mismatch", { storeId: "other" }],
  ] as const)("rejects %s", (reason, customerOverride) => {
    const base = link({ id: "l1", storeId: "a", provider: "line" });
    const result = resolveCentralMemberLinks("user-1", [
      { ...base, customer: { ...base.customer, ...customerOverride } },
    ]);

    expect(result.memberships).toEqual([]);
    expect(result.conflicts).toEqual([{ storeId: "a", reason }]);
  });
});
