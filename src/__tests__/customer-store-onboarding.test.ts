import { describe, expect, it } from "vitest";
import { decideCustomerStoreAccess } from "@/lib/customer-store-onboarding";

const base = {
  membershipCount: 2,
  hasCurrentMembership: false,
  sessionCustomerId: null,
  sessionStoreId: "store-hsinchu",
  sessionStoreSlug: "hsinchu",
  requestedStoreId: "store-hsinchu",
  requestedStoreSlug: "hsinchu",
  pathname: "/book",
};

describe("decideCustomerStoreAccess", () => {
  it("routes a verified new-store LINE login to that store's registration", () => {
    expect(decideCustomerStoreAccess(base)).toEqual({
      action: "onboard",
      redirectTo:
        "/s/hsinchu/profile?complete=1&next=%2Fs%2Fhsinchu%2Fbook",
    });
  });

  it("allows only the target store profile during onboarding", () => {
    expect(
      decideCustomerStoreAccess({ ...base, pathname: "/profile" }),
    ).toEqual({ action: "allow" });
  });

  it("rejects a forged or stale store mismatch", () => {
    expect(
      decideCustomerStoreAccess({
        ...base,
        sessionStoreId: "store-zhubei",
        sessionStoreSlug: "zhubei",
      }),
    ).toEqual({ action: "choose-membership" });
  });

  it("keeps existing memberships on their normal route", () => {
    expect(
      decideCustomerStoreAccess({
        ...base,
        hasCurrentMembership: true,
        sessionCustomerId: "customer-hsinchu",
      }),
    ).toEqual({ action: "allow" });
  });
});
