import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  headers: vi.fn(),
  cookies: vi.fn(),
  storeFindUnique: vi.fn(),
  identityLinkFindMany: vi.fn(),
  customerFindFirst: vi.fn(),
  customerFindUnique: vi.fn(),
  staffFindUnique: vi.fn(),
}));

vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
  cookies: mocks.cookies,
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  prisma: {
    store: { findUnique: mocks.storeFindUnique },
    customerIdentityLink: { findMany: mocks.identityLinkFindMany },
    customer: {
      findFirst: mocks.customerFindFirst,
      findUnique: mocks.customerFindUnique,
    },
    staff: { findUnique: mocks.staffFindUnique },
  },
}));

import { getCurrentUser } from "@/lib/session";

const staleCustomerSession = {
  id: "user-zhubei",
  name: "張佳君",
  email: null,
  role: "CUSTOMER",
  staffId: null,
  customerId: null,
  storeId: null,
  storeSlug: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { ...staleCustomerSession } });
  mocks.headers.mockResolvedValue({
    get: (name: string) => (name === "x-store-slug" ? "zhubei" : null),
  });
  mocks.cookies.mockResolvedValue({ get: () => undefined });
  mocks.storeFindUnique.mockResolvedValue({ id: "store-zhubei", slug: "zhubei" });
  mocks.identityLinkFindMany.mockResolvedValue([]);
  mocks.customerFindFirst.mockResolvedValue(null);
});

describe("getCurrentUser customer identity recovery", () => {
  it("recovers customerId from the same-store CustomerIdentityLink", async () => {
    mocks.identityLinkFindMany.mockResolvedValue([{
      id: "link-zhubei",
      userId: "user-zhubei",
      storeId: "store-zhubei",
      provider: "line",
      customer: {
        id: "customer-zhubei",
        userId: "user-zhubei",
        storeId: "store-zhubei",
        mergedIntoCustomerId: null,
        store: {
          id: "store-zhubei",
          name: "暖暖蒸足",
          slug: "zhubei",
          operatingStatus: "ACTIVE",
        },
      },
    }]);

    await expect(getCurrentUser()).resolves.toEqual(
      expect.objectContaining({
        id: "user-zhubei",
        customerId: "customer-zhubei",
        storeId: "store-zhubei",
        storeSlug: "zhubei",
      }),
    );

    expect(mocks.identityLinkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-zhubei" },
      }),
    );
    expect(mocks.customerFindFirst).not.toHaveBeenCalled();
  });

  it("falls back to the same-store legacy Customer.userId link", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      id: "legacy-customer",
      storeId: "store-zhubei",
      store: { slug: "zhubei" },
    });

    await expect(getCurrentUser()).resolves.toEqual(
      expect.objectContaining({
        customerId: "legacy-customer",
        storeId: "store-zhubei",
        storeSlug: "zhubei",
      }),
    );

    expect(mocks.customerFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-zhubei",
        storeId: "store-zhubei",
        mergedIntoCustomerId: null,
      },
      select: {
        id: true,
        storeId: true,
        store: { select: { slug: true } },
      },
    });
  });

  it("does not query recovery tables when the JWT already has customerId", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        ...staleCustomerSession,
        customerId: "customer-existing",
        storeId: "store-zhubei",
        storeSlug: "zhubei",
      },
    });

    await expect(getCurrentUser()).resolves.toEqual(
      expect.objectContaining({ customerId: "customer-existing" }),
    );

    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.storeFindUnique).not.toHaveBeenCalled();
    expect(mocks.identityLinkFindMany).not.toHaveBeenCalled();
    expect(mocks.customerFindFirst).not.toHaveBeenCalled();
  });

  it("fails closed for a merged identity instead of reviving the old customer", async () => {
    mocks.identityLinkFindMany.mockResolvedValue([{
      id: "link-merged",
      userId: "user-zhubei",
      storeId: "store-zhubei",
      provider: "line",
      customer: {
        id: "merged-customer",
        userId: null,
        storeId: "store-zhubei",
        mergedIntoCustomerId: "canonical-customer",
        store: {
          id: "store-zhubei",
          name: "暖暖蒸足",
          slug: "zhubei",
          operatingStatus: "ACTIVE",
        },
      },
    }]);

    await expect(getCurrentUser()).resolves.toEqual(
      expect.objectContaining({ customerId: null }),
    );
    expect(mocks.customerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ mergedIntoCustomerId: null }),
      }),
    );
  });
});
