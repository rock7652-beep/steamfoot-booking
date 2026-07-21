import { describe, expect, it } from "vitest";
import { summarizeCentralMemberReadiness } from "@/server/services/central-member-readiness";

describe("summarizeCentralMemberReadiness", () => {
  it("uses verified identity links for cross-store central users", () => {
    const summary = summarizeCentralMemberReadiness(
      [
        { id: "c1", storeId: "a", phone: "0911000000", userId: "u1", mergedIntoCustomerId: null },
        { id: "c2", storeId: "b", phone: "0911000000", userId: null, mergedIntoCustomerId: null },
      ],
      [
        { customerId: "c1", storeId: "a", userId: "u1", provider: "line" },
        { customerId: "c2", storeId: "b", userId: "u1", provider: "line" },
      ],
    );

    expect(summary.centralUsersAcrossMultipleStores).toBe(1);
    expect(summary.customersWithVerifiedLoginLink).toBe(2);
    expect(summary.providerLinks).toEqual({ line: 2 });
  });

  it("reports same-phone different-user rows as conflicts without linking them", () => {
    const summary = summarizeCentralMemberReadiness(
      [
        { id: "c1", storeId: "a", phone: "0911000000", userId: "u1", mergedIntoCustomerId: null },
        { id: "c2", storeId: "b", phone: "0911000000", userId: "u2", mergedIntoCustomerId: null },
      ],
      [],
    );

    expect(summary.crossStorePhoneCandidateGroups).toBe(1);
    expect(summary.crossStorePhoneConflictGroups).toBe(1);
    expect(summary.centralUsersAcrossMultipleStores).toBe(0);
  });

  it("excludes merged sources and rejects cross-store link drift", () => {
    const summary = summarizeCentralMemberReadiness(
      [
        { id: "target", storeId: "a", phone: "1", userId: "u1", mergedIntoCustomerId: null },
        { id: "source", storeId: "a", phone: "1", userId: null, mergedIntoCustomerId: "target" },
      ],
      [{ customerId: "target", storeId: "b", userId: "u1", provider: "google" }],
    );

    expect(summary.activeCustomers).toBe(1);
    expect(summary.customersWithVerifiedLoginLink).toBe(0);
    expect(summary.invalidStoreLinkCount).toBe(1);
    expect(summary.providerLinks).toEqual({});
  });
});
