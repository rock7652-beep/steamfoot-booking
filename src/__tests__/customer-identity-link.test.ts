import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIdentityLinkUpsert = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customerIdentityLink: {
      upsert: (...args: unknown[]) => mockIdentityLinkUpsert(...args),
    },
  },
}));

import { upsertCustomerIdentityLink } from "@/server/services/customer-identity-link";

const USER_ID = "user-line";
const LINE_USER_ID = "U_same_line_user";

beforeEach(() => {
  vi.clearAllMocks();
  mockIdentityLinkUpsert.mockResolvedValue({});
});

describe("upsertCustomerIdentityLink", () => {
  it("allows the same LINE providerAccountId to be linked independently per store", async () => {
    await expect(
      upsertCustomerIdentityLink({
        userId: USER_ID,
        storeId: "store-zhubei",
        customerId: "cust-zhubei",
        provider: "line",
        providerAccountId: LINE_USER_ID,
        lineUserId: LINE_USER_ID,
      }),
    ).resolves.toEqual({ status: "upserted" });

    await expect(
      upsertCustomerIdentityLink({
        userId: USER_ID,
        storeId: "store-hsinchu",
        customerId: "cust-hsinchu",
        provider: "line",
        providerAccountId: LINE_USER_ID,
        lineUserId: LINE_USER_ID,
      }),
    ).resolves.toEqual({ status: "upserted" });

    expect(mockIdentityLinkUpsert).toHaveBeenCalledTimes(2);
    expect(mockIdentityLinkUpsert.mock.calls[0][0]).toMatchObject({
      where: {
        uq_customer_identity_provider_store: {
          provider: "line",
          providerAccountId: LINE_USER_ID,
          storeId: "store-zhubei",
        },
      },
      create: {
        userId: USER_ID,
        storeId: "store-zhubei",
        customerId: "cust-zhubei",
      },
    });
    expect(mockIdentityLinkUpsert.mock.calls[1][0]).toMatchObject({
      where: {
        uq_customer_identity_provider_store: {
          provider: "line",
          providerAccountId: LINE_USER_ID,
          storeId: "store-hsinchu",
        },
      },
      create: {
        userId: USER_ID,
        storeId: "store-hsinchu",
        customerId: "cust-hsinchu",
      },
    });
  });

  it("does not write a link when required identity fields are missing", async () => {
    await expect(
      upsertCustomerIdentityLink({
        userId: USER_ID,
        storeId: "",
        customerId: "cust",
        provider: "line",
        providerAccountId: LINE_USER_ID,
      }),
    ).resolves.toEqual({ status: "skipped_missing_input" });

    expect(mockIdentityLinkUpsert).not.toHaveBeenCalled();
  });

  it("returns error status instead of throwing when Prisma upsert fails", async () => {
    mockIdentityLinkUpsert.mockRejectedValueOnce(new Error("unique conflict"));

    const result = await upsertCustomerIdentityLink({
      userId: USER_ID,
      storeId: "store-zhubei",
      customerId: "cust-zhubei",
      provider: "line",
      providerAccountId: LINE_USER_ID,
    });

    expect(result).toEqual({ status: "error", error: "unique conflict" });
  });
});
