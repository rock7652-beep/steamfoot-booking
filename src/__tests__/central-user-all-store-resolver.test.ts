import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCustomerFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findFirst: (...args: unknown[]) => mockCustomerFindFirst(...args),
    },
  },
}));

import { resolveCentralUserForStoreCustomer } from "@/server/services/resolve-central-user-for-store-customer";

const STORE_ID = "store-hsinchu";
const user = (id: string) => ({
  id,
  name: `User ${id}`,
  email: null,
  passwordHash: "hash",
  role: "CUSTOMER",
  status: "ACTIVE",
});
const customer = (overrides: Record<string, unknown> = {}) => ({
  id: "customer-hsinchu",
  storeId: STORE_ID,
  store: { slug: "hsinchu" },
  user: null,
  identityLinks: [],
  ...overrides,
});

beforeEach(() => {
  mockCustomerFindFirst.mockReset();
});

describe("all-store central User resolver", () => {
  it("resolves a direct Customer.userId", async () => {
    mockCustomerFindFirst.mockResolvedValueOnce(customer({ user: user("direct-user") }));

    await expect(resolveCentralUserForStoreCustomer({
      storeId: STORE_ID,
      phone: "0912345678",
    })).resolves.toMatchObject({
      status: "resolved",
      source: "customer_user",
      customer: { hasDirectUser: true },
      user: { id: "direct-user" },
    });
  });

  it("resolves an identity-link-only Customer", async () => {
    mockCustomerFindFirst.mockResolvedValueOnce(customer({
      identityLinks: [{ user: user("central-user") }],
    }));

    await expect(resolveCentralUserForStoreCustomer({
      customerId: "customer-hsinchu",
      storeId: STORE_ID,
    })).resolves.toMatchObject({
      status: "resolved",
      source: "identity_link",
      customer: { hasDirectUser: false },
      user: { id: "central-user" },
    });
  });

  it("fails closed for conflicting identity links", async () => {
    mockCustomerFindFirst.mockResolvedValueOnce(customer({
      identityLinks: [{ user: user("user-a") }, { user: user("user-b") }],
    }));

    await expect(resolveCentralUserForStoreCustomer({
      customerId: "customer-hsinchu",
      storeId: STORE_ID,
    })).resolves.toEqual({ status: "identity_conflict" });
  });

  it.each([
    ["merged Customer", { customerId: "merged-customer" }],
    ["Customer from another store", { customerId: "customer-other-store" }],
  ])("does not resolve a %s", async (_case, input) => {
    mockCustomerFindFirst.mockResolvedValueOnce(null);

    await expect(resolveCentralUserForStoreCustomer({
      ...input,
      storeId: STORE_ID,
    })).resolves.toEqual({ status: "not_found" });
    expect(mockCustomerFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: STORE_ID,
        mergedIntoCustomerId: null,
      }),
    }));
  });
});
