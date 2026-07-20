import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCanonicalCustomerId, mockCustomerFindUnique } = vi.hoisted(() => ({
  mockGetCanonicalCustomerId: vi.fn(),
  mockCustomerFindUnique: vi.fn(),
}));

vi.mock("@/lib/customer-identity", () => ({
  getCanonicalCustomerIdForSession: (...args: unknown[]) =>
    mockGetCanonicalCustomerId(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
    },
  },
}));

import { getCustomerBookingEligibility } from "@/lib/customer-booking-eligibility";

const SESSION = {
  id: "user-1",
  customerId: "customer-session",
  email: "customer@example.com",
  storeId: "store-taichung",
};

describe("getCustomerBookingEligibility", () => {
  beforeEach(() => {
    mockGetCanonicalCustomerId.mockReset();
    mockCustomerFindUnique.mockReset();
    mockGetCanonicalCustomerId.mockResolvedValue("customer-canonical");
    mockCustomerFindUnique.mockResolvedValue({
      id: "customer-canonical",
      storeId: "store-taichung",
      name: "測試顧客",
      phone: "0912345678",
    });
  });

  it("fails closed before identity lookup when the session has no store", async () => {
    await expect(
      getCustomerBookingEligibility({ ...SESSION, storeId: null }),
    ).resolves.toEqual({ status: "no_customer" });

    expect(mockGetCanonicalCustomerId).not.toHaveBeenCalled();
    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
  });

  it("rejects a canonical customer from another store", async () => {
    mockCustomerFindUnique.mockResolvedValue({
      id: "customer-canonical",
      storeId: "store-zhubei",
      name: "測試顧客",
      phone: "0912345678",
    });

    await expect(getCustomerBookingEligibility(SESSION)).resolves.toEqual({
      status: "no_customer",
    });
  });

  it("rejects placeholder or incomplete profile data", async () => {
    mockCustomerFindUnique.mockResolvedValue({
      id: "customer-canonical",
      storeId: "store-taichung",
      name: "測試顧客",
      phone: "_oauth_google_12345678",
    });

    await expect(getCustomerBookingEligibility(SESSION)).resolves.toEqual({
      status: "profile_incomplete",
    });
  });

  it("returns the canonical same-store customer when the profile is complete", async () => {
    await expect(getCustomerBookingEligibility(SESSION)).resolves.toEqual({
      status: "ok",
      customerId: "customer-canonical",
      storeId: "store-taichung",
    });
  });
});
